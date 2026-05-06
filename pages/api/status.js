// pages/api/status.js
// Polls Replicate prediction status — called by client to avoid Vercel 60s timeout

import sharp from 'sharp';

export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'id required' });

  const response = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
    headers: { 'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}` },
  });

  if (!response.ok) {
    const err = await response.text();
    return res.status(500).json({ error: `Replicate error: ${err}` });
  }

  const prediction = await response.json();

  if (prediction.status === 'succeeded') {
    const rawUrl = Array.isArray(prediction.output)
      ? prediction.output[0]
      : prediction.output;

    try {
      const imgRes = await fetch(rawUrl);
      const imgBuf = Buffer.from(await imgRes.arrayBuffer());
      const meta = await sharp(imgBuf).metadata();
      const imgB64 = `data:image/jpeg;base64,${imgBuf.toString('base64')}`;

      // Default fallback crop: center 80% width, top 85% height
      let cropX = Math.round(meta.width * 0.10);
      let cropY = 0;
      let cropW = Math.round(meta.width * 0.80);
      let cropH = Math.round(meta.height * 0.85);

      // Try face detection on local server for smart crop
      const LOCAL_SERVER = process.env.LOCAL_INFERENCE_URL;
      if (LOCAL_SERVER) {
        try {
          const detectRes = await fetch(`${LOCAL_SERVER}/detect-face`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ init_image: imgB64 }),
            signal: AbortSignal.timeout(5000),
          });
          if (detectRes.ok) {
            const { box } = await detectRes.json();
            if (box) {
              cropX = Math.max(0, Math.round(box.x * meta.width));
              cropY = Math.max(0, Math.round(box.y * meta.height));
              const x2 = Math.min(meta.width,  Math.round(box.x2 * meta.width));
              const y2 = Math.min(meta.height, Math.round(box.y2 * meta.height));
              cropW = x2 - cropX;
              cropH = y2 - cropY;
            }
          }
        } catch (e) {
          console.warn('Face detection failed, using fallback crop:', e.message);
        }
      }

      const cropped = await sharp(imgBuf)
        .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
        .resize(640, 640, { fit: 'cover', position: 'top' })
        .jpeg({ quality: 95 })
        .toBuffer();
      const outputUrl = `data:image/jpeg;base64,${cropped.toString('base64')}`;
      return res.status(200).json({ status: 'succeeded', outputUrl });
    } catch (e) {
      // Fallback to raw URL if crop fails
      return res.status(200).json({ status: 'succeeded', outputUrl: rawUrl });
    }
  }

  if (prediction.status === 'failed') {
    return res.status(200).json({ status: 'failed', error: prediction.error || 'Generation failed' });
  }

  return res.status(200).json({ status: prediction.status });
}
