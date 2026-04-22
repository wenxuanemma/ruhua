// pages/api/composite.js
//
// Sharp-based geometric compositing.
// By the time we get here, the face is already painted (from generate.js Stage 2).
// This stage handles: face crop → color match → feathered oval → paste into painting.
//
// npm install sharp

import sharp from 'sharp';

export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
};

const FACE_REGIONS = {
  qingming: {
    scholar:  { x:0.53, y:0.35, w:0.04, h:0.30, angle:0   },
    merchant: { x:0.62, y:0.32, w:0.04, h:0.30, angle:5   },
    boatman:  { x:0.44, y:0.40, w:0.04, h:0.28, angle:-8  },
  },
  hanxizai: {
    guest:  { x:0.77, y:0.01, w:0.10, h:0.18, angle:5  },
    host:   { x:0.30, y:0.22, w:0.18, h:0.28, angle:-3 },
    dancer: { x:0.47, y:0.26, w:0.08, h:0.12, angle:-5 },
  },
  bunianta: {
    official: { x:0.35, y:0.35, w:0.06, h:0.14, angle:3  },
    envoy:    { x:0.72, y:0.35, w:0.06, h:0.15, angle:-5 },
  },
  guoguo: {
    lady:      { x:0.55, y:0.10, w:0.10, h:0.35, angle:0  },
    attendant: { x:0.35, y:0.10, w:0.09, h:0.32, angle:3  },
    rider:     { x:0.15, y:0.08, w:0.09, h:0.30, angle:-5 },
  },
  luoshen: {
    attendant: { x:0.76, y:0.32, w:0.07, h:0.18, angle:-2 },
    cao:       { x:0.86, y:0.34, w:0.08, h:0.20, angle:-5 },
  },
  gongle: {
    listener: { x:0.10, y:0.30, w:0.13, h:0.28, angle:0  },
    musician: { x:0.46, y:0.14, w:0.11, h:0.24, angle:-8 },
    serving:  { x:0.85, y:0.28, w:0.10, h:0.24, angle:2  },
  },
};

async function fetchImageBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${url} (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { styledFaceUrl, paintingImageUrl, paintingId, figureId, faceBounds } = req.body;
  if (!styledFaceUrl || !paintingImageUrl || !paintingId || !figureId)
    return res.status(400).json({ error: 'Missing required fields' });

  const region = FACE_REGIONS[paintingId]?.[figureId];
  if (!region)
    return res.status(400).json({ error: `No face region for ${paintingId}/${figureId}` });

  try {
    const [paintingBuf, faceBuf] = await Promise.all([
      fetchImageBuffer(paintingImageUrl),
      fetchImageBuffer(styledFaceUrl),
    ]);

    const { width: PW, height: PH } = await sharp(paintingBuf).metadata();
    const { width: FW, height: FH } = await sharp(faceBuf).metadata();

    // Target pixel region in the painting
    const targetX = Math.round(region.x * PW);
    const targetY = Math.round(region.y * PH);
    const targetW = Math.round(region.w * PW);
    const targetH = Math.round(region.h * PH);

    // Crop face from InstantID output — face is centered in 640x640 frame
    // Use full height so chin is never cut; oval mask defines the blend boundary
    const cropX = Math.round(FW * 0.15);
    const cropY = 0;
    const cropW = Math.round(FW * 0.70);
    const cropH = FH;

    let faceImg = sharp(faceBuf)
      .extract({ left: cropX, top: cropY, width: cropW, height: cropH });

    if (region.angle !== 0) {
      faceImg = faceImg.rotate(region.angle, {
        background: { r: 128, g: 100, b: 70, alpha: 1 },
      });
    }

    const facePng = await faceImg
      .resize(targetW, targetH, { fit: 'cover', position: 'top' })  // cover preserves aspect ratio; top keeps forehead
      .png()
      .toBuffer();

    // ── Sample painting color at face region ──────────────────────────────────
    const safeX = Math.max(0, targetX);
    const safeY = Math.max(0, targetY);
    const safeW = Math.min(targetW, PW - safeX);
    const safeH = Math.min(targetH, PH - safeY);

    const paintingCrop = await sharp(paintingBuf)
      .extract({ left: safeX, top: safeY, width: safeW, height: safeH })
      .resize(8, 8, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer();

    let rSum = 0, gSum = 0, bSum = 0;
    const pixels = paintingCrop.length / 3;
    for (let i = 0; i < paintingCrop.length; i += 3) {
      rSum += paintingCrop[i]; gSum += paintingCrop[i+1]; bSum += paintingCrop[i+2];
    }
    const pR = rSum/pixels, pG = gSum/pixels, pB = bSum/pixels;

    // ── Sample raw face color ─────────────────────────────────────────────────
    const faceCropSmall = await sharp(facePng)
      .resize(8, 8)
      .removeAlpha()
      .raw()
      .toBuffer();
    let fR = 0, fG = 0, fB = 0;
    const fp = faceCropSmall.length / 3;
    for (let i = 0; i < faceCropSmall.length; i += 3) {
      fR += faceCropSmall[i]; fG += faceCropSmall[i+1]; fB += faceCropSmall[i+2];
    }

    // ── Calculate adaptive brightness to match painting region ────────────────
    // Each painting has a different brightness level — this generalizes automatically:
    // 韩熙载夜宴图 → dark (0.3–0.4), 千里江山图 → bright (0.6–0.7), 宫乐图 → warm mid (0.5)
    const paintingBrightness = (pR + pG + pB) / 3 / 255;
    const faceBrightness     = ((fR + fG + fB) / 3) / fp / 255;
    const targetBrightness   = faceBrightness + (paintingBrightness - faceBrightness) * 0.40;  // 40%, was 60%
    const brightnessRatio    = faceBrightness > 0.01
      ? Math.max(0.4, Math.min(1.5, targetBrightness / faceBrightness))
      : 1.0;

    // ── Apply brightness only — remove tint which was causing desaturation ──────
    // Sharp's tint() replaces ALL chroma with the tint color (near-gray for dark paintings)
    // causing the gray face issue. Brightness matching alone is sufficient.
    const colorMatchedFace = await sharp(facePng)
      .modulate({
        saturation: 0.92,          // very mild reduction
        brightness: brightnessRatio,
      })
      .png()
      .toBuffer();

    // Sharper oval falloff — reduces halo bleed from vivid painting backgrounds (red screens etc.)
    const ovalSvg = `<svg width="${targetW}" height="${targetH}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="g" cx="50%" cy="46%" rx="50%" ry="50%">
          <stop offset="55%" stop-color="white" stop-opacity="1"/>
          <stop offset="72%" stop-color="white" stop-opacity="0.9"/>
          <stop offset="85%" stop-color="white" stop-opacity="0.4"/>
          <stop offset="94%" stop-color="white" stop-opacity="0.08"/>
          <stop offset="100%" stop-color="white" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <ellipse cx="${targetW*0.50}" cy="${targetH*0.46}"
               rx="${targetW*0.46}" ry="${targetH*0.50}"
               fill="url(#g)"/>
    </svg>`;

    const ovalMask = await sharp(Buffer.from(ovalSvg))
      .resize(targetW, targetH)
      .toBuffer();

    // Extract painting region at face target size — used as background for blending
    const paintingRegionBuf = await sharp(paintingBuf)
      .extract({ left: safeX, top: safeY, width: safeW, height: safeH })
      .resize(targetW, targetH, { fit: 'fill' })
      .png()
      .toBuffer();

    // Correct blend order to eliminate SDXL background bleed:
    // Step 1: apply oval mask to face → SDXL background becomes transparent
    // Step 2: composite masked face onto painting pixels → edges fade into painting, not SDXL green
    const maskedFace = await sharp(colorMatchedFace)
      .composite([{ input: ovalMask, blend: 'dest-in' }])
      .png()
      .toBuffer();

    const faceFinal = await sharp(paintingRegionBuf)
      .composite([{ input: maskedFace, blend: 'over' }])
      .png()
      .toBuffer();

    // Paste onto painting
    const composited = await sharp(paintingBuf)
      .composite([{ input: faceFinal, left: targetX, top: targetY, blend: 'over' }])
      .jpeg({ quality: 92 })
      .toBuffer();

    // Profile crop — padding scales inversely with face region size
    // Small regions (bunianta w:0.06) need less padding than large ones (host w:0.18)
    const sizeScale = Math.max(0.3, Math.min(1.0, 0.12 / region.w)); // normalize around w=0.12
    const padX = Math.round(targetW * 0.5 * sizeScale);
    const padY = Math.round(targetH * 0.4 * sizeScale);
    const cropLeft   = Math.max(0, targetX - padX);
    const cropTop    = Math.max(0, targetY - padY);
    const cropRight  = Math.min(PW, targetX + targetW + padX);
    const cropBottom = Math.min(PH, targetY + targetH + padY);

    const profileCrop = await sharp(composited)
      .extract({
        left:   cropLeft,
        top:    cropTop,
        width:  cropRight - cropLeft,
        height: cropBottom - cropTop,
      })
      .resize(400, 400, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 90 })
      .toBuffer();

    const outputUrl  = `data:image/jpeg;base64,${composited.toString('base64')}`;
    const profileUrl = `data:image/jpeg;base64,${profileCrop.toString('base64')}`;

    return res.status(200).json({ outputUrl, profileUrl });

  } catch (err) {
    console.error('Composite error:', err);
    return res.status(500).json({ error: err.message || 'Compositing failed' });
  }
}
