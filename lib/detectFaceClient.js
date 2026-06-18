// lib/detectFaceClient.js
// Client-side face detection using @mediapipe/tasks-vision (WASM).
// Returns raw normalized face bounds {x,y,w,h} — NO padding applied.
// Padding is handled by the caller (composite.js uses asymmetric padTop/padBot).

let detectorPromise = null;

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

/**
 * Detect face in an image. Returns raw normalized {x,y,w,h} or null.
 * @param {string} imageUrl - URL or data URL
 * @param {object} opts
 * @param {number} opts.maxW - max width clamp (default 0.90)
 * @param {number} opts.maxH - max height clamp (default 0.90)
 * @param {number} opts.pad  - symmetric padding fraction (default 0)
 */
export async function detectSelfie(imageUrl, { maxW = 0.90, maxH = 0.90, pad = 0 } = {}) {
  if (typeof window === 'undefined') return null;
  try {
    const detector = await getDetector();
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = imageUrl; });
    const result = detector.detect(img);
    if (!result.detections?.length) return null;
    const best = result.detections.reduce((a, b) =>
      b.boundingBox.width * b.boundingBox.height > a.boundingBox.width * a.boundingBox.height ? b : a
    );
    const { originX: x, originY: y, width: w, height: h } = best.boundingBox;
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const rawW = w / iw, rawH = h / ih;
    const cx = x / iw + rawW / 2, cy = y / ih + rawH / 2;
    const fw = Math.min(rawW * (1 + pad * 2), maxW);
    const fh = Math.min(rawH * (1 + pad * 2), maxH);
    return {
      x: Math.max(0, cx - fw / 2),
      y: Math.max(0, cy - fh / 2),
      w: fw, h: fh,
    };
  } catch (e) {
    console.warn('[detectFaceClient] failed:', e.message);
    return null;
  }
}
