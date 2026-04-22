// pages/api/generate.js
//
// Face swap pipeline using codeplugtech/face-swap on Replicate.
//
// New approach vs InstantID:
//   - Takes selfie + painting figure crop as target
//   - Swaps the selfie face INTO the painting figure
//   - Result looks painted because the TARGET is a painting
//   - No style transfer needed — painting style comes from the target
//   - Naturally removes glasses, changes lighting to match painting
//
// Pipeline:
//   1. Fetch painting thumbnail
//   2. Crop to the figure's faceRegion (the actual painted face)
//   3. Call face-swap: swap selfie face onto the painted figure crop
//   4. Return the swapped figure crop → composite.js places it back

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

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function pollUntilDone(predictionId, maxWaitMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, 2500));
    const res = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: { 'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}` },
    });
    const data = await res.json();
    if (data.status === 'succeeded') {
      return Array.isArray(data.output) ? data.output[0] : data.output;
    }
    if (data.status === 'failed') throw new Error(data.error || 'Face swap failed');
  }
  throw new Error('Face swap timed out');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { selfie, paintingId, figureId, styleImageUrl } = req.body;
  if (!selfie) return res.status(400).json({ error: 'selfie is required' });

  const region = FACE_REGIONS[paintingId]?.[figureId];
  if (!region) return res.status(400).json({ error: `No region for ${paintingId}/${figureId}` });

  try {
    // 1. Fetch painting thumbnail and crop to figure's face region
    //    This crop becomes the TARGET for face swap — preserves painting style
    const paintingBuf = await fetchBuffer(styleImageUrl);
    const { width: PW, height: PH } = await sharp(paintingBuf).metadata();

    const cropX = Math.max(0, Math.round(region.x * PW));
    const cropY = Math.max(0, Math.round(region.y * PH));
    const cropW = Math.min(Math.round(region.w * PW), PW - cropX);
    const cropH = Math.min(Math.round(region.h * PH), PH - cropY);

    // Upscale the figure crop so face-swap has enough pixels to work with
    const figureCrop = await sharp(paintingBuf)
      .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
      .resize(512, 512, { fit: 'contain', background: { r:200, g:170, b:120, alpha:1 } })
      .jpeg({ quality: 95 })
      .toBuffer();

    const figureB64 = `data:image/jpeg;base64,${figureCrop.toString('base64')}`;

    // 2. Call face-swap: swap selfie face INTO the painted figure
    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait',
      },
      body: JSON.stringify({
        version: '278a81e7ebb22db98bcba54de985d22cc1abeead2754eb1f2af717247be69b34',
        input: {
          swap_image:  selfie,      // source: user's selfie face
          input_image: figureB64,   // target: painted figure crop (model field is input_image)
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Replicate error: ${err}`);
    }

    const prediction = await response.json();

    let outputUrl;
    if (prediction.status === 'succeeded') {
      outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
    } else if (prediction.id) {
      outputUrl = await pollUntilDone(prediction.id);
    } else {
      throw new Error('No prediction output');
    }

    return res.status(200).json({ outputUrl });

  } catch (err) {
    console.error('Generate error:', err);
    return res.status(500).json({ error: err.message || 'Generation failed' });
  }
}
