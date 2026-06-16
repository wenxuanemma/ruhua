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
    // Compute faceSize and faceCenter from detected box (fractions within the crop)
    if (data.box && req.body.crop) {
      const { box } = data;
      data.faceSize   = Math.min(1.0, Math.round((box.y2 - box.y) * 100) / 100);
      data.faceCenter = {
        cx: Math.round(((box.x + box.x2) / 2) * 100) / 100,  // fraction of crop width
        cy: Math.round(((box.y + box.y2) / 2) * 100) / 100,  // fraction of crop height
      };
    }
    return res.status(r.ok ? 200 : 500).json(data);
  } catch(e) {
    console.error('detect-face error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
