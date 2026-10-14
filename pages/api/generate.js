// pages/api/generate.js
//
// InstantID: identity-preserving style transfer
// Takes selfie → generates face styled as classical Chinese court portrait
// The face is then composited into the painting by composite.js

export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
  // Seedream sometimes takes over a minute; let the function outlive it.
  maxDuration: 300,
};

// -- Credits pre-flight check ------------------------------------------------
// A READ-ONLY balance check, not a deduction -- the actual deduction still
// happens in composite.js, only after a delivered image (see the Option B
// discussion: 1 credit = 1 output, not 1 attempt). This exists purely to
// avoid spending real money on a Seedream call (~$0.04 each) for a request
// that's already going to be rejected downstream anyway. Without this,
// generate.js -- the actually expensive step -- had NO credits awareness at
// all; only composite.js (the cheap step) did. A client with a stale/broken
// purchases SDK (or a tampered one) could hit this endpoint repeatedly at
// 0 balance with nothing stopping the AI spend.
const RC_SECRET_KEY = process.env.RC_SECRET_KEY;
const RC_PROJECT_ID = process.env.RC_PROJECT_ID;
const CREDITS_CURRENCY_CODE = 'CREDITS';

async function hasEnoughCredits(appUserID) {
  // Credits system not configured (e.g. local dev) -- allow through,
  // mirrors the same graceful-skip pattern used in composite.js.
  if (!RC_SECRET_KEY || !RC_PROJECT_ID) return true;
  if (!appUserID) return false; // configured but no customer to check -- reject, not a silent bypass

  try {
    const url = `https://api.revenuecat.com/v2/projects/${RC_PROJECT_ID}/customers/${encodeURIComponent(appUserID)}/virtual_currencies?include_empty_balances=true`;
    const r = await fetch(url, {
      headers: { 'Authorization': `Bearer ${RC_SECRET_KEY}` },
    });
    if (!r.ok) {
      console.warn(`[hasEnoughCredits] RevenueCat balance check failed: ${r.status}`);
      // Fail CLOSED here (treat as insufficient) rather than open -- an API
      // hiccup shouldn't grant free generations. composite.js's own check
      // right before delivery is still the real backstop either way.
      return false;
    }
    const data = await r.json();
    const entry = (data.items || []).find(i => i.currency_code === CREDITS_CURRENCY_CODE);
    return (entry?.balance ?? 0) >= 1;
  } catch (e) {
    console.error('[hasEnoughCredits] request failed:', e);
    return false;
  }
}

async function callReplicate(body) {
  const response = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json',
      // No 'Prefer: wait' — return immediately with predictionId
      // Client polls via /api/poll endpoint to avoid Vercel 60s timeout
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

    // Extract 3× the face region for better pose/direction context.
    // The tight face crop (86×130px for dancer) is too small for Seedream to read
    // direction reliably. A wider crop includes hair, body, and background which
    // all encode pose information.
    const EXPAND = 3.0;
    const faceCx = faceRegion.x + faceRegion.w / 2;
    const faceCy = faceRegion.y + faceRegion.h / 2;
    const expandW = faceRegion.w * EXPAND;
    const expandH = faceRegion.h * EXPAND;
    const ex = Math.max(0, Math.round((faceCx - expandW/2) * PW));
    const ey = Math.max(0, Math.round((faceCy - expandH/2) * PH));
    const ew = Math.min(Math.round(expandW * PW), PW - ex);
    const eh = Math.min(Math.round(expandH * PH), PH - ey);

    const cropped = await sharp(buf)
      .extract({ left: ex, top: ey, width: ew, height: eh })
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

  const { selfie, paintingId, styleImageUrl, dynasty, faceBounds, faceRegion, figureId, gender, look, appUserID } = req.body;
  if (!selfie) return res.status(400).json({ error: 'selfie is required' });

  // Fail fast before spending money on Seedream -- see hasEnoughCredits()
  // above for why this exists here too, not just in composite.js.
  if (!(await hasEnoughCredits(appUserID))) {
    return res.status(402).json({ error: 'insufficient_credits', reason: 'precheck_failed' });
  }


  // Use selfie directly — face bounds pre-crop disabled temporarily for debugging
  let faceImage = selfie;

  // Portrait face detected client-side in useGenerate.js after generation.
  const selfieFaceBounds = null;

  try {
    const AIML_KEY = process.env.AIML_API_KEY;

    // Primary: Seedream 4.5 — native gongbi style + identity preservation
    if (AIML_KEY) {
      try {
        // Always generate front-facing portrait.
        // Angled variants are generated by /api/generate-angles via Flux Kontext.
        const imageUrls = [faceImage];

        // Per-figure look cues (RuHua.jsx figure.look). Without them a man's
        // figure generated from a clean-shaven or female selfie keeps the
        // selfie's features almost unchanged and reads wrong next to a bearded
        // painted face. Figures without a look get exactly the original prompt.
        const LOOK_PROMPTS = {
          bearded: '成年男子, 留有细长八字胡和山羊胡须, mature man with a thin drooping moustache and a goatee beard, masculine jaw, ',
        };
        const lookPrompt = LOOK_PROMPTS[look] || '';
        // 大光明头: hair combed fully back. Composite cuts the portrait's hair away
        // with face-skin segmentation so the painted figure's own hairstyle shows;
        // a fringe or loose strands on the forehead would leave a hole there.
        // Explicitly NOT bald: "combed back" alone drifted into shaved/grey scalps,
        // and segmentation counts a bald scalp as face skin.
        const hairPrompt = '大光明头, 乌黑浓密的头发全部向后梳起盘成发髻, 没有披散的头发, 保留自然发际线, 露出完整额头, 无刘海, 不是光头, thick dark hair all pulled up into a bun, no hair hanging down, natural hairline, full forehead visible, no bangs, not bald, ';
        // Plain background: the longer prompt let Seedream copy the selfie's
        // room (walls, furniture) instead of redrawing it -- users see this
        // portrait behind the loading spinner.
        const bgPrompt = '纯色绢本背景, plain flat silk background, no room, no furniture, no objects behind the person, ';
        // No glasses: classical figures don't wear them, and frames on a turned
        // face break the face cut-out (glasses aren't skin).
        const noGlasses = '不戴眼镜, 去掉眼镜, without glasses, no eyeglasses, bare eyes, ';
        const seedreamPrompt = `工笔画风格人物肖像, ${gender === 'man' ? '男性面孔' : '女性面孔'}, ${lookPrompt}${hairPrompt}${noGlasses}${bgPrompt}gongbi fine brushwork portrait, Tang dynasty Chinese court painting style, warm ochre vermillion mineral pigments on silk, fine line brushwork, traditional Chinese figure painting, preserve facial features identity likeness of the person in the first photo, facing directly forward frontal view, close-up bust portrait, face and shoulders only, face occupies upper half of image, head centered in frame, no full body`;

        let rawUrl = null;
        // Each model gets its own timer. They used to share one 55s abort, so a
        // slow 4.5 also cancelled the v4 backup and the request fell straight
        // through to InstantID (wrong style, glasses kept, no beard cue).
        for (const [model, ms] of [['bytedance/seedream-4-5', 90000], ['bytedance/seedream-v4-edit', 60000]]) {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), ms);
          let seedreamRes;
          try {
          seedreamRes = await fetch('https://api.aimlapi.com/v1/images/generations', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${AIML_KEY}`,
              'Content-Type': 'application/json',
            },
            signal: controller.signal,
            body: JSON.stringify({
              model,
              prompt: seedreamPrompt,
              image_urls: imageUrls,
              image_size: { width: 1920, height: 1920 },
            }),
          });
          } catch (e) {
            console.warn(`${model} error: ${e.message}`);
            continue;
          } finally {
            clearTimeout(timeout);
          }

          if (seedreamRes.ok) {
            const data = await seedreamRes.json();
            rawUrl = data.data?.[0]?.url;
            if (rawUrl) { console.log(`${model} succeeded`); break; }
          } else {
            const err = await seedreamRes.text();
            console.warn(`${model} failed: ${seedreamRes.status} ${err.slice(0,200)}`);
          }
        }

        if (rawUrl) {
            console.log('Seedream succeeded - returning full portrait');
            // Return full portrait — composite.js handles face crop
            try {
              const sharp = (await import('sharp')).default;
              const imgRes = await fetch(rawUrl);
              const imgBuf = Buffer.from(await imgRes.arrayBuffer());
              const outputUrl = `data:image/jpeg;base64,${imgBuf.toString('base64')}`;
              return res.status(200).json({ outputUrl, selfieFaceBounds });
            } catch (e) {
              console.warn('Seedream fetch failed:', e.message);
              return res.status(200).json({ outputUrl: rawUrl });
            }
          }
      } catch (e) {
        console.warn('Seedream error:', e.message);
      }
    }

    // Both Seedream models failed (or timed out). No other fallback: the old
    // InstantID path ignored the prompt (wrong style, glasses, no beard) and its
    // off-style portrait got cached for the selfie. No credit is charged here --
    // deduction only happens after a successful composite.
    return res.status(503).json({ error: '生成失败，请重试 · Generation failed, please try again', reason: 'seedream_unavailable' });

  } catch (err) {
    console.error('Generate error:', err);
    return res.status(500).json({ error: err.message || 'Generation failed' });
  }
}
