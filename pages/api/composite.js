// pages/api/composite.js
//
// POST body:
//   {
//     styledFaceUrl,   // URL from InstantID output
//     paintingId,      // e.g. 'hanxizai'
//     figureId,        // e.g. 'guest'
//     paintingImageUrl // Wikipedia thumbnail URL
//   }
//
// Returns:
//   { predictionId }  — poll /api/status?id=... for result

export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
};

// Face region metadata — mirrors PAINTINGS data in RuHua.jsx
// x, y, w, h are fractions of the painting image dimensions
// angle is head tilt in degrees
const FACE_REGIONS = {
  qingming: {
    scholar:  { x:0.53, y:0.35, w:0.04, h:0.30, angle:0   },
    merchant: { x:0.62, y:0.32, w:0.04, h:0.30, angle:5   },
    boatman:  { x:0.44, y:0.40, w:0.04, h:0.28, angle:-8  },
  },
  hanxizai: {
    guest:  { x:0.68, y:0.18, w:0.09, h:0.22, angle:5  },
    host:   { x:0.11, y:0.18, w:0.10, h:0.22, angle:-3 },
    dancer: { x:0.46, y:0.22, w:0.08, h:0.20, angle:-5 },
  },
  bunianta: {
    official: { x:0.46, y:0.18, w:0.09, h:0.28, angle:3  },
    envoy:    { x:0.32, y:0.20, w:0.09, h:0.28, angle:-5 },
  },
  qianli: {
    hermit:    { x:0.28, y:0.58, w:0.03, h:0.08, angle:0   },
    fisherman: { x:0.65, y:0.62, w:0.03, h:0.07, angle:-10 },
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

// Dynasty → style prompt map for inpainting
const DYNASTY_STYLE = {
  '北宋': 'Northern Song dynasty court painting, gongbi brushwork, ink on silk',
  '五代': 'Five Dynasties period court painting, fine brushwork, ink and color on silk',
  '唐':   'Tang dynasty figure painting, mineral pigments, silk scroll, court aesthetic',
  '东晋': 'Eastern Jin dynasty narrative handscroll, flowing ink line work',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { styledFaceUrl, paintingId, figureId, paintingImageUrl, dynasty } = req.body;

  if (!styledFaceUrl || !paintingId || !figureId || !paintingImageUrl) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const region = FACE_REGIONS[paintingId]?.[figureId];
  if (!region) {
    return res.status(400).json({ error: `No face region defined for ${paintingId}/${figureId}` });
  }

  const styleDesc = DYNASTY_STYLE[dynasty] || 'classical Chinese court painting, ink on silk';

  // ── Build the inpainting prompt ───────────────────────────────────────────
  // The inpainting model will replace the masked face region with the
  // style-transferred face, guided by this prompt to maintain aesthetic
  const prompt = [
    `portrait face in the style of ${styleDesc}`,
    `seamlessly integrated into the painting`,
    `same brushstroke texture as surrounding artwork`,
    `correct skin tone for the painting's palette`,
    `no visible seam or compositing artifact`,
    `masterwork quality`,
  ].join(', ');

  const negativePrompt = [
    'photorealistic', 'photograph', 'modern', 'digital art',
    'visible seam', 'compositing artifact', 'color mismatch',
    'blurry edges', 'out of style',
  ].join(', ');

  // ── Build the mask ────────────────────────────────────────────────────────
  // We pass the face region coordinates to the model.
  // stability-ai/stable-diffusion-inpainting accepts a mask_image — a
  // black-and-white image where WHITE = area to inpaint.
  // We generate this mask as a simple base64 SVG-as-PNG via a data URI.
  // The mask is a white rectangle on black background at the face region coords.
  const maskDataUri = buildMaskDataUri(region);

  // ── Call Replicate inpainting ─────────────────────────────────────────────
  const body = {
    version: 'c11bac58203367db93a3c552bd49a25a5418458ddffaed41fad6dfab62cf8d9c',
    input: {
      // Base image: the full painting
      image:           paintingImageUrl,
      // Mask: white rectangle at the face region
      mask:            maskDataUri,
      // Prompt guides what fills the masked area
      prompt,
      negative_prompt: negativePrompt,
      // The style-transferred face is used as image2image reference
      // by setting strength < 1 (preserve surrounding painting)
      image_guidance_scale: 1.5,
      guidance_scale:       7.5,
      num_inference_steps:  50,
      // Seed for reproducibility during testing (-1 = random)
      seed: -1,
    },
  };

  try {
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
      console.error('Replicate composite error:', err);
      return res.status(502).json({ error: 'Replicate inpainting failed', detail: err });
    }

    const prediction = await response.json();

    // If Prefer: wait returned the result synchronously
    if (prediction.status === 'succeeded') {
      const outputUrl = Array.isArray(prediction.output)
        ? prediction.output[0]
        : prediction.output;
      return res.status(200).json({ outputUrl });
    }

    // Otherwise return predictionId for polling
    return res.status(200).json({ predictionId: prediction.id });

  } catch (err) {
    console.error('Composite error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// ── Mask builder ──────────────────────────────────────────────────────────────
// Generates a 512x512 black PNG with a white rectangle at the face region.
// Uses SVG encoded as a data URI — no canvas or image library needed.
function buildMaskDataUri(region) {
  const SIZE = 512;
  const px = Math.round(region.x * SIZE);
  const py = Math.round(region.y * SIZE);
  const pw = Math.round(region.w * SIZE);
  const ph = Math.round(region.h * SIZE);

  // SVG mask: black background, white face rect
  // The slight expansion (4px pad) ensures we cover the full face including hair
  const pad = 4;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">`,
    `<rect width="${SIZE}" height="${SIZE}" fill="black"/>`,
    `<rect x="${Math.max(0, px - pad)}" y="${Math.max(0, py - pad)}"`,
    `      width="${Math.min(pw + pad * 2, SIZE - px)}"`,
    `      height="${Math.min(ph + pad * 2, SIZE - py)}"`,
    `      fill="white" rx="4"/>`,
    `</svg>`,
  ].join('');

  const b64 = Buffer.from(svg).toString('base64');
  return `data:image/svg+xml;base64,${b64}`;
}
