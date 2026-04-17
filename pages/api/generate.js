// pages/api/generate.js  (Next.js pages router)
// or: app/api/generate/route.js  (App router — see bottom of file)
//
// Required env vars:
//   REPLICATE_API_TOKEN=r8_...
//
// POST body:
//   { selfie: "data:image/jpeg;base64,...", paintingId, styleImageUrl, paintingTitle, dynasty }
//
// Returns:
//   { predictionId }   — on acceptance
//   { error }          — on failure

// Increase body size limit — base64 images can be 1.5–3MB
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { selfie, paintingId, styleImageUrl, paintingTitle, dynasty } = req.body;

  if (!selfie) return res.status(400).json({ error: 'selfie is required' });

  // ── Build the style prompt ──────────────────────────────────────────────────
  const prompt = [
    `classical Chinese court painting`,
    `${dynasty} dynasty gongbi brushwork`,
    `portrait figure in hanfu silk robes`,
    `mineral pigment on silk scroll`,
    `Tang or Song dynasty palace figure`,
    `fine line brushwork, Chinese court aesthetic`,
    `warm ochre and vermillion palette`,
    `Beijing Palace Museum collection style`,
    `masterwork Chinese figure painting`,
  ].join(', ');

  const negativePrompt = [
    // Explicitly reject Japanese aesthetics — critical for cultural accuracy
    'japanese', 'japan', 'anime', 'manga', 'ukiyo-e', 'woodblock print',
    'torii gate', 'kimono', 'geisha', 'samurai', 'sakura', 'fuji',
    'jrpg', 'kawaii',
    // General quality negatives
    'photorealistic', 'photograph', 'DSLR', 'modern',
    'oil painting', 'watercolor', 'western art', '3d render',
    'blurry', 'lowres', 'watermark', 'signature', 'text',
    'bad anatomy', 'ugly', 'deformed', 'extra limbs',
  ].join(', ');

  // ── Call Replicate ──────────────────────────────────────────────────────────
  // dreamshaper-xl is an artistic base model — produces painterly results
  // vs protovision-xl-high-fidel which is photorealistic (old setting)
  const body = {
    version: 'c98b2e7a196828d00955767813b81fc05c5c9b294c670c6d147d545fed4ceecf',
    input: {
      image:                selfie,
      prompt,
      negative_prompt:      negativePrompt,
      ip_adapter_image:     styleImageUrl,
      ip_adapter_scale:     0.8,
      sdxl_weights:         'juggernaut-xl-v8',  // less anime bias than dreamshaper-xl
      guidance_scale:       7,                 // slightly higher for stronger style adherence
      num_inference_steps:  40,                // more steps = more refined brushwork texture
      width:                640,
      height:               640,
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
      console.error('Replicate error:', err);
      return res.status(502).json({ error: 'Replicate request failed', detail: err });
    }

    const prediction = await response.json();
    // Return predictionId — client polls /api/status?id=... for result
    return res.status(200).json({ predictionId: prediction.id });

  } catch (err) {
    console.error('Generate error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}


// ── App Router version ────────────────────────────────────────────────────────
// If you're using Next.js 13+ App Router, replace the above with:
//
// export async function POST(request) {
//   const { selfie, styleImageUrl, paintingTitle, dynasty } = await request.json();
//   // ... same logic ...
//   return Response.json({ predictionId: prediction.id });
// }
