// hooks/useGenerate.js
//
// Two-stage pipeline with selfie caching:
//   Stage 1 — InstantID style transfer  → styledFaceUrl (cached per selfie)
//   Stage 2 — Sharp composite           → outputUrl + profileUrl
import { FACE_REGIONS } from '../lib/faceRegions';
import { detectSelfie, getFaceSkinMask } from '../lib/detectFaceClient';
import { getAppUserID } from '../lib/purchases';
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
// Hashes the WHOLE string. It used to stop at 2000 chars -- about 1.5KB of
// JPEG, i.e. header plus the top rows of pixels -- so two different selfies
// with the same size and a plain wall at the top got the same key and the app
// served the previous person's portrait. Two independent 32-bit hashes + length
// keep accidental collisions negligible; cost is a few ms on a ~200KB selfie.
function quickHash(str) {
  let h1 = 0x811c9dc5, h2 = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = (Math.imul(31, h2) + c) | 0;
  }
  return `${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}${str.length.toString(36)}`;
}

// LocalStorage-backed cache — persists across page reloads and deployments
// Key: 'ruhua_cache_v1', Value: { [selfieHash_faceAngle_gender]: styledFaceUrl }
// Limit: keep only the 5 most recent to avoid hitting localStorage quota (~5MB)
const CACHE_KEY = 'ruhua_cache_v1';
const CACHE_MAX = 5;

// Composite result cache — keyed by selfieHash + paintingId + figureId
const RESULT_CACHE_KEY = 'ruhua_results_v1';
const RESULT_CACHE_MAX = 5;

// Result cache is SESSION-ONLY (in-memory).
// styledUrl is a ~3MB base64 image — even 1 entry blows localStorage's 5MB limit.
// Cross-session reuse is handled by styledCache (persists per selfieHash+faceAngle+gender).
function loadResultCache() {
  try { localStorage.removeItem(RESULT_CACHE_KEY); } catch {}
  return {};
}
function saveResultCache(_cache) { /* in-memory only — intentional no-op */ }

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
  const [paintSampleBox, setPaintSampleBox] = useState(null);
  const [maskedFaceUrl, setMaskedFaceUrl] = useState(null);
  const [portraitCropUrl, setPortraitCropUrl] = useState(null);
  const [faceBoundsBox, setFaceBoundsBox] = useState(null);
  const [portraitLandmarks, setPortraitLandmarks] = useState(null);
  const [profileUrl, setProfileUrl] = useState(null);
  const [error, setError]           = useState(null);
  const [errorCode, setErrorCode]   = useState(null);

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
    const appUserID = await getAppUserID();
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
            look:          figure?.look || null,
            styleImageUrl,
            dynasty:       painting.dynasty,
            faceBounds,
            faceRegion:    FACE_REGIONS[painting.id]?.[figure.id],
            appUserID,
          }),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          const err = new Error(data.error || 'Style transfer failed');
          if (data.error === 'insufficient_credits') err.code = 'insufficient_credits';
          throw err;
        }
        const instantIdUrl = data.outputUrl || await pollUntilDone(data.predictionId);
        const detectedBounds = data.selfieFaceBounds || null;

        // Stage 2: LoRA refinement
        try {
          const refineRes = await fetch('/api/refine', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ styledFaceUrl: instantIdUrl, gender }),
          });
          if (refineRes.ok) {
            const refineData = await refineRes.json();
            if (refineData.outputUrl) return { url: refineData.outputUrl, selfieFaceBounds: detectedBounds };
          }
        } catch (e) {
          console.warn('Refine step failed, using InstantID output:', e.message);
        }
        return { url: instantIdUrl, selfieFaceBounds: detectedBounds };

      } catch (e) {
        if (attempt < 2 && e.message.includes('timed out')) {
          console.warn(`Generation timed out, retrying (attempt ${attempt+1}/2)...`);
          continue;
        }
        throw e;
      }
    }
  }, [pollUntilDone]);

  // Which way a face turns in image space: 'left' if the nose tip sits left of
  // the cheek midpoint (lm 234/454), 'right' otherwise. Null when the turn is
  // too slight to call or landmarks are missing.
  function facingDirection(landmarks) {
    if (!landmarks || landmarks.length < 455) return null;
    const mid = (landmarks[234].x + landmarks[454].x) / 2;
    const span = Math.abs(landmarks[454].x - landmarks[234].x) || 1;
    const offset = (landmarks[1].x - mid) / span;
    if (Math.abs(offset) < 0.05) return null;
    return offset < 0 ? 'left' : 'right';
  }

  // Map faceAngle to the correct portrait from the angle set.
  // Kontext naturally produces one direction; _b variants are flopped mirrors.
  // Calibration determines which direction _a corresponds to for each figure.
  function selectPortrait(portraitSet, faceAngle) {
    if (!portraitSet || typeof portraitSet === 'string') return portraitSet;
    // _a = left-facing (Kontext natural direction)
    // _b = right-facing (flopped mirror)
    switch (faceAngle) {
      case 'front':               return portraitSet.front;
      case 'three_quarter_left':  return portraitSet.three_quarter_a;
      case 'three_quarter_right': return portraitSet.three_quarter_b;
      case 'profile_left':        return portraitSet.profile_a;
      case 'profile_right':       return portraitSet.profile_b;
      default:                    return portraitSet.front;
    }
  }

  // Pick the angle-matched portrait and detect its face with client MediaPipe.
  // Runs for front AND three-quarter figures: the server-side detector used
  // for angled faces (LOCAL_INFERENCE_URL) is a LAN-only dev box that Vercel
  // can't reach, so client MediaPipe is the only detection available in prod.
  async function pickAndDetectPortrait(portraitSet, faceAngle, fallbackUrl, painting, figure) {
    let selectedPortrait = selectPortrait(portraitSet, faceAngle) || fallbackUrl;
    console.log(`[composite] faceAngle=${faceAngle} → portrait selected from set`);
    const region = FACE_REGIONS[painting.id]?.[figure.id];
    if (region?.faceAngle?.includes('profile')) {
      // Landmarks are unreliable on a full side view; the face-skin segmentation
      // isn't. Its bounding box drives the crop and its mask cuts the face.
      const seg = await getFaceSkinMask(selectedPortrait);
      if (!seg) return { selectedPortrait, portraitFaceBounds: null };
      const b = seg.bbox;
      return {
        selectedPortrait,
        portraitFaceBounds: {
          ...b, foreheadY: b.y, chinY: b.y + b.h, centerX: b.x + b.w / 2, centerY: b.y + b.h / 2,
          fromSegmentation: true, skinMaskUrl: seg.url,
        },
      };
    }

    let portraitFaceBounds = await detectSelfie(selectedPortrait, { maxW: 0.90, maxH: 0.90, pad: 0 });

    // Kontext picks its own turn direction and the server-side direction
    // check can't run in prod either -- verify here and swap to the
    // mirrored variant if the face turns the wrong way.
    const wantDir = faceAngle === 'three_quarter_left' ? 'left'
                  : faceAngle === 'three_quarter_right' ? 'right' : null;
    const gotDir = facingDirection(portraitFaceBounds?.landmarks);
    if (wantDir && gotDir && gotDir !== wantDir && portraitSet && typeof portraitSet === 'object') {
      const mirrored = wantDir === 'left' ? portraitSet.three_quarter_b : portraitSet.three_quarter_a;
      if (mirrored) {
        console.log(`[composite] portrait faces ${gotDir}, figure needs ${wantDir} -- using mirrored variant`);
        selectedPortrait = mirrored;
        portraitFaceBounds = await detectSelfie(selectedPortrait, { maxW: 0.90, maxH: 0.90, pad: 0 });
      }
    }
    if (portraitFaceBounds) {
      console.log('[portrait] face detected:', JSON.stringify(portraitFaceBounds));
      if (portraitFaceBounds.fromLandmarks) setPortraitLandmarks(portraitFaceBounds);
      // Face-skin segmentation so composite can drop the portrait's own hair
      // (edges and sides included) instead of guessing by brightness. Only
      // fetched when composite will use it (angled figures, or skinMask:true) --
      // front figures keep their shipped rendering and skip the model download.
      const isFrontFigure = !region?.faceAngle || region.faceAngle === 'front';
      if (region?.skinMask ?? !isFrontFigure) {
        portraitFaceBounds.skinMaskUrl = (await getFaceSkinMask(selectedPortrait))?.url ?? null;
      }
    }
    else console.log('[portrait] face detection failed, using fallback');
    return { selectedPortrait, portraitFaceBounds };
  }

  const runComposite = useCallback(async ({ styledFaceUrl, painting, figure, paintingImageUrl, faceBounds, idempotencyKey }) => {
    const appUserID = await getAppUserID();
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
        landmarks:       faceBounds?.landmarks ?? null,
        faceSkinMaskUrl: faceBounds?.skinMaskUrl ?? null,
        appUserID,
        idempotencyKey,
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      const err = new Error(data.error || 'Compositing failed');
      if (data.error === 'insufficient_credits') err.code = 'insufficient_credits';
      throw err;
    }
    if (data.profileUrl) setProfileUrl(data.profileUrl);
    if (data.cropBox)       setCropBox(data.cropBox);
    if (data.paintSampleBox) setPaintSampleBox(data.paintSampleBox);
    if (data.maskedFaceUrl) setMaskedFaceUrl(data.maskedFaceUrl);
    if (data.portraitCropUrl) setPortraitCropUrl(data.portraitCropUrl);
    if (data.faceBoundsBox) setFaceBoundsBox(data.faceBoundsBox);
    if (data.cropBox) setCropBox(data.cropBox);
    if (data.outputUrl) return data.outputUrl;
    return pollUntilDone(data.predictionId);
  }, [pollUntilDone]);

  const generate = useCallback(async ({ selfie, painting, figure, gender, styleImageUrl, faceBounds }) => {
    const needAngles = Object.values(FACE_REGIONS[painting.id] || {}).some(f => !f.disabled && f.faceAngle && f.faceAngle !== 'front');
    stopPolling();
    setOutputUrl(null);
    setProfileUrl(null);
    setError(null);
    setErrorCode(null);

    const selfieHash = quickHash(selfie);
    // styleKey covers all angles — one Seedream call generates all 5 angle portraits
    // figure.look (e.g. 'bearded') changes the Seedream portrait, so it gets its
    // own cache slot; figures without a look keep the original `${hash}_${gender}` key.
    const styleKey = `${selfieHash}_${gender || 'woman'}${figure?.look ? `_${figure.look}` : ''}`;
    const resultKey = `${selfieHash}_${painting.id}_${figure.id}`;

    // Check result cache — styled face cached, skip generation, just re-composite
    const cachedResult = resultCache.current[resultKey];
    if (cachedResult?.styledUrl) {
      console.log('[cache] Result HIT — skipping Seedream:', resultKey);
      setStatus('compositing');
      const cachedFaceBounds = cachedResult.selfieFaceBounds || faceBounds;
      // Select correct angle portrait from cached set
      const cachedFaceAngle = FACE_REGIONS[painting.id]?.[figure.id]?.faceAngle || 'front';
      const cachedPortraitSet = styledCache.current[styleKey];
      try {
        const { selectedPortrait: cachedSelectedPortrait, portraitFaceBounds: cachedPortraitFaceBounds } =
          await pickAndDetectPortrait(cachedPortraitSet, cachedFaceAngle, cachedResult.styledUrl, painting, figure);
        setStyledUrl(cachedSelectedPortrait); // show angle-selected portrait in debug panel
        const composite = await runComposite({
          styledFaceUrl:    cachedSelectedPortrait,
          painting,
          figure,
          paintingImageUrl: styleImageUrl,
          faceBounds: cachedPortraitFaceBounds || cachedFaceBounds,
          idempotencyKey:   resultKey,
        });
        setOutputUrl(composite);
        setStatus('succeeded');
      } catch (err) {
        console.warn('[cache] Re-composite failed, regenerating:', err.message);
        delete resultCache.current[resultKey];
        // fall through to regenerate
      }
      return; // success path only reaches here
    }
    console.log('[cache] Result MISS:', resultKey);

    const cachedStyled = styledCache.current[styleKey];

    // Compress selfie before sending to API
    const compressedSelfie = await compressSelfie(selfie, 800, 0.80);
    const isSameSelfie = cachedStyled != null;

    try {
      let styled;
      let detectedFaceBounds = faceBounds; // may be updated from generate response

      if (isSameSelfie) {
        console.log('[cache] Style HIT — skipping Seedream, styleKey:', styleKey);
        setStatus('submitting');
        const cachedPortraitSet = typeof cachedStyled === 'object' ? cachedStyled : null;
        styled = (cachedPortraitSet?.front) || cachedStyled;
        setStyledUrl(styled);

        // If cached value is just a front URL string (loaded from localStorage after reload),
        // regenerate angle portraits via Kontext now (no Seedream needed)
        if (needAngles && !cachedPortraitSet && styled) {
          console.log('[angles] Cache hit but no angle portraits — regenerating via Kontext...');
          try {
            const anglesRes = await fetch('/api/generate-angles', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ frontPortraitUrl: styled }),
            });
            if (anglesRes.ok) {
              const anglePortraits = await anglesRes.json();
              styledCache.current[styleKey] = anglePortraits;
              console.log('[angles] Regenerated:', Object.keys(anglePortraits));
            }
          } catch (e) {
            console.warn('[angles] Kontext regen failed:', e.message);
          }
        }
        await new Promise(r => setTimeout(r, 400));
        setStatus('compositing');
      } else {
        // New selfie — call Seedream
        console.log('[cache] Style MISS — calling Seedream, styleKey:', styleKey, '| cached:', Object.keys(styledCache.current));
        setStatus('styling');
        const stResult = await runStyleTransfer({ selfie: compressedSelfie, painting, figure, gender, styleImageUrl, faceBounds });
        styled = stResult.url;
        detectedFaceBounds = stResult.selfieFaceBounds || faceBounds;

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

        // Generate angled portraits via Kontext only if painting has non-front figures
        setStatus('compositing');
        let anglePortraits = null;
        if (needAngles) {
          try {
            const anglesRes = await fetch('/api/generate-angles', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ frontPortraitUrl: styled }),
            });
            if (anglesRes.ok) {
              anglePortraits = await anglesRes.json();
              console.log('[angles] Generated:', Object.keys(anglePortraits));
            }
          } catch (e) {
            console.warn('[angles] Angle generation failed, falling back to front only:', e.message);
          }
        } else {
          console.log('[angles] Skipped — all available figures are front-facing');
        }

        // Cache: store the full angle set (or just front if Kontext failed)
        const portraitSet = anglePortraits || { front: styled };
        styledCache.current[styleKey] = portraitSet;
        // Only persist the front portrait URL to localStorage (angle portraits are ~15MB total).
        // On reload, angle portraits will be regenerated via Kontext (~16s).
        const persistable = {};
        for (const [k, v] of Object.entries(styledCache.current)) {
          const val = typeof v === 'object' ? v.front : v;
          if (val) persistable[k] = val; // just the front URL string
        }
        saveCache(persistable);
        saveLastSelfie(selfie);
        currentSelfieHash.current = selfieHash;
        // styledUrl for debug panel = front portrait
        styled = styled; // keep as front for debug display
        setStyledUrl(styled);
      }

      // Select the right angled portrait for this figure
      const faceAngle = FACE_REGIONS[painting.id]?.[figure.id]?.faceAngle || 'front';
      const portraitSet = styledCache.current[styleKey];
      const { selectedPortrait, portraitFaceBounds } =
        await pickAndDetectPortrait(portraitSet, faceAngle, styled, painting, figure);
      setStyledUrl(selectedPortrait); // show angle-selected portrait in debug panel
      const composite = await runComposite({
        styledFaceUrl:    selectedPortrait,
        painting,
        figure,
        paintingImageUrl: styleImageUrl,
        faceBounds: portraitFaceBounds || detectedFaceBounds,
        idempotencyKey:   resultKey,
      });

      // Save only styledUrl to result cache — compositing is fast (~400ms)
      // Full composite result is too large for localStorage
      resultCache.current[resultKey] = { styledUrl: styled, selfieFaceBounds: detectedFaceBounds };
      saveResultCache(resultCache.current);

      setOutputUrl(composite);
      setStatus('succeeded');

    } catch (err) {
      console.error('Generate error:', err);
      setError(err.message);
      setErrorCode(err.code || null);
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
    setErrorCode(null);
    // Note: intentionally NOT clearing styledCache on reset
    // so switching paintings from result screen is still fast
  }, []);

  const fullReset = useCallback(() => {
    reset();
    clearSelfieCache();
  }, [reset, clearSelfieCache]);

  return { generate, status, outputUrl, styledUrl, cropBox, paintSampleBox, maskedFaceUrl, portraitCropUrl, faceBoundsBox, portraitLandmarks, profileUrl, error, errorCode, reset, fullReset, clearSelfieCache, clearStyledCache, hasCachedSelfie };
}
