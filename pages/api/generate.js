// pages/api/generate.js
//
// Two-stage face pipeline:
//   Stage 1 — InstantID: preserve face identity, apply loose style
//   Stage 2 — paintify: img2img at 0.45 strength to make face look genuinely painted
//
// Returns { outputUrl } — the painted face, ready for compositing

export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
};

const DYNASTY_STYLE = {
  '北宋': 'Northern Song dynasty court painting, gongbi fine brushwork, ink and mineral pigments on silk, warm ochre tones, Palace Museum Beijing',
  '五代': 'Five Dynasties period court painting, fine brushwork, muted warm palette, ink on silk',
  '唐':   'Tang dynasty figure painting, mineral pigments on silk, rich warm court colors, flowing robes',
  '东晋': 'Eastern Jin dynasty handscroll, flowing ink line work, muted silk tones, gossamer drapery',
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

async function pollUntilDone(predictionId, maxWaitMs = 90000) {
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
    if (data.status === 'failed') throw new Error(data.error || 'Prediction failed');
  }
  throw new Error('Prediction timed out');
}

async function getPredictionOutput(prediction) {
  if (prediction.status === 'succeeded') {
    return Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  }
  if (prediction.id) return pollUntilDone(prediction.id);
  throw new Error('No prediction ID or output');
}

async function runInstantID({ selfie, styleImageUrl, dynasty, faceBounds }) {
  const styleDesc = DYNASTY_STYLE[dynasty] || 'classical Chinese court painting, ink on silk';

  // If face bounds detected, crop selfie to face region before sending to InstantID
  // This focuses the model on the actual face regardless of where in frame it was
  let faceImage = selfie;
  if (faceBounds) {
    try {
      const sharp = (await import('sharp')).default;
      const base64 = selfie.split(',')[1];
      const buf = Buffer.from(base64, 'base64');
      const meta = await sharp(buf).metadata();
      const iw = meta.width, ih = meta.height;
      const left   = Math.round(faceBounds.x * iw);
      const top    = Math.round(faceBounds.y * ih);
      const width  = Math.round(faceBounds.w * iw);
      const height = Math.round(faceBounds.h * ih);
      const cropped = await sharp(buf)
        .extract({
          left:   Math.max(0, left),
          top:    Math.max(0, top),
          width:  Math.min(width, iw - left),
          height: Math.min(height, ih - top),
        })
        .resize(640, 640, { fit: 'cover', position: 'centre' })
        .jpeg({ quality: 92 })
        .toBuffer();
      faceImage = `data:image/jpeg;base64,${cropped.toString('base64')}`;
    } catch (e) {
      console.warn('Face crop failed, using full selfie:', e.message);
    }
  }

  const prediction = await callReplicate({
    version: 'c98b2e7a196828d00955767813b81fc05c5c9b294c670c6d147d545fed4ceecf',
    input: {
      image:   faceImage,
      prompt: [
        'portrait of a person, warm natural skin tones, full color',
        'traditional Chinese court costume, hanfu silk robes',
        'soft warm lighting, gentle expression',
        'elegant court figure, detailed face',
      ].join(', '),
      negative_prompt: [
        'black and white', 'grayscale', 'monochrome', 'desaturated',
        'ink wash', 'sumi-e', 'sketch', 'drawing',
        'japanese', 'anime', 'manga', 'ukiyo-e', 'kimono', 'geisha', 'samurai',
        'photorealistic background', 'modern clothing', 'western',
        'blurry', 'watermark', 'bad anatomy', 'disfigured',
      ].join(', '),
      // ip_adapter removed — even at low scale it contaminates face with painting's color palette
      // (red from 步辇图, green from vegetation elements, etc.)
      sdxl_weights:        'protovision-xl-high-fidel',
      guidance_scale:      7.5,
      num_inference_steps: 35,
      width:               640,
      height:              640,
    },
  });

  return getPredictionOutput(prediction);
}

// ── Stage 2: Paintify — transform photorealistic face into painted face ────────
// Strength 0.62: strong enough to fully repaint skin texture and lighting,
// while preserving enough facial structure for identity recognition.
async function paintifyFace({ faceUrl, dynasty }) {
  const styleDesc = DYNASTY_STYLE[dynasty] || 'classical Chinese court painting, ink on silk';

  const prediction = await callReplicate({
    version: '39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b',
    input: {
      image:   faceUrl,
      prompt: [
        styleDesc,
        'colored Chinese court painting, NOT ink wash, NOT black and white',
        'warm ochre skin tone, flesh colored face, warm brown complexion',
        'mineral pigment color on silk, color portrait',
        'matte painted skin texture, flat traditional lighting',
        'ink outline defining facial features',
        'same face identity preserved',
      ].join(', '),
      negative_prompt: [
        'black and white', 'grayscale', 'monochrome', 'ink wash', 'sumi-e',
        'photorealistic', 'photograph', 'DSLR', 'glossy skin',
        'dramatic lighting', 'deep shadows', 'high contrast',
        'modern', 'japanese', 'anime', 'manga',
        'oil painting', 'western portrait',
        'blurry', 'distorted', 'bad anatomy',
      ].join(', '),
      prompt_strength:     0.50,   // reduced from 0.62 — was stripping too much color/making face ghost-white
      num_inference_steps: 35,
      guidance_scale:      7.5,
      width:               640,
      height:              640,
    },
  });

  return getPredictionOutput(prediction);
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'selfie is required' });

  const { selfie, paintingId, styleImageUrl, paintingTitle, dynasty, faceBounds } = req.body;
  if (!selfie) return res.status(400).json({ error: 'selfie is required' });

  try {
    // If face bounds were detected client-side, pass them to InstantID
    // so it focuses on the actual face region rather than the full selfie frame
    const outputUrl = await runInstantID({ selfie, styleImageUrl, dynasty, faceBounds });
    return res.status(200).json({ outputUrl });

  } catch (err) {
    console.error('Generate error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
