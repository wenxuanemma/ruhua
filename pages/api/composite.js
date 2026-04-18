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
    guest:  { x:0.76, y:0.01, w:0.11, h:0.16, angle:5  },
    host:   { x:0.35, y:0.27, w:0.11, h:0.18, angle:-3 },
    dancer: { x:0.47, y:0.25, w:0.08, h:0.15, angle:-5 },
  },
  bunianta: {
    official: { x:0.34, y:0.34, w:0.07, h:0.15, angle:3  },
    envoy:    { x:0.72, y:0.35, w:0.06, h:0.15, angle:-5 },
  },
  qianli: {
    hermit:    { x:0.28, y:0.58, w:0.03, h:0.08, angle:0   },
    fisherman: { x:0.65, y:0.62, w:0.03, h:0.07, angle:-10 },
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

  const { styledFaceUrl, paintingImageUrl, paintingId, figureId } = req.body;
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

    // Crop face from center of the painted face output
    // InstantID + paintify both keep face centered in the 640x640 output
    const cropX = Math.round(FW * 0.18);
    const cropY = Math.round(FH * 0.03);
    const cropW = Math.round(FW * 0.64);
    const cropH = Math.round(FH * 0.72);

    let faceImg = sharp(faceBuf)
      .extract({ left: cropX, top: cropY, width: cropW, height: cropH });

    if (region.angle !== 0) {
      faceImg = faceImg.rotate(region.angle, { background: { r:0, g:0, b:0, alpha:0 } });
    }

    const facePng = await faceImg
      .resize(targetW, targetH, { fit: 'fill' })
      .png()
      .toBuffer();

    // Sample painting's average color in the face region for color matching
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

    // Sample face average color
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

    // Tint face 35% toward painting's color palette
    const t = 0.35;
    const tR = Math.round((pR - fR/fp) * t);
    const tG = Math.round((pG - fG/fp) * t);
    const tB = Math.round((pB - fB/fp) * t);

    const colorMatchedFace = await sharp(facePng)
      .tint({ r: 128 + tR, g: 128 + tG, b: 128 + tB })
      .png()
      .toBuffer();

    // Soft feathered oval mask — wide transition zone for natural blend
    const ovalSvg = `<svg width="${targetW}" height="${targetH}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="g" cx="50%" cy="43%" rx="50%" ry="50%">
          <stop offset="40%" stop-color="white" stop-opacity="1"/>
          <stop offset="65%" stop-color="white" stop-opacity="0.9"/>
          <stop offset="82%" stop-color="white" stop-opacity="0.4"/>
          <stop offset="93%" stop-color="white" stop-opacity="0.1"/>
          <stop offset="100%" stop-color="white" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <ellipse cx="${targetW*0.50}" cy="${targetH*0.43}"
               rx="${targetW*0.46}" ry="${targetH*0.46}"
               fill="url(#g)"/>
    </svg>`;

    const ovalMask = await sharp(Buffer.from(ovalSvg))
      .resize(targetW, targetH)
      .toBuffer();

    const faceFinal = await sharp(colorMatchedFace)
      .composite([{ input: ovalMask, blend: 'dest-in' }])
      .png()
      .toBuffer();

    // Paste onto painting
    const composited = await sharp(paintingBuf)
      .composite([{ input: faceFinal, left: targetX, top: targetY, blend: 'over' }])
      .jpeg({ quality: 92 })
      .toBuffer();

    // Also produce a square profile crop centered on the face region
    // Expand the region slightly so it includes neck/shoulders
    const padX = Math.round(targetW * 0.5);
    const padY = Math.round(targetH * 0.4);
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
