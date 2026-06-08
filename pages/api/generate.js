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

  const { selfie, paintingId, styleImageUrl, dynasty, faceBounds, faceRegion, figureId, gender } = req.body;
  if (!selfie) return res.status(400).json({ error: 'selfie is required' });

  const styleDesc = DYNASTY_STYLE[dynasty] || 'classical Chinese court painting, mineral pigments on silk';
  const genderPrompt = gender === 'man'
    ? 'man, male face, masculine features'
    : 'woman, female face, feminine features';
  const FIGURE_PROMPTS = {
    // 清明上河图
    qingming_scholar:  'Song dynasty traveling scholar, simple dark robes, plain headwrap',
    qingming_merchant: 'Song dynasty market merchant, plain merchant robes',
    qingming_boatman:  'Song dynasty river boatman, simple working clothes, weathered face',
    // 韩熙载夜宴图
    hanxizai_guest:    'Five Dynasties period nobleman, black gauze official cap, dark formal robes',
    hanxizai_host:     'Five Dynasties period aristocrat, black gauze cap, dignified expression',
    hanxizai_dancer:   'Five Dynasties period court dancer, colorful silk robes, elegant posture',
    // 步辇图
    bunianta_official: 'Tang dynasty court official, red official robes, black gauze cap',
    bunianta_envoy:    'Tibetan envoy in Tang court, distinctive ethnic robes and headdress',
    // 虢国夫人游春图
    guoguo_lady:       'Tang dynasty noblewoman, elaborate silk robes, elegant high hairstyle',
    guoguo_attendant:  'Tang dynasty lady attendant, fine silk robes, graceful bearing',
    guoguo_rider:      'Tang dynasty mounted escort, riding robes, outdoor setting',
    // 洛神赋图
    luoshen_cao:       'Eastern Jin period nobleman poet, flowing robes, contemplative expression',
    luoshen_attendant: "nobleman's attendant in Eastern Jin period, simple elegant robes",
    // 宫乐图
    gongle_listener:   'Tang dynasty court lady, elaborate silk robes, listening to music',
    gongle_musician:   'Tang dynasty court musician playing pipa, colorful silk robes',
    gongle_serving:    'Tang dynasty serving lady, simple silk robes, graceful bearing',
  };

  const figureKey = `${paintingId}_${figureId}`;
  const figureDesc = FIGURE_PROMPTS[figureKey] || 'classical Chinese court figure, elegant robes';

  // Use selfie directly — face bounds pre-crop disabled temporarily for debugging
  let faceImage = selfie;

  // Detect face in selfie server-side for reliable faceBounds.
  // Used by composite.js to crop Seedream output at matching position.
  let selfieFaceBounds = faceBounds || null;
  const LOCAL_SERVER_GEN = process.env.LOCAL_INFERENCE_URL;
  if (!selfieFaceBounds && LOCAL_SERVER_GEN) {
    try {
      const selfieData = selfie.startsWith('data:') ? selfie : `data:image/jpeg;base64,${selfie}`;
      const detectRes = await fetch(`${LOCAL_SERVER_GEN}/detect-face-mp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ init_image: selfieData }),
        signal: AbortSignal.timeout(8000),
      });
      if (detectRes.ok) {
        const { box } = await detectRes.json();
        if (box) {
          const rawW = box.x2 - box.x;
          const rawH = box.y2 - box.y;
          const cx = box.x + rawW / 2;
          const cy = box.y + rawH / 2;
          const clampedW = Math.min(rawW, 0.40);
          const clampedH = Math.min(rawH, 0.38);
          selfieFaceBounds = {
            x: Math.max(0, cx - clampedW / 2),
            y: Math.max(0, cy - clampedH / 2),
            w: clampedW,
            h: clampedH,
          };
          console.log(`[generate] selfieFaceBounds: y=${selfieFaceBounds.y.toFixed(2)} h=${selfieFaceBounds.h.toFixed(2)}`);
        }
      }
    } catch (e) {
      console.warn('[generate] selfie face detection failed:', e.message);
    }
  }

  try {
    const AIML_KEY = process.env.AIML_API_KEY;

    // Primary: Seedream 4.5 — native gongbi style + identity preservation
    if (AIML_KEY) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 55000);

        // Always generate front-facing portrait.
        // Angled variants are generated by /api/generate-angles via Flux Kontext.
        const imageUrls = [faceImage];

        const seedreamPrompt = `工笔画风格人物肖像, ${gender === 'man' ? '男性面孔' : '女性面孔'}, gongbi fine brushwork portrait, Tang dynasty Chinese court painting style, warm ochre vermillion mineral pigments on silk, fine line brushwork, traditional Chinese figure painting, preserve facial features identity likeness of the person in the first photo, facing directly forward frontal view, close-up bust portrait, face and shoulders only, face occupies upper half of image, head centered in frame, no full body`;

        let rawUrl = null;
        for (const model of ['bytedance/seedream-4-5', 'bytedance/seedream-v4-edit']) {
          const seedreamRes = await fetch('https://api.aimlapi.com/v1/images/generations', {
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
          clearTimeout(timeout);

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

    const LOCAL_SERVER = process.env.LOCAL_INFERENCE_URL;
    if (LOCAL_SERVER) {
      try {
        const controller = new AbortController();
        const loraTimeout = setTimeout(() => controller.abort(), 55000);

        const genderNeg = gender === 'man'
          ? 'female, woman, feminine'
          : 'male, man, masculine, beard, mustache, stubble, facial hair';

        const loraRes = await fetch(`${LOCAL_SERVER}/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            prompt: `gongbi_portrait, ${gender === 'man' ? 'man' : 'woman'}, Tang dynasty Chinese court painting, gongbi fine line brushwork, flat 2D matte warm skin, warm ochre and vermillion mineral pigments, no subsurface scattering, no specular highlights, no shadows, flat even lighting, painted on silk, traditional Chinese figure painting`,
            negative_prompt: `photorealistic, photograph, 3d render, 3d cg, subsurface scattering, specular highlight, shadow, modern, anime, oil painting, western art, european, japanese style, ${genderNeg}`,
            init_image: faceImage,
            strength: 0.60,
            steps: 30,
            guidance: 8.0,
            width: 640,
            height: 640,
            seed: -1,
          }),
        });
        clearTimeout(loraTimeout);

        if (loraRes.ok) {
          const buf = Buffer.from(await loraRes.arrayBuffer());
          let outputUrl = `data:image/png;base64,${buf.toString('base64')}`;

          try {
            const sharp = (await import('sharp')).default;
            const meta = await sharp(buf).metadata();

            // Use selfie face detection box to crop LoRA output
            // (face position should correspond between selfie and LoRA output)
            // Square crop centred on image - face position matches between selfie and LoRA output
            let cropX, cropY, cropW, cropH;
            {
              const size = Math.round(meta.height * 0.75);
              cropX = Math.max(0, Math.round((meta.width - size) / 2) + Math.round(meta.width * 0.08));
              cropY = 0;
              cropW = Math.min(size, meta.width  - cropX);
              cropH = Math.min(size, meta.height - cropY);
            }

            const cropped = await sharp(buf)
              .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
              .resize(640, 640, { fit: 'cover', position: 'centre' })
              .jpeg({ quality: 95 })
              .toBuffer();
            outputUrl = `data:image/jpeg;base64,${cropped.toString('base64')}`;
          } catch (e) {
            console.warn('Face crop failed:', e.message);
          }

          return res.status(200).json({ outputUrl, selfieFaceBounds });
        }
      } catch (e) {
        console.warn('LoRA img2img failed, falling back to InstantID:', e.message);
      }
    }

    // Final fallback: InstantID on Replicate
    const prediction = await callReplicate({
      version: 'c98b2e7a196828d00955767813b81fc05c5c9b294c670c6d147d545fed4ceecf',
      input: {
        image: faceImage,
        prompt: [
          `portrait of a ${genderPrompt}, headshot, face and shoulders only`,
          'face centered in frame, close up portrait',
          figureDesc, styleDesc,
          'Tang dynasty Chinese court painting style, gongbi brushwork',
          'flat matte skin, mineral pigments on silk, soft even lighting',
        ].join(', '),
        negative_prompt: [
          'full body', 'whole body', 'torso', 'chest visible',
          ...(gender === 'woman' ? ['male', 'man', 'masculine', 'beard', 'mustache'] : ['female', 'woman', 'feminine']),
          'glasses', 'earrings', 'jewelry', 'braids',
          'black and white', 'grayscale', 'blurry', 'watermark',
          'japanese', 'anime', 'manga', 'ukiyo-e', 'western',
        ].join(', '),
        ip_adapter_image:    styleImageUrl,
        ip_adapter_scale:    0.40,
        sdxl_weights:        'protovision-xl-high-fidel',
        guidance_scale:      7.5,
        num_inference_steps: 35,
        width: 640, height: 640,
      },
    });
    return res.status(200).json({ predictionId: prediction.id });

  } catch (err) {
    console.error('Generate error:', err);
    return res.status(500).json({ error: err.message || 'Generation failed' });
  }
}
