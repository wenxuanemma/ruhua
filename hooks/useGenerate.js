// hooks/useGenerate.js
//
// Usage:
//   const { generate, status, outputUrl, error } = useGenerate();
//
//   // In selfie screen after capture:
//   generate({ selfie, painting, styleImageUrl });
//
// status values (mapped to ProcessingScreen steps):
//   'idle' | 'submitting' | 'starting' | 'processing' | 'succeeded' | 'failed'

import { useState, useRef, useCallback } from 'react';

const POLL_INTERVAL_MS = 2500;
const MAX_POLLS = 48; // 2 minute timeout

export function useGenerate() {
  const [status, setStatus] = useState('idle');
  const [outputUrl, setOutputUrl] = useState(null);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);
  const pollCount = useRef(0);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const pollStatus = useCallback(async (predictionId) => {
    pollCount.current = 0;

    pollRef.current = setInterval(async () => {
      pollCount.current += 1;

      if (pollCount.current > MAX_POLLS) {
        stopPolling();
        setStatus('failed');
        setError('Generation timed out. Please try again.');
        return;
      }

      try {
        const res = await fetch(`/api/status?id=${predictionId}`);
        const data = await res.json();

        if (data.status === 'starting') {
          setStatus('starting');
        } else if (data.status === 'processing') {
          setStatus('processing');
        } else if (data.status === 'succeeded') {
          stopPolling();
          setStatus('succeeded');
          setOutputUrl(data.outputUrl);
        } else if (data.status === 'failed') {
          stopPolling();
          setStatus('failed');
          setError(data.error || 'Generation failed');
        }
      } catch (err) {
        console.error('Poll error:', err);
        // Don't stop on transient network errors — keep polling
      }
    }, POLL_INTERVAL_MS);
  }, []);

  const generate = useCallback(async ({ selfie, painting, styleImageUrl }) => {
    stopPolling();
    setStatus('submitting');
    setOutputUrl(null);
    setError(null);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selfie,
          paintingId:    painting.id,
          styleImageUrl,
          paintingTitle: painting.title,
          dynasty:       painting.dynasty,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        setStatus('failed');
        setError(data.error || 'Failed to start generation');
        return;
      }

      setStatus('starting');
      pollStatus(data.predictionId);

    } catch (err) {
      console.error('Generate error:', err);
      setStatus('failed');
      setError('Network error. Please try again.');
    }
  }, [pollStatus]);

  const reset = useCallback(() => {
    stopPolling();
    setStatus('idle');
    setOutputUrl(null);
    setError(null);
  }, []);

  return { generate, status, outputUrl, error, reset };
}


// ── Status → UI step mapping ───────────────────────────────────────────────
// Use this in ProcessingScreen to drive the step indicators:
//
// const STEP_FOR_STATUS = {
//   submitting:  1,
//   starting:    1,
//   processing:  3,
//   succeeded:   4,
//   failed:      0,
// };
//
// const uiStep = STEP_FOR_STATUS[status] ?? 0;
