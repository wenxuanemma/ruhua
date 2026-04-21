// hooks/useGenerate.js
//
// Two-stage pipeline:
//   Stage 1 — InstantID style transfer  → styledFaceUrl
//   Stage 2 — Inpainting composite      → outputUrl (face in painting)
//
// status values:
//   'idle' | 'submitting' | 'styling' | 'compositing' | 'succeeded' | 'failed'

import { useState, useRef, useCallback } from 'react';

const POLL_INTERVAL_MS = 2500;
const MAX_POLLS = 48;

export function useGenerate() {
  const [status, setStatus]       = useState('idle');
  const [outputUrl, setOutputUrl] = useState(null);
  const [styledUrl, setStyledUrl] = useState(null);
  const [profileUrl, setProfileUrl] = useState(null);
  const [error, setError]         = useState(null);
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

  const runStyleTransfer = useCallback(async ({ selfie, painting, styleImageUrl, faceBounds }) => {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selfie,
        paintingId:    painting.id,
        styleImageUrl,
        paintingTitle: painting.title,
        dynasty:       painting.dynasty,
        faceBounds,    // detected face region in the selfie (may be null)
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
    setStyledUrl(null);
    setProfileUrl(null);
    setError(null);

    try {
      setStatus('styling');
      const styled = await runStyleTransfer({ selfie, painting, styleImageUrl, faceBounds });
      setStyledUrl(styled);

      setStatus('compositing');
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

  const reset = useCallback(() => {
    stopPolling();
    setStatus('idle');
    setOutputUrl(null);
    setStyledUrl(null);
    setProfileUrl(null);
    setError(null);
  }, []);

  return { generate, status, outputUrl, styledUrl, profileUrl, error, reset };
}
