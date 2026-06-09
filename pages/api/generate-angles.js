// pages/api/generate-angles.js
//
// Takes a front-facing gongbi portrait URL and generates angled variants using
// Flux Kontext Pro. Returns all 5 portrait URLs (front + 2 Kontext + 2 flopped).
//
// Kontext generates one direction naturally; sharp .flop() gives the mirror for free.
// Total: 2 Kontext calls ($0.104) for 4 angled portraits.
//
// After generation, MediaPipe validates face direction and swaps _a/_b if needed,
// so _a is always left-facing and _b is always right-facing.
//
// Response: {
//   front:              <url>,   // original Seedream front portrait
//   three_quarter_a:    <url>,   // 3/4 left-facing (validated)
//   three_quarter_b:    <url>,   // 3/4 right-facing (validated)
//   profile_a:          <url>,   // profile left-facing (validated)
//   profile_b:          <url>,   // profile right-facing (validated)
// }

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

async function bufToDataUrl(buf) {
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

// Detect face direction via MediaPipe keypoints.
// Returns 'left' if nose is left of eye midpoint, 'right' if right, null if detection fails.
async function detectFacingDirection(buf, label) {
  const LOCAL_SERVER = process.env.LOCAL_INFERENCE_URL;
  if (!LOCAL_SERVER) return null;
  try {
    const resized = await sharp(buf)
      .resize(640, 640, { fit: 'cover' })
      .jpeg({ quality: 85 })
      .toBuffer();
    const res = await fetch(`${LOCAL_SERVER}/detect-face-mp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ init_image: `data:image/jpeg;base64,${resized.toString('base64')}` }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const { keypoints } = await res.json();
    if (!keypoints || keypoints.length < 3) return null;
    const rightEye = keypoints[0], leftEye = keypoints[1], noseTip = keypoints[2];
    const eyeCx = (rightEye.x + leftEye.x) / 2;
    const direction = noseTip.x < eyeCx ? 'left' : 'right';
    console.log(`[generate-angles] ${label} facing=${direction} noseTip.x=${noseTip.x.toFixed(3)} eyeCx=${eyeCx.toFixed(3)}`);
    return direction;
  } catch (e) {
    console.warn(`[generate-angles] direction detect failed for ${label}:`, e.message);
    return null;
  }
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

    // Download Kontext outputs
    const [tqBuf, profileBuf] = await Promise.all([
      fetch(tqUrl).then(r => r.arrayBuffer()).then(Buffer.from),
      fetch(profileUrl).then(r => r.arrayBuffer()).then(Buffer.from),
    ]);

    // Generate flopped variants
    const [tqFloppedBuf, profileFloppedBuf] = await Promise.all([
      sharp(tqBuf).flop().jpeg({ quality: 92 }).toBuffer(),
      sharp(profileBuf).flop().jpeg({ quality: 92 }).toBuffer(),
    ]);

    // Validate face direction — _a must be left-facing, _b right-facing.
    // If Kontext generated right-facing, swap natural and flopped.
    const [tqDir, profileDir] = await Promise.all([
      detectFacingDirection(tqBuf, '3q'),
      detectFacingDirection(profileBuf, 'profile'),
    ]);

    // If detection succeeded and direction is wrong, swap
    const tqA    = (tqDir === 'right') ? tqFloppedBuf : tqBuf;
    const tqB    = (tqDir === 'right') ? tqBuf        : tqFloppedBuf;
    const profA  = (profileDir === 'right') ? profileFloppedBuf : profileBuf;
    const profB  = (profileDir === 'right') ? profileBuf        : profileFloppedBuf;

    console.log(`[generate-angles] direction validation: 3q=${tqDir||'unknown'} profile=${profileDir||'unknown'}`);

    // Return all 5 as base64 data URLs (stored in memory cache by useGenerate)
    return res.status(200).json({
      front:           frontPortraitUrl,
      three_quarter_a: await bufToDataUrl(tqA),
      three_quarter_b: await bufToDataUrl(tqB),
      profile_a:       await bufToDataUrl(profA),
      profile_b:       await bufToDataUrl(profB),
    });

  } catch (err) {
    console.error('[generate-angles] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
