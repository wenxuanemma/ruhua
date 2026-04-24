// pages/api/paintify.js
//
// Stage 2: Flux Kontext style transfer
// Runs AFTER generate.js (InstantID) as a separate API call to stay under
// Vercel's 60s function timeout. Client calls this independently.
//
// Input:  { faceUrl }   — InstantID output URL
// Output: { outputUrl } — Flux Kontext paintified face URL

export const config = {
  api: { bodyParser: { sizeLimit: '2mb' } },
};

async function getPredictionOutput(prediction) {
  if (prediction.status === 'succeeded') {
    return Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  }
  if (prediction.id) {
    for (let i = 0; i < 36; i++) {
      await new Promise(r => setTimeout(r, 2500));
      const res = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
        headers: { 'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}` },
      });
      const data = await res.json();
      if (data.status === 'succeeded') return Array.isArray(data.output) ? data.output[0] : data.output;
      if (data.status === 'failed') throw new Error(data.error || 'Paintify failed');
    }
    throw new Error('Paintify timed out');
  }
  throw new Error('No prediction output');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { faceUrl } = req.body;
  if (!faceUrl) return res.status(400).json({ error: 'faceUrl is required' });

  try {
    const response = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait',
      },
      body: JSON.stringify({
        input: {
          prompt: [
            'Convert this photographic portrait into a painted figure from a 10th century Chinese silk handscroll.',
            'Replace all photographic skin texture with flat matte paint — no pores, no subsurface scattering, no specular highlights.',
            'Apply warm ochre and raw umber skin tones typical of Five Dynasties period figure painting.',
            'The face should look like it is painted with mineral pigments on aged silk.',
            'Add subtle visible dry brushstroke texture across the face and neck.',
            'Remove all photographic lighting — replace with flat even ambient light from above.',
            'Preserve the identity, facial structure, eyes, nose, mouth shape, and expression exactly.',
            'Do not add any hair ornaments, braids, headdress, or accessories.',
          ].join(' '),
          input_image:      faceUrl,
          aspect_ratio:     '1:1',
          output_format:    'jpeg',
          safety_tolerance: 6,
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Flux Kontext error: ${err}`);
    }

    const prediction = await response.json();
    const outputUrl = await getPredictionOutput(prediction);
    return res.status(200).json({ outputUrl });

  } catch (err) {
    console.error('Paintify error:', err);
    // Graceful fallback — return original URL so composite can still proceed
    return res.status(200).json({ outputUrl: faceUrl, fallback: true, error: err.message });
  }
}
