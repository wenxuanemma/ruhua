// pages/api/generate-angles.js
//
// Takes a front-facing gongbi portrait URL and generates angled variants using
// Flux Kontext Pro. Returns all 5 portrait URLs (front + 2 Kontext + 2 flopped).
//
// Kontext generates one direction naturally; sharp .flop() gives the mirror for free.
// Total: 2 Kontext calls ($0.104) for 4 angled portraits.
//
// Response: {
//   front:              <url>,   // original Seedream front portrait
//   three_quarter_a:    <url>,   // Kontext 3/4 (natural direction)
//   three_quarter_b:    <url>,   // flopped 3/4 (opposite direction)
//   profile_a:          <url>,   // Kontext profile (natural direction)
//   profile_b:          <url>,   // flopped profile (opposite direction)
// }
//
// faceAngle → portrait mapping (used by composite.js):
//   'front'              → front
//   'three_quarter_left' → three_quarter_a or _b (determined by calibration)
//   'three_quarter_right'→ three_quarter_b or _a
//   'profile_left'       → profile_a or _b
//   'profile_right'      → profile_b or _a

import sharp from 'sharp';

export const config = { api: { bodyParser: { sizeLimit: '12mb' } } };

const AIML_API_KEY = process.env.AIML_API_KEY;

async function runKontext(imageUrl, prompt) {
  const res = await fetch('https://api.aimlapi.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${AIML_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'flux/kontext-pro/image-to-image',
      image_url: imageUrl,
      prompt,
      aspect_ratio: '1:1',
      guidance_scale: 3.5,
    }),
    signal: AbortSignal.timeout(60000),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `Kontext failed: ${res.status}`);
  return data.images?.[0]?.url || data.data?.[0]?.url;
}

async function urlToBase64DataUrl(url) {
  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

async function bufToDataUrl(buf) {
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { frontPortraitUrl } = req.body;
  if (!frontPortraitUrl) return res.status(400).json({ error: 'frontPortraitUrl required' });

  try {
    // Run both Kontext calls in parallel
    const [tqUrl, profileUrl] = await Promise.all([
      runKontext(frontPortraitUrl,
        'Same person, same gongbi Chinese painting style, same fine brushwork and ochre silk texture. ' +
        'Rotate the face to a three-quarter angle view. Keep all facial features, identity, and painting style identical. ' +
        'Only change the face angle.'
      ),
      runKontext(frontPortraitUrl,
        'Same person, same gongbi Chinese painting style, same fine brushwork and ochre silk texture. ' +
        'Rotate face to strict 90-degree side profile. Only one side of face visible, far eye completely hidden, ear visible. ' +
        'Keep painting style identical.'
      ),
    ]);

    console.log(`[generate-angles] 3/4=${tqUrl?.slice(0,60)} profile=${profileUrl?.slice(0,60)}`);

    // Download Kontext outputs and flop locally for opposite directions
    const [tqBuf, profileBuf] = await Promise.all([
      fetch(tqUrl).then(r => r.arrayBuffer()).then(Buffer.from),
      fetch(profileUrl).then(r => r.arrayBuffer()).then(Buffer.from),
    ]);

    const [tqFloppedBuf, profileFloppedBuf] = await Promise.all([
      sharp(tqBuf).flop().jpeg({ quality: 92 }).toBuffer(),
      sharp(profileBuf).flop().jpeg({ quality: 92 }).toBuffer(),
    ]);

    // Return all 5 as base64 data URLs (stored in memory cache by useGenerate)
    return res.status(200).json({
      front:           frontPortraitUrl,
      three_quarter_a: await bufToDataUrl(tqBuf),
      three_quarter_b: await bufToDataUrl(tqFloppedBuf),
      profile_a:       await bufToDataUrl(profileBuf),
      profile_b:       await bufToDataUrl(profileFloppedBuf),
    });

  } catch (err) {
    console.error('[generate-angles] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
