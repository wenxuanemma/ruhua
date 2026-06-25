// lib/detectFaceClient.js
// Client-side face detection using @mediapipe/tasks-vision (WASM).
// Primary: FaceLandmarker for face center, then ink-stroke scan for precise chin/forehead.
// Fallback: FaceDetector bounding box.

let detectorPromise = null;
let landmarkerPromise = null;

async function getDetector() {
  if (detectorPromise) return detectorPromise;
  detectorPromise = (async () => {
    const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision');
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
    );
    return FaceDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
        delegate: 'GPU',
      },
      runningMode: 'IMAGE',
    });
  })();
  return detectorPromise;
}

async function getLandmarker() {
  if (landmarkerPromise) return landmarkerPromise;
  landmarkerPromise = (async () => {
    const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
    );
    return FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'IMAGE',
      numFaces: 1,
    });
  })();
  return landmarkerPromise;
}

/**
 * Scan canvas pixel data for gongbi ink strokes to find precise forehead/chin.
 * Gongbi always has a fine dark ink outline around face/jaw.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} W image width
 * @param {number} H image height
 * @param {number} centerX face center x (normalized 0-1)
 * @param {number} approxForeheadY rough forehead y from landmarks (normalized)
 * @param {number} approxChinY rough chin y from landmarks (normalized)
 * @returns {{ foreheadY, chinY }} normalized y positions
 */
function scanInkStrokes(ctx, W, H, centerX, approxForeheadY, approxChinY) {
  // Scan a band around the face center — ±20% of image width
  const scanWidth = Math.round(W * 0.20);
  const x0 = Math.max(0, Math.round(centerX * W) - scanWidth);
  const x1 = Math.min(W, Math.round(centerX * W) + scanWidth);

  // Scan slightly above forehead landmark to catch hairline ink stroke
  // and within chin landmark (chin landmark often includes neck)
  const marginAbove = Math.round(H * 0.06);
  const y0 = Math.max(0, Math.round(approxForeheadY * H) - marginAbove);
  const y1 = Math.min(H, Math.round(approxChinY * H));

  const imageData = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
  const data = imageData.data;
  const W2 = x1 - x0;
  const H2 = y1 - y0;

  // Threshold: gongbi ink strokes are dark but not always pure black
  // 150 catches fine brushwork without picking up hair/clothing
  const INK_THRESHOLD = 150;
  const MIN_DARK_COLS = 5; // require dark pixels in at least N columns to count

  // For each row, count how many columns have dark pixels
  const rowDarkCount = new Int32Array(H2);
  for (let y = 0; y < H2; y++) {
    for (let x = 0; x < W2; x++) {
      const i = (y * W2 + x) * 4;
      if (data[i] + data[i+1] + data[i+2] < INK_THRESHOLD) {
        rowDarkCount[y]++;
      }
    }
  }

  // Find topmost row with significant dark pixels → forehead ink
  let foreheadRow = -1;
  for (let y = 0; y < H2; y++) {
    if (rowDarkCount[y] >= MIN_DARK_COLS) {
      foreheadRow = y;
      break;
    }
  }

  // Find bottommost row with significant dark pixels → chin ink
  let chinRow = -1;
  for (let y = H2 - 1; y >= 0; y--) {
    if (rowDarkCount[y] >= MIN_DARK_COLS) {
      chinRow = y;
      break;
    }
  }

  // Convert back to normalized image coordinates
  const rawForeheadY = foreheadRow >= 0 ? (y0 + foreheadRow) / H : approxForeheadY;
  const rawChinY     = chinRow    >= 0 ? (y0 + chinRow)    / H : approxChinY;

  // Forehead can refine upward (above landmark) — we extended scan up
  // Chin must refine inward (below chin landmark = likely neck, reject)
  const foreheadY = rawForeheadY;
  const chinY     = (rawChinY <= approxChinY) ? rawChinY : approxChinY;

  console.log(`[portrait] ink scan: forehead=${foreheadY.toFixed(3)} chin=${chinY.toFixed(3)} (landmark was: ${approxForeheadY.toFixed(3)}, ${approxChinY.toFixed(3)})`);

  return { foreheadY, chinY };
}

/**
 * Detect face in portrait image. Returns normalized bounds with precise forehead/chin.
 * Uses FaceLandmarker + ink stroke scan for gongbi portraits.
 */
export async function detectSelfie(imageUrl, { maxW = 0.90, maxH = 0.90, pad = 0 } = {}) {
  if (typeof window === 'undefined') return null;
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = imageUrl; });

    const W = img.naturalWidth, H = img.naturalHeight;

    // Draw to canvas once — reused for both landmarker and ink scan
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    // Step 1: FaceLandmarker — get rough face center and bounds
    try {
      const landmarker = await getLandmarker();
      let result;
      try { result = landmarker.detect(canvas); }
      catch { result = landmarker.detect(img); }

      if (result.faceLandmarks?.length) {
        const lm = result.faceLandmarks[0];
        // Key landmarks:
        // 10 = forehead center (mid-forehead, not hairline)
        // 105, 334 = left/right brow top center
        // 199 = chin tip
        // 234, 454 = left/right cheeks
        const lm10Y   = lm[10].y;
        const browY   = (lm[105].y + lm[334].y) / 2;
        const lmChinY = lm[199].y;
        const leftX   = lm[234].x;
        const rightX  = lm[454].x;
        const centerX = (leftX + rightX) / 2;
        const faceW   = rightX - leftX;

        // Estimate hairline: lm10 is mid-forehead; brow is below it.
        // Forehead height = browY - lm10Y. Mirror above lm10 to get hairline.
        const foreheadHeight = browY - lm10Y;
        const lmForeheadY = Math.max(0, lm10Y - foreheadHeight);

        console.log(`[portrait] landmarks: lm10=${lm10Y.toFixed(3)} brow=${browY.toFixed(3)} foreheadH=${foreheadHeight.toFixed(3)} hairline=${lmForeheadY.toFixed(3)} chin=${lmChinY.toFixed(3)}`);

        // Use landmark-derived positions directly
        // Hairline estimated from brow distance; chin from landmark 199
        const foreheadY = lmForeheadY;
        const chinY     = lmChinY;
        const centerY   = (foreheadY + chinY) / 2;
        console.log(`[portrait] final: forehead=${foreheadY.toFixed(3)} chin=${chinY.toFixed(3)} center=${centerY.toFixed(3)}`);

        return {
          x: Math.max(0, centerX - faceW / 2),
          y: foreheadY,
          w: faceW,
          h: chinY - foreheadY,
          foreheadY,
          chinY,
          centerY,
          centerX,
          fromLandmarks: true,
        };
      }
    } catch (e) {
      console.warn('[detectFaceClient] landmark+ink failed, falling back:', e.message);
    }

    // Fallback: FaceDetector bounding box
    const detector = await getDetector();
    const result = detector.detect(img);
    if (!result.detections?.length) return null;
    const best = result.detections.reduce((a, b) =>
      b.boundingBox.width * b.boundingBox.height > a.boundingBox.width * a.boundingBox.height ? b : a
    );
    const { originX: x, originY: y, width: w, height: h } = best.boundingBox;
    const rawW = w / W, rawH = h / H;
    const cx = x / W + rawW / 2, cy = y / H + rawH / 2;
    const fw = Math.min(rawW * (1 + pad * 2), maxW);
    const fh = Math.min(rawH * (1 + pad * 2), maxH);
    return {
      x: Math.max(0, cx - fw / 2),
      y: Math.max(0, cy - fh / 2),
      w: fw, h: fh,
      fromLandmarks: false,
    };
  } catch (e) {
    console.warn('[detectFaceClient] failed:', e.message);
    return null;
  }
}
