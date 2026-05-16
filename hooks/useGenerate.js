// hooks/useGenerate.js
//
// Two-stage pipeline with selfie caching:
//   Stage 1 — InstantID style transfer  → styledFaceUrl (cached per selfie)
//   Stage 2 — Sharp composite           → outputUrl + profileUrl
import { FACE_REGIONS } from '../lib/faceRegions';
//
// Caching: if the same selfie is reused (switching painting/figure),
// Stage 1 is skipped and only Stage 2 reruns (~3s instead of ~35s).
//
// status: 'idle' | 'submitting' | 'styling' | 'compositing' | 'succeeded' | 'failed'

import { useState, useRef, useCallback } from 'react';

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 150; // 150 × 2s = 5 minutes max

// Compress selfie to max 1200px and 0.85 JPEG quality before sending
function compressSelfie(b64, maxPx = 1200, quality = 0.85) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = b64;
  });
}
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

// Composite result cache — keyed by selfieHash + paintingId + figureId
const RESULT_CACHE_KEY = 'ruhua_results_v1';
const RESULT_CACHE_MAX = 5;

function loadResultCache() {
  try {
    const cache = JSON.parse(localStorage.getItem(RESULT_CACHE_KEY) || '{}');
    // Clear old format entries that stored outputUrl (too large)
    const cleaned = {};
    for (const [k, v] of Object.entries(cache)) {
      if (v.styledUrl && !v.outputUrl) cleaned[k] = v;
    }
    return cleaned;
  } catch { return {}; }
}
function saveResultCache(cache) {
  try {
    // Only keep styledUrl — outputUrl is too large for localStorage
    const cleaned = {};
    for (const [k, v] of Object.entries(cache)) {
      if (v.styledUrl) cleaned[k] = { styledUrl: v.styledUrl };
    }
    const entries = Object.entries(cleaned);
    const trimmed = Object.fromEntries(entries.slice(-RESULT_CACHE_MAX));
    localStorage.setItem(RESULT_CACHE_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.warn('Result cache save failed:', e.message);
    // Clear and retry with just the latest entry
    try {
      localStorage.removeItem(RESULT_CACHE_KEY);
    } catch {}
  }
}

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
  const [cropBox, setCropBox]        = useState(null);
  const [profileUrl, setProfileUrl] = useState(null);
  const [error, setError]           = useState(null);

  // Cache: selfieHash → styledFaceUrl
  // In-memory ref backed by localStorage for persistence across reloads/deployments
  const styledCache = useRef(loadCache());
  const resultCache = useRef(loadResultCache());
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
      } catch (e) {
        console.warn('Poll error (will retry):', e.message);
        // Don't count network errors against MAX_POLLS
        pollCount.current--;
      }
    }, POLL_INTERVAL_MS);
  }), []);

  const runStyleTransfer = useCallback(async ({ selfie, painting, figure, gender, styleImageUrl, faceBounds }) => {
    // Retry up to 2 times on timeout
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            selfie,
            paintingId:    painting.id,
            figureId:      figure.id,
            gender:        gender || 'woman',
            styleImageUrl,
            dynasty:       painting.dynasty,
            faceBounds,
            faceRegion:    FACE_REGIONS[painting.id]?.[figure.id],
          }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Style transfer failed');
        const instantIdUrl = data.outputUrl || await pollUntilDone(data.predictionId);

        // Stage 2: LoRA refinement
        try {
          const refineRes = await fetch('/api/refine', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ styledFaceUrl: instantIdUrl, gender }),
          });
          if (refineRes.ok) {
            const refineData = await refineRes.json();
            if (refineData.outputUrl) return refineData.outputUrl;
          }
        } catch (e) {
          console.warn('Refine step failed, using InstantID output:', e.message);
        }
        return instantIdUrl;

      } catch (e) {
        if (attempt < 2 && e.message.includes('timed out')) {
          console.warn(`Generation timed out, retrying (attempt ${attempt+1}/2)...`);
          continue;
        }
        throw e;
      }
    }
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
    if (data.cropBox)    setCropBox(data.cropBox);
    if (data.outputUrl) return data.outputUrl;
    return pollUntilDone(data.predictionId);
  }, [pollUntilDone]);

  const generate = useCallback(async ({ selfie, painting, figure, gender, styleImageUrl, faceBounds }) => {
    stopPolling();
    setOutputUrl(null);
    setProfileUrl(null);
    setError(null);

    const selfieHash = quickHash(selfie);
    const resultKey = `${selfieHash}_${painting.id}_${figure.id}`;

    // Check result cache — styled face cached, skip generation, just re-composite
    const cachedResult = resultCache.current[resultKey];
    if (cachedResult?.styledUrl) {
      console.log('Result cache hit — re-compositing:', resultKey);
      setStatus('compositing');
      setStyledUrl(cachedResult.styledUrl);
      try {
        const composite = await runComposite({
          styledFaceUrl:    cachedResult.styledUrl,
          painting,
          figure,
          paintingImageUrl: styleImageUrl,
          faceBounds,
        });
        setOutputUrl(composite);
        setStatus('succeeded');
      } catch (err) {
        console.warn('Cache re-composite failed, regenerating:', err.message);
        delete resultCache.current[resultKey];
      }
      return;
    }

    const cachedStyled = styledCache.current[selfieHash];

    // Compress selfie before sending to API
    const compressedSelfie = await compressSelfie(selfie, 800, 0.80);
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
        styled = await runStyleTransfer({ selfie: compressedSelfie, painting, figure, gender, styleImageUrl, faceBounds });

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

      // Save only styledUrl to result cache — compositing is fast (~400ms)
      // Full composite result is too large for localStorage
      resultCache.current[resultKey] = { styledUrl: styled };
      saveResultCache(resultCache.current);

      setOutputUrl(composite);
      setStatus('succeeded');

    } catch (err) {
      console.error('Generate error:', err);
      setError(err.message);
      setStatus('failed');
    }
  }, [runStyleTransfer, runComposite]);

  // clearStyledCache: clears styled face cache but keeps selfie
  // Use when switching characters with new gender
  const clearStyledCache = useCallback(() => {
    styledCache.current = {};
    resultCache.current = {};
    setStyledUrl(null);
    try {
      localStorage.removeItem(CACHE_KEY);
      localStorage.removeItem(RESULT_CACHE_KEY);
    } catch {}
  }, []);

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

  return { generate, status, outputUrl, styledUrl, cropBox, profileUrl, error, reset, fullReset, clearSelfieCache, clearStyledCache, hasCachedSelfie };
}
