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
      // Fetch image and crop to centered face region
      // Take center 80% width, top 75% height — face is centered horizontally
      const imgRes = await fetch(rawUrl);
      const imgBuf = Buffer.from(await imgRes.arrayBuffer());
      const meta = await sharp(imgBuf).metadata();
      const cropW = Math.round(meta.width * 0.80);
      const cropH = Math.round(meta.height * 0.75);
      const cropX = Math.round((meta.width - cropW) / 2); // center horizontally
      const cropY = 0; // start from top
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
