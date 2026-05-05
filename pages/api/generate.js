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

async function paintifyFace(faceUrl, paintedFaceB64) {
  // Flux Kontext: text-guided image editing with strong identity preservation
  // Far more effective than SDXL img2img for style transfer — it edits rather than regenerates
  const prompt = [
    'Convert this photographic portrait into a painted figure from a 10th century Chinese silk handscroll.',
    'Replace all photographic skin texture with flat matte paint — no pores, no subsurface scattering, no specular highlights.',
    'Apply warm ochre and raw umber skin tones typical of Five Dynasties period figure painting.',
    'The face should look like it is painted with mineral pigments on aged silk.',
    'Add subtle visible dry brushstroke texture across the face and neck.',
    'Remove all photographic lighting — replace with flat even ambient light from above.',
    'Preserve the identity, facial structure, eyes, nose, mouth shape, and expression exactly.',
    'Do not add any hair ornaments, braids, headdress, or accessories.',
  ].join(' ');

  const response = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json',
      'Prefer': 'wait',
    },
    body: JSON.stringify({
      input: {
        prompt,
        input_image: faceUrl,
        aspect_ratio: '1:1',
        output_format: 'jpeg',
        safety_tolerance: 6,
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Flux Kontext error: ${err}`);
  }

  const prediction = await response.json();
  return getPredictionOutput(prediction);
}

// Fetch painting thumbnail and crop to the figure's face region
// Returns base64 data URI of the painted face — used as ip_adapter style reference
async function extractPaintedFace(styleImageUrl, faceRegion) {
  try {
    const sharp = (await import('sharp')).default;
    const res = await fetch(styleImageUrl);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const { width: PW, height: PH } = await sharp(buf).metadata();

    const x = Math.max(0, Math.round(faceRegion.x * PW));
    const y = Math.max(0, Math.round(faceRegion.y * PH));
    const w = Math.min(Math.round(faceRegion.w * PW), PW - x);
    const h = Math.min(Math.round(faceRegion.h * PH), PH - y);

    const cropped = await sharp(buf)
      .extract({ left: x, top: y, width: w, height: h })
      .resize(512, 512, { fit: 'contain', background: { r:200, g:170, b:120, alpha:1 } })
      .jpeg({ quality: 92 })
      .toBuffer();

    return `data:image/jpeg;base64,${cropped.toString('base64')}`;
  } catch (e) {
    console.warn('extractPaintedFace failed:', e.message);
    return null;
  }
}


export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { selfie, paintingId, styleImageUrl, dynasty, faceBounds, faceRegion, figureId } = req.body;
  if (!selfie) return res.status(400).json({ error: 'selfie is required' });

  const styleDesc = DYNASTY_STYLE[dynasty] || 'classical Chinese court painting, mineral pigments on silk';

  // Default to woman — InstantID preserves actual face identity from selfie
  // User's real gender comes through naturally via face conditioning
  const genderHint = 'woman';

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
    // Stage 1: InstantID on Replicate — identity-preserving face generation
    const prediction = await callReplicate({
      version: 'c98b2e7a196828d00955767813b81fc05c5c9b294c670c6d147d545fed4ceecf',
      input: {
        image: faceImage,
        prompt: [
          `portrait of a ${genderHint}, headshot, face and shoulders only`,
          'face centered in frame, close up portrait',
          styleDesc,
          'soft warm lighting, elegant court figure, painterly',
        ].join(', '),
        negative_prompt: [
          'full body', 'whole body', 'torso', 'chest visible',
          'glasses', 'eyeglasses', 'spectacles', 'sunglasses',
          'earrings', 'ear rings', 'jewelry', 'necklace', 'accessories',
          'braids', 'braid', 'pigtails', 'hair ornament', 'hair accessory',
          'black and white', 'grayscale', 'monochrome', 'desaturated',
          'ink wash', 'sumi-e', 'sketch',
          'japanese', 'anime', 'manga', 'ukiyo-e', 'kimono', 'geisha',
          'modern clothing', 'western', 'blurry', 'watermark', 'bad anatomy',
        ].join(', '),
        ip_adapter_image:    styleImageUrl,
        ip_adapter_scale:    0.15,
        sdxl_weights:        'protovision-xl-high-fidel',
        guidance_scale:      7.5,
        num_inference_steps: 35,
        width:               640,
        height:              640,
      },
    });

    const instantIdUrl = await getPredictionOutput(prediction);
    return res.status(200).json({ outputUrl: instantIdUrl });

  } catch (err) {
    console.error('Generate error:', err);
    return res.status(500).json({ error: err.message || 'Generation failed' });
  }
}
