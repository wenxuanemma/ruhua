// pages/api/generate.js
//
// InstantID: identity-preserving style transfer
// Takes selfie → generates face styled as classical Chinese court portrait
// The face is then composited into the painting by composite.js

export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
};

const DYNASTY_STYLE = {
  '北宋': 'Northern Song dynasty court painting, gongbi fine brushwork, mineral pigments on silk, warm ochre tones',
  '五代': 'Five Dynasties period court painting, fine brushwork on silk, muted warm palette',
  '唐':   'Tang dynasty figure painting, mineral pigments on silk, rich warm court colors, flowing robes',
  '东晋': 'Eastern Jin dynasty handscroll, flowing ink line work, muted silk tones',
};

async function callReplicate(body) {
  const response = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json',
      'Prefer': 'wait',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Replicate error: ${err}`);
  }
  return response.json();
}

async function getPredictionOutput(prediction) {
  if (prediction.status === 'succeeded') {
    return Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  }
  if (prediction.id) {
    // Poll
    for (let i = 0; i < 36; i++) {
      await new Promise(r => setTimeout(r, 2500));
      const res = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
        headers: { 'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}` },
      });
      const data = await res.json();
      if (data.status === 'succeeded') return Array.isArray(data.output) ? data.output[0] : data.output;
      if (data.status === 'failed') throw new Error(data.error || 'Generation failed');
    }
    throw new Error('Generation timed out');
  }
  throw new Error('No prediction output');
}

export default async function handler(req, res) {

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { selfie, paintingId, styleImageUrl, dynasty, faceBounds } = req.body;
  if (!selfie) return res.status(400).json({ error: 'selfie is required' });

  const styleDesc = DYNASTY_STYLE[dynasty] || 'classical Chinese court painting, mineral pigments on silk';

  // Pre-crop selfie to face bounds if detected client-side
  let faceImage = selfie;
  if (faceBounds) {
    try {
      const sharp = (await import('sharp')).default;
      const base64 = selfie.split(',')[1];
      const buf = Buffer.from(base64, 'base64');
      const meta = await sharp(buf).metadata();
      const iw = meta.width, ih = meta.height;
      const left   = Math.max(0, Math.round(faceBounds.x * iw));
      const top    = Math.max(0, Math.round(faceBounds.y * ih));
      const width  = Math.min(Math.round(faceBounds.w * iw), iw - left);
      const height = Math.min(Math.round(faceBounds.h * ih), ih - top);
      const cropped = await sharp(buf)
        .extract({ left, top, width, height })
        .resize(640, 640, { fit: 'cover', position: 'centre' })
        .jpeg({ quality: 92 })
        .toBuffer();
      faceImage = `data:image/jpeg;base64,${cropped.toString('base64')}`;
    } catch (e) {
      console.warn('Face crop failed:', e.message);
    }
  }

  try {
    const prediction = await callReplicate({
      version: 'c98b2e7a196828d00955767813b81fc05c5c9b294c670c6d147d545fed4ceecf',
      input: {
        image: faceImage,
        prompt: [
          'portrait of a person, warm natural skin tones, full color',
          styleDesc,
          'traditional Chinese court hanfu robes',
          'soft warm lighting, elegant court figure',
        ].join(', '),
        negative_prompt: [
          // Remove glasses and jewelry — historical male figures didn't wear these
          'glasses', 'eyeglasses', 'spectacles', 'sunglasses',
          'earrings', 'jewelry', 'necklace', 'accessories', 'piercings',
          // Anti-gray
          'black and white', 'grayscale', 'monochrome', 'desaturated',
          'ink wash', 'sumi-e', 'sketch',
          // Anti-Japanese
          'japanese', 'anime', 'manga', 'ukiyo-e', 'kimono', 'geisha', 'samurai',
          // Anti-photo artifacts
          'modern clothing', 'western', 'blurry', 'watermark', 'bad anatomy',
        ].join(', '),
        ip_adapter_image:    styleImageUrl,
        ip_adapter_scale:    0.20,
        sdxl_weights:        'protovision-xl-high-fidel',
        guidance_scale:      7.5,
        num_inference_steps: 35,
        width:               640,
        height:              640,
      },
    });

    const outputUrl = await getPredictionOutput(prediction);
    return res.status(200).json({ outputUrl });

  } catch (err) {
    console.error('Generate error:', err);
    return res.status(500).json({ error: err.message || 'Generation failed' });
  }
}
