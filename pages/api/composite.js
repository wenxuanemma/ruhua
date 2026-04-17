// pages/api/composite.js
// Server-side image compositing using Sharp.
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
    // 1. Fetch both images in parallel
    const [paintingBuf, faceBuf] = await Promise.all([
      fetchImageBuffer(paintingImageUrl),
      fetchImageBuffer(styledFaceUrl),
    ]);

    // 2. Get painting dimensions
    const { width: PW, height: PH } = await sharp(paintingBuf).metadata();

    // 3. Target pixel region
    const targetX = Math.round(region.x * PW);
    const targetY = Math.round(region.y * PH);
    const targetW = Math.round(region.w * PW);
    const targetH = Math.round(region.h * PH);

    // 4. Crop face from styled output (InstantID centers the face in a 640x640)
    const { width: FW, height: FH } = await sharp(faceBuf).metadata();
    const cropX = Math.round(FW * 0.20);
    const cropY = Math.round(FH * 0.05);
    const cropW = Math.round(FW * 0.60);
    const cropH = Math.round(FH * 0.70);

    // 5. Crop → rotate → resize → apply soft oval mask
    let faceImg = sharp(faceBuf).extract({ left: cropX, top: cropY, width: cropW, height: cropH });
    if (region.angle !== 0) {
      faceImg = faceImg.rotate(region.angle, { background: { r:0, g:0, b:0, alpha:0 } });
    }
    faceImg = faceImg.resize(targetW, targetH, { fit: 'fill' });

    const ovalSvg = `<svg width="${targetW}" height="${targetH}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="g" cx="50%" cy="45%" rx="48%" ry="48%">
          <stop offset="60%" stop-color="white" stop-opacity="1"/>
          <stop offset="85%" stop-color="white" stop-opacity="0.5"/>
          <stop offset="100%" stop-color="white" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <ellipse cx="${targetW/2}" cy="${targetH*0.45}" rx="${targetW*0.46}" ry="${targetH*0.46}" fill="url(#g)"/>
    </svg>`;

    const ovalMask = await sharp(Buffer.from(ovalSvg)).resize(targetW, targetH).toBuffer();
    const facePng  = await faceImg.png().toBuffer();
    const faceFinal = await sharp(facePng)
      .composite([{ input: ovalMask, blend: 'dest-in' }])
      .png()
      .toBuffer();

    // 6. Composite onto painting
    const composited = await sharp(paintingBuf)
      .composite([{ input: faceFinal, left: targetX, top: targetY, blend: 'over' }])
      .jpeg({ quality: 90 })
      .toBuffer();

    // 7. Return as base64 data URI
    const outputUrl = `data:image/jpeg;base64,${composited.toString('base64')}`;
    return res.status(200).json({ outputUrl });

  } catch (err) {
    console.error('Composite error:', err);
    return res.status(500).json({ error: err.message || 'Compositing failed' });
  }
}
