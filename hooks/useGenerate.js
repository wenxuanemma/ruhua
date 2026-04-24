// hooks/useGenerate.js
//
// Two-stage pipeline with selfie caching:
//   Stage 1 — InstantID style transfer  → styledFaceUrl (cached per selfie)
//   Stage 2 — Sharp composite           → outputUrl + profileUrl
//
// Caching: if the same selfie is reused (switching painting/figure),
// Stage 1 is skipped and only Stage 2 reruns (~3s instead of ~35s).
//
// status: 'idle' | 'submitting' | 'styling' | 'compositing' | 'succeeded' | 'failed'

import { useState, useRef, useCallback } from 'react';

const POLL_INTERVAL_MS = 2500;
const MAX_POLLS = 48;

// Simple hash of a string — used as cache key for the selfie
function quickHash(str) {
  let h = 0;
  for (let i = 0; i < Math.min(str.length, 2000); i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

// LocalStorage-backed cache — persists across page reloads and deployments
// Key: 'ruhua_cache_v1', Value: { [selfieHash]: styledFaceUrl }
// Limit: keep only the 5 most recent to avoid hitting localStorage quota (~5MB)
const CACHE_KEY = 'ruhua_cache_v1';
const CACHE_MAX = 5;

function loadCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
  } catch { return {}; }
}

function saveCache(cache) {
  try {
    // Keep only the CACHE_MAX most recent entries (by insertion order)
    const entries = Object.entries(cache);
    const trimmed = Object.fromEntries(entries.slice(-CACHE_MAX));
    localStorage.setItem(CACHE_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.warn('Cache save failed (storage full?):', e.message);
  }
}


const SELFIE_KEY = 'ruhua_last_selfie_v1';

function saveLastSelfie(selfieB64) {
  try { localStorage.setItem(SELFIE_KEY, selfieB64); } catch {}
}

export function loadLastSelfie() {
  try { return localStorage.getItem(SELFIE_KEY) || null; } catch { return null; }
}

export function clearLastSelfie() {
  try { localStorage.removeItem(SELFIE_KEY); } catch {}
}

export function useGenerate() {
  const [status, setStatus]         = useState('idle');
  const [outputUrl, setOutputUrl]   = useState(null);
  const [styledUrl, setStyledUrl]   = useState(null);
  const [profileUrl, setProfileUrl] = useState(null);
  const [error, setError]           = useState(null);

  // Cache: selfieHash → styledFaceUrl
  // In-memory ref backed by localStorage for persistence across reloads/deployments
  const styledCache = useRef(loadCache());
  const currentSelfieHash = useRef(null);

  const pollRef   = useRef(null);
  const pollCount = useRef(0);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  const pollUntilDone = useCallback((predictionId) => new Promise((resolve, reject) => {
    pollCount.current = 0;
    pollRef.current = setInterval(async () => {
      pollCount.current += 1;
      if (pollCount.current > MAX_POLLS) {
        stopPolling();
        reject(new Error('Generation timed out. Please try again.'));
        return;
      }
      try {
        const res = await fetch(`/api/status?id=${predictionId}`);
        const data = await res.json();
        if (data.status === 'succeeded') { stopPolling(); resolve(data.outputUrl); }
        if (data.status === 'failed')    { stopPolling(); reject(new Error(data.error || 'Generation failed')); }
      } catch (_) {}
    }, POLL_INTERVAL_MS);
  }), []);

  const runStyleTransfer = useCallback(async ({ selfie, painting, figure, styleImageUrl, faceBounds }) => {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selfie,
        paintingId:    painting.id,
        styleImageUrl,
        dynasty:       painting.dynasty,
        faceBounds,
        faceRegion:    figure.faceRegion,  // actual painted face coords for style transfer
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Style transfer failed');
    if (data.outputUrl) return data.outputUrl;
    return pollUntilDone(data.predictionId);
  }, [pollUntilDone]);

  const runPaintify = useCallback(async (faceUrl) => {
    const res = await fetch('/api/paintify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ faceUrl }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Paintify failed');
    return data.outputUrl;
  }, []);

  const runComposite = useCallback(async ({ styledFaceUrl, painting, figure, paintingImageUrl, faceBounds }) => {
    const res = await fetch('/api/composite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        styledFaceUrl,
        paintingId:      painting.id,
        figureId:        figure.id,
        paintingImageUrl,
        dynasty:         painting.dynasty,
        faceBounds,
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Compositing failed');
    if (data.profileUrl) setProfileUrl(data.profileUrl);
    if (data.outputUrl) return data.outputUrl;
    return pollUntilDone(data.predictionId);
  }, [pollUntilDone]);

  const generate = useCallback(async ({ selfie, painting, figure, styleImageUrl, faceBounds }) => {
    stopPolling();
    setStatus('submitting');
    setOutputUrl(null);
    setProfileUrl(null);
    setError(null);

    const selfieHash = quickHash(selfie);
    const cachedStyled = styledCache.current[selfieHash];
    const isSameSelfie = cachedStyled != null;

    try {
      let styled;

      if (isSameSelfie) {
        // Cached selfie — skip InstantID, go straight to compositing
        // Brief pause so the user sees "准备中" before jumping to compositing
        styled = cachedStyled;
        setStyledUrl(styled);
        await new Promise(r => setTimeout(r, 400));
        setStatus('compositing');
      } else {
        // New selfie — run InstantID
        setStatus('styling');
        styled = await runStyleTransfer({ selfie, painting, figure, styleImageUrl, faceBounds });

        // Stage 2: Paintify via separate endpoint (avoids Vercel 60s timeout)
        setStatus('painting');
        try {
          styled = await runPaintify(styled);
        } catch (e) {
          console.warn('Paintify failed, using InstantID output:', e.message);
        }

        // Convert Replicate URL → base64 before caching
        // Replicate delivery URLs expire after ~24h — base64 is permanent
        try {
          const imgRes = await fetch(styled);
          const blob = await imgRes.blob();
          const b64 = await new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });
          styled = b64; // replace URL with permanent base64
        } catch (e) {
          console.warn('Could not convert styled URL to base64, caching URL instead:', e.message);
        }

        styledCache.current[selfieHash] = styled;
        saveCache(styledCache.current);
        saveLastSelfie(selfie);
        currentSelfieHash.current = selfieHash;
        setStyledUrl(styled);
        setStatus('paintifying');
      }

      // Paintify: Flux Kontext style transfer (separate API call, ~20s)
      // Always run — applies painting style to the face regardless of cache
      setStatus('paintifying');
      let paintified = styled;
      try {
        paintified = await runPaintify(
          typeof styled === 'string' && styled.startsWith('data:')
            ? styled  // base64 from cache — send directly
            : styled  // URL from fresh InstantID
        );
      } catch (e) {
        console.warn('Paintify failed, using InstantID output:', e.message);
      }

      setStatus('compositing');
      const composite = await runComposite({
        styledFaceUrl:    paintified,
        painting,
        figure,
        paintingImageUrl: styleImageUrl,
        faceBounds,
      });

      setOutputUrl(composite);
      setStatus('succeeded');

    } catch (err) {
      console.error('Generate error:', err);
      setError(err.message);
      setStatus('failed');
    }
  }, [runStyleTransfer, runPaintify, runComposite]);

  // clearSelfieCache: call this when user explicitly takes a new selfie
  const clearSelfieCache = useCallback(() => {
    styledCache.current = {};
    currentSelfieHash.current = null;
    setStyledUrl(null);
    try { localStorage.removeItem(CACHE_KEY); } catch {}
    clearLastSelfie();
  }, []);

  // hasCachedSelfie: true if we have a styled face ready to reuse
  // Checks the cache directly, not styledUrl state (which gets cleared by resetGen)
  const hasCachedSelfie = useCallback((selfieData) => {
    if (!selfieData) return false;
    const hash = quickHash(selfieData);
    return !!styledCache.current[hash];
  }, []);

  const reset = useCallback(() => {
    stopPolling();
    setStatus('idle');
    setOutputUrl(null);
    setStyledUrl(null);
    setProfileUrl(null);
    setError(null);
    // Note: intentionally NOT clearing styledCache on reset
    // so switching paintings from result screen is still fast
  }, []);

  const fullReset = useCallback(() => {
    reset();
    clearSelfieCache();
  }, [reset, clearSelfieCache]);

  return { generate, status, outputUrl, styledUrl, profileUrl, error, reset, fullReset, clearSelfieCache, hasCachedSelfie };
}
