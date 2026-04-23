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
  // Use the actual painted figure's face as ip_adapter style reference.
  // This directly transfers the brushwork, flat lighting, and ochre palette
  // of the original figure — far more accurate than text prompt guessing.
  const input = {
    image:   faceUrl,
    prompt: [
      'portrait, full color, warm tones',
      'traditional painted figure, matte finish',
      'flat even lighting, no photographic shadows',
    ].join(', '),
    negative_prompt: [
      'black and white', 'grayscale', 'monochrome',
      'photorealistic', 'photograph', 'DSLR',
      'subsurface scattering', 'specular highlights',
      'japanese', 'anime', 'blurry', 'bad anatomy',
    ].join(', '),
    prompt_strength:     0.32,
    num_inference_steps: 30,
    guidance_scale:      7.5,
    width:               640,
    height:              640,
  };

  // If we have the actual painted face, use it as strong style reference
  if (paintedFaceB64) {
    input.ip_adapter_image = paintedFaceB64;
    input.ip_adapter_scale = 0.55;  // strong enough to transfer style, low enough to keep identity
  }

  const prediction = await callReplicate({
    version: '39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b',
    input,
  });
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

  const { selfie, paintingId, styleImageUrl, dynasty, faceBounds, faceRegion } = req.body;
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
    // Stage 1: InstantID — identity-preserving face generation
    const prediction = await callReplicate({
      // grandlineai/instant-id-artistic — Dreamshaper-XL base model
      // Produces painterly/artistic output vs photographic protovision-xl
      version: '9cad10c7870bac9d6b587f406aef28208f964454abff5c4152f7dec9b0212a9a',
      input: {
        image: faceImage,
        prompt: [
          'portrait of a person, warm natural skin tones, full color',
          styleDesc,
          'traditional Chinese court hanfu robes',
          'soft warm lighting, elegant court figure, painterly',
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

    const instantIdUrl = await getPredictionOutput(prediction);

    // Stage 2: Paintify using the actual painted figure face as ip_adapter style reference
    const paintedFaceB64 = faceRegion
      ? await extractPaintedFace(styleImageUrl, faceRegion)
      : null;

    let outputUrl;
    try {
      outputUrl = await paintifyFace(instantIdUrl, paintedFaceB64);
    } catch (e) {
      console.warn('Paintify failed, using InstantID output:', e.message);
      outputUrl = instantIdUrl;
    }

    return res.status(200).json({ outputUrl });

  } catch (err) {
    console.error('Generate error:', err);
    return res.status(500).json({ error: err.message || 'Generation failed' });
  }
}
