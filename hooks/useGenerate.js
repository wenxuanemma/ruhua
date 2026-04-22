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

export function useGenerate() {
  const [status, setStatus]         = useState('idle');
  const [outputUrl, setOutputUrl]   = useState(null);
  const [styledUrl, setStyledUrl]   = useState(null);
  const [profileUrl, setProfileUrl] = useState(null);
  const [error, setError]           = useState(null);

  // Cache: selfieHash → styledFaceUrl
  // Persists across painting/figure switches within the same session
  const styledCache = useRef({});
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
        faceBounds,
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Style transfer failed');
    if (data.outputUrl) return data.outputUrl;
    return pollUntilDone(data.predictionId);
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
        // Same selfie — skip InstantID, reuse cached styled face
        console.log('Reusing cached styled face for selfie', selfieHash);
        styled = cachedStyled;
        setStyledUrl(styled);
        // Jump straight to compositing
        setStatus('compositing');
      } else {
        // New selfie — run InstantID
        setStatus('styling');
        styled = await runStyleTransfer({ selfie, painting, figure, styleImageUrl, faceBounds });
        // Cache for this session
        styledCache.current[selfieHash] = styled;
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
