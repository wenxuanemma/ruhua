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

// ── Stage 1: InstantID — identity-preserving style transfer ──────────────────
async function runInstantID({ selfie, styleImageUrl, dynasty }) {
  const styleDesc = DYNASTY_STYLE[dynasty] || 'classical Chinese court painting, ink on silk';

  const prediction = await callReplicate({
    version: 'c98b2e7a196828d00955767813b81fc05c5c9b294c670c6d147d545fed4ceecf',
    input: {
      image:               selfie,
      prompt: [
        styleDesc,
        'portrait figure in traditional court robes',
        'fine line brushwork, Chinese court aesthetic',
        'warm ochre and vermillion palette',
        'masterwork Chinese figure painting',
      ].join(', '),
      negative_prompt: [
        'japanese', 'anime', 'manga', 'ukiyo-e', 'kimono', 'geisha', 'samurai',
        'photorealistic photograph', 'DSLR', 'modern clothing',
        'oil painting', 'western art', '3d render',
        'blurry', 'watermark', 'text', 'bad anatomy',
      ].join(', '),
      ip_adapter_image:    styleImageUrl,
      ip_adapter_scale:    0.85,
      sdxl_weights:        'juggernaut-xl-v8',
      guidance_scale:      7,
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
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { selfie, paintingId, styleImageUrl, paintingTitle, dynasty } = req.body;
  if (!selfie) return res.status(400).json({ error: 'selfie is required' });

  try {
    // Stage 1: InstantID — get face in loose painting style
    const styledFaceUrl = await runInstantID({ selfie, styleImageUrl, dynasty });

    // Stage 2: Paintify — push it all the way to looking painted
    let paintedFaceUrl;
    try {
      paintedFaceUrl = await paintifyFace({ faceUrl: styledFaceUrl, dynasty });
    } catch (paintErr) {
      console.warn('Paintify failed, falling back to styled face:', paintErr.message);
      paintedFaceUrl = styledFaceUrl; // graceful fallback
    }

    return res.status(200).json({ outputUrl: paintedFaceUrl });

  } catch (err) {
    console.error('Generate error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
