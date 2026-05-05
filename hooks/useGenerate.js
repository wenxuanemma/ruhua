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
        figureId:      figure.id,
        styleImageUrl,
        dynasty:       painting.dynasty,
        faceBounds,
        faceRegion:    figure.faceRegion,
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Style transfer failed');
    const instantIdUrl = data.outputUrl || await pollUntilDone(data.predictionId);

    // Stage 2: LoRA refinement (separate call to avoid Vercel timeout)
    try {
      const refineRes = await fetch('/api/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ styledFaceUrl: instantIdUrl }),
      });
      if (refineRes.ok) {
        const refineData = await refineRes.json();
        if (refineData.outputUrl) return refineData.outputUrl;
      }
    } catch (e) {
      console.warn('Refine step failed, using InstantID output:', e.message);
    }
    return instantIdUrl;
  }, [pollUntilDone]);

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
    setOutputUrl(null);
    setProfileUrl(null);
    setError(null);

    const selfieHash = quickHash(selfie);
    const cachedStyled = styledCache.current[selfieHash];
    const isSameSelfie = cachedStyled != null;

    try {
      let styled;

      if (isSameSelfie) {
        // Cached selfie — brief "准备中" then straight to compositing
        setStatus('submitting');
        styled = cachedStyled;
        setStyledUrl(styled);
        await new Promise(r => setTimeout(r, 400));
        setStatus('compositing');
      } else {
        // New selfie — start directly at step 2, skip the "准备中" flash
        setStatus('styling');
        styled = await runStyleTransfer({ selfie, painting, figure, styleImageUrl, faceBounds });

        // Convert to base64 for permanent cache (Replicate URLs expire after ~24h)
        try {
          if (typeof styled === 'string' && styled.startsWith('http')) {
            const imgRes = await fetch(styled);
            const blob = await imgRes.blob();
            styled = await new Promise(resolve => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.readAsDataURL(blob);
            });
          }
        } catch (e) {
          console.warn('Could not convert to base64, caching URL:', e.message);
        }

        styledCache.current[selfieHash] = styled;
        saveCache(styledCache.current);
        saveLastSelfie(selfie);
        currentSelfieHash.current = selfieHash;
        setStyledUrl(styled);
        setStatus('compositing');
      }

      const composite = await runComposite({
        styledFaceUrl:    styled,
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
  }, [runStyleTransfer, runComposite]);

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
