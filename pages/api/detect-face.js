// pages/api/detect-face.js
// Server-side proxy for MediaPipe face detection.
// Accepts either:
//   { init_image: <base64> }  — direct image
//   { painting_url, crop: {x,y,w,h} }  — fetch painting, crop to region, then detect

import sharp from 'sharp';

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

const LOCAL_SERVER = process.env.LOCAL_INFERENCE_URL;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!LOCAL_SERVER) return res.status(503).json({ error: 'LOCAL_INFERENCE_URL not set' });

  try {
    let imageB64;

    if (req.body.painting_url && req.body.crop) {
      // Fetch painting from URL and crop to figure region
      const { painting_url, crop } = req.body;
      const imgRes = await fetch(painting_url, { signal: AbortSignal.timeout(10000) });
      if (!imgRes.ok) throw new Error(`Failed to fetch painting: ${imgRes.status}`);
      const imgBuf = Buffer.from(await imgRes.arrayBuffer());
      const meta = await sharp(imgBuf).metadata();
      const W = meta.width, H = meta.height;
      const left   = Math.round(crop.x * W);
      const top    = Math.round(crop.y * H);
      const width  = Math.round(crop.w * W);
      const height = Math.round(crop.h * H);
      const cropped = await sharp(imgBuf)
        .extract({ left, top, width, height })
        .resize(256, 256, { fit: 'contain', background: {r:0,g:0,b:0,alpha:1} })
        .jpeg({ quality: 85 })
        .toBuffer();
      imageB64 = `data:image/jpeg;base64,${cropped.toString('base64')}`;
    } else if (req.body.init_image) {
      imageB64 = req.body.init_image;
    } else {
      return res.status(400).json({ error: 'provide init_image or painting_url+crop' });
    }

    const r = await fetch(`${LOCAL_SERVER}/detect-face-mp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ init_image: imageB64 }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await r.json();
    // Compute faceSize and faceCenter from detected box.
    // Must remap from 256x256 contain space back to original crop aspect ratio.
    if (data.box && req.body.crop) {
      const { box } = data;
      const { w: cw, h: ch } = req.body.crop;  // crop fractions of painting
      // Actual crop pixel dimensions (before resizing to 256x256)
      // fit:contain scale factor and padding offsets
      const DETECT_SIZE = 256;
      const cropAspect = cw / ch; // width/height ratio of original crop
      let scaleW, scaleH, padX, padY;
      if (cropAspect > 1) {
        // wider than tall — constrained by width
        scaleW = DETECT_SIZE; scaleH = DETECT_SIZE / cropAspect;
        padX = 0; padY = (DETECT_SIZE - scaleH) / 2;
      } else {
        // taller than wide — constrained by height
        scaleH = DETECT_SIZE; scaleW = DETECT_SIZE * cropAspect;
        padX = (DETECT_SIZE - scaleW) / 2; padY = 0;
      }
      // Remap box from 256x256 space to original crop fraction space
      const remapX = x => Math.max(0, Math.min(1, (x * DETECT_SIZE - padX) / scaleW));
      const remapY = y => Math.max(0, Math.min(1, (y * DETECT_SIZE - padY) / scaleH));
      const rx1 = remapX(box.x), ry1 = remapY(box.y);
      const rx2 = remapX(box.x2), ry2 = remapY(box.y2);
      data.faceSize   = Math.min(1.0, Math.round((ry2 - ry1) * 100) / 100);
      data.faceCenter = {
        cx: Math.round(((rx1 + rx2) / 2) * 100) / 100,
        cy: Math.round(((ry1 + ry2) / 2) * 100) / 100,
      };
    }
    return res.status(r.ok ? 200 : 500).json(data);
  } catch(e) {
    console.error('detect-face error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
