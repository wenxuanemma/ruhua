// lib/detectFaceClient.js
// Client-side face detection using @mediapipe/tasks-vision (WASM).
// Primary: FaceLandmarker with segmentation mask for pixel-accurate face extraction.
// Fallback: FaceDetector bounding box.

let detectorPromise = null;
let landmarkerPromise = null;

async function getDetector() {
  if (detectorPromise) return detectorPromise;
  detectorPromise = (async () => {
    const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision');
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm'
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
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm'
    );
    return FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        delegate: 'CPU',  // GPU delegate conflicts with segmentation masks in this version
      },
      runningMode: 'IMAGE',
      numFaces: 1,
      outputSegmentationMasks: true,  // pixel-accurate face mask
    });
  })();
  return landmarkerPromise;
}

/**
 * Extract segmentation mask from MPMask, apply feathering, return as base64 PNG.
 * The mask is cropped to the face bounding box + margin.
 */
function extractSegMask(segMask, W, H, foreheadY, chinY, centerX, faceW) {
  try {
    // Get mask as float array (0=background, 1=face)
    const maskData = segMask.getAsFloat32Array();

    // Create canvas for the mask
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = W;
    maskCanvas.height = H;
    const ctx = maskCanvas.getContext('2d');
    const imgData = ctx.createImageData(W, H);

    // Convert float mask to RGBA (white face, black background)
    for (let i = 0; i < maskData.length; i++) {
      const v = Math.round(maskData[i] * 255);
      imgData.data[i * 4 + 0] = v;
      imgData.data[i * 4 + 1] = v;
      imgData.data[i * 4 + 2] = v;
      imgData.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);

    // Apply Gaussian blur for feathered edges
    const blurCanvas = document.createElement('canvas');
    blurCanvas.width = W;
    blurCanvas.height = H;
    const blurCtx = blurCanvas.getContext('2d');
    blurCtx.filter = 'blur(8px)';
    blurCtx.drawImage(maskCanvas, 0, 0);

    // Downscale to 480x480 to reduce payload size (~10x smaller)
    const smallCanvas = document.createElement('canvas');
    smallCanvas.width = 480;
    smallCanvas.height = 480;
    smallCanvas.getContext('2d').drawImage(blurCanvas, 0, 0, 480, 480);
    return smallCanvas.toDataURL('image/jpeg', 0.85);
  } catch (e) {
    console.warn('[detectFaceClient] mask extraction failed:', e.message);
    return null;
  }
}

/**
 * Detect face in portrait image.
 * Returns landmarks + pixel-accurate segmentation mask.
 */
export async function detectSelfie(imageUrl, { maxW = 0.90, maxH = 0.90, pad = 0 } = {}) {
  if (typeof window === 'undefined') return null;
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = imageUrl; });

    const W = img.naturalWidth, H = img.naturalHeight;

    // Draw to canvas
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    // Try FaceLandmarker with segmentation mask
    try {
      const landmarker = await getLandmarker();

      // VIDEO mode with detectForVideo is required for segmentation masks.
      // Falls back to detect(img) without segmentation if that also fails.
      let result = null;
      try {
        result = landmarker.detectForVideo(canvas, performance.now());
      } catch {
        try { result = landmarker.detect(img); } catch { result = null; }
      }

      if (result?.faceLandmarks?.length) {
        const lm = result.faceLandmarks[0];

        // Key landmarks
        const lm10Y  = lm[10].y;
        const browY  = (lm[105].y + lm[334].y) / 2;
        const lm199Y = lm[199].y;
        const leftX  = lm[234].x;
        const rightX = lm[454].x;
        const centerX = (leftX + rightX) / 2;
        const faceW   = rightX - leftX;

        // Hairline estimation
        const foreheadHeight = browY - lm10Y;
        const foreheadY = Math.max(0, lm10Y - foreheadHeight);

        // Chin: extend lm[199] down by 8% of face height
        const detectedFaceH = lm199Y - lm10Y;
        const chinY = Math.min(1, lm199Y + detectedFaceH * 0.08);

        const centerY = (foreheadY + chinY) / 2;

        console.log(`[portrait] landmarks: lm10=${lm10Y.toFixed(3)} brow=${browY.toFixed(3)} foreheadH=${foreheadHeight.toFixed(3)} hairline=${foreheadY.toFixed(3)} chin=${chinY.toFixed(3)}`);

        // Extract segmentation mask if available
        let segMaskUrl = null;
        if (result.segmentationMasks?.length) {
          segMaskUrl = extractSegMask(
            result.segmentationMasks[0], W, H,
            foreheadY, chinY, centerX, faceW
          );
          console.log(`[portrait] segmentation mask: ${segMaskUrl ? 'extracted ✅' : 'failed ❌'}`);
        }

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
          segMaskUrl,
          landmarks: lm.map(p => ({ x: p.x, y: p.y })),
        };
      }
    } catch (e) {
      console.warn('[detectFaceClient] landmark failed, falling back:', e.message);
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
      segMaskUrl: null,
    };
  } catch (e) {
    console.warn('[detectFaceClient] failed:', e.message);
    return null;
  }
}
