// pages/api/composite.js
import sharp from 'sharp';
import { FACE_REGIONS } from '../../lib/faceRegions.js';

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

async function fetchBuf(url) {
  if (url.startsWith('data:')) return Buffer.from(url.split(',')[1], 'base64');
  // Relative paths (e.g. /paintings/gongle.jpg) are served as static assets \u2014
  // read directly from disk to avoid server-side fetch of relative URLs.
  if (url.startsWith('/')) {
    const { readFile } = await import('fs/promises');
    const { join } = await import('path');
    const filePath = join(process.cwd(), 'public', url);
    return await readFile(filePath);
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Failed to fetch: ${url}`);
  return Buffer.from(await r.arrayBuffer());
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { styledFaceUrl, paintingImageUrl, paintingId, figureId, faceBounds } = req.body;
  if (!styledFaceUrl || !paintingImageUrl || !paintingId || !figureId)
    return res.status(400).json({ error: 'Missing required fields' });

  const region = FACE_REGIONS[paintingId]?.[figureId];
  if (!region) return res.status(400).json({ error: `No region for ${paintingId}/${figureId}` });

  try {
    const LOCAL_SERVER = process.env.LOCAL_INFERENCE_URL;

    const [paintingBuf, faceBuf] = await Promise.all([
      fetchBuf(paintingImageUrl),
      fetchBuf(styledFaceUrl),
    ]);

    const { width: PW, height: PH } = await sharp(paintingBuf).metadata();
    const { width: FW, height: FH } = await sharp(faceBuf).metadata();

    // Target region in painting pixels
    const targetX = Math.round(region.x * PW);
    const targetY = Math.round(region.y * PH);
    const targetW = Math.round(region.w * PW);
    const targetH = Math.round(region.h * PH);

    // Use square target \u2014 max of width/height
    const targetSize = Math.max(targetW, targetH);

    console.log(`[composite:${figureId}] painting=${PW}x${PH} region=${targetW}x${targetH} targetSize=${targetSize} faceInput=${FW}x${FH}`);

    // \u2500\u2500 Step 1: Crop face from Seedream portrait \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    // Strategy depends on face angle:
    //
    // FRONT / THREE-QUARTER: use selfie faceBounds to derive crop position.
    //   Seedream is prompted to match selfie framing, so face position in the
    //   1920px output correlates with face position in the selfie. This is
    //   stable across runs for the same selfie.
    //
    // PROFILE: selfie framing doesn't match (Seedream generates a side view).
    //   Use MediaPipe keypoints on the Seedream output \u2014 keypoints are stable
    //   even when the bbox is inflated by hair/robes.

    const isProfile    = region.faceAngle && region.faceAngle.includes('profile');
    const isFront      = !region.faceAngle || region.faceAngle === 'front';
    let faceCropBuf = faceBuf;
    let faceCropBox = null;
    let cropX, cropY, cropSize;
    let faceCenterInCropX = null, faceCenterInCropY = null;
    let chinInCrop = null;
    let profileFaceWidthFrac = null;
    let cropMethod = 'fallback';

    // Selfie-based crop only for front-facing figures \u2014 three-quarter and profile
    // figures have different poses than the selfie so faceBounds doesn't apply.
    if (isFront && faceBounds && faceBounds.w > 0 && faceBounds.h > 0) {
      // \u2500\u2500 Front/3Q: portrait face bounds crop \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
      // faceBounds detected directly from portrait via client MediaPipe.
      // Horizontal: always center on portrait midpoint (Seedream always generates
      // a centered face \u2014 detected x is unreliable due to hair/background inflation).
      // Vertical: use faceBounds.y for forehead position with asymmetric padding.
      // If landmarks+ink scan available, use precise forehead/chin positions.
      // Otherwise fall back to chin-anchored bounding box estimate.
      let faceCenterY_frac, cropTopFrac, cropBotFrac;
      if (faceBounds.fromLandmarks && faceBounds.foreheadY != null && faceBounds.chinY != null) {
        // Compute cropSize so face height in pasteS matches 2*ovalRy exactly.
        // This ensures the portrait face fills the calibrated oval in the painting.
        // ovalRy = (targetH/targetSize) * targetSize * 0.42
        // faceInPS = faceH_lm*FH/cropSize * pasteS = 2*ovalRy → cropSize = faceH_lm*FH*pasteS/(2*ovalRy)
        const faceH_lm = faceBounds.chinY - faceBounds.foreheadY;
        const ovalRy_target = Math.min((targetH / targetSize) * targetSize * 0.50, targetSize * 0.50);
        const idealCropSize = Math.round((faceH_lm * FH * targetSize) / (2 * ovalRy_target));
        faceCenterY_frac = faceBounds.centerY ?? (faceBounds.foreheadY + faceBounds.chinY) / 2;
        cropTopFrac = Math.max(0, faceCenterY_frac - (idealCropSize / FH) / 2);
        cropBotFrac = Math.min(1, faceCenterY_frac + (idealCropSize / FH) / 2);
        console.log(`[composite:${figureId} crop] LANDMARKS-TIGHT forehead=${faceBounds.foreheadY.toFixed(3)} chin=${faceBounds.chinY.toFixed(3)} faceH=${faceH_lm.toFixed(3)} idealCropSize=${idealCropSize} ovalRy=${ovalRy_target.toFixed(1)}`);
      } else {
        // Fallback: chin-anchored formula
        const faceH = Math.min(faceBounds.h, 0.40);
        const chinY = faceBounds.y + faceBounds.h;
        faceCenterY_frac = chinY - faceBounds.h * 0.55;
        const halfCrop = faceH * (0.5 + 0.40) * 1.5;
        cropTopFrac = Math.max(0, faceCenterY_frac - halfCrop);
        cropBotFrac = Math.min(1, faceCenterY_frac + halfCrop);
      }
      const cropHeightFrac = cropBotFrac - cropTopFrac;
      // Use face height as crop size, but at least 50% of portrait
      cropSize = Math.round(Math.max(cropHeightFrac, 0.50) * FH);
      // Always center horizontally on portrait midpoint
      cropX = Math.max(0, Math.min(Math.round(FW / 2 - cropSize / 2), FW - cropSize));
      cropY = Math.max(0, Math.min(Math.round(cropTopFrac * FH), FH - cropSize));
      cropMethod = 'portrait-face';
      faceCenterInCropX = Math.round(FW / 2) - cropX;
      faceCenterInCropY = Math.round(faceCenterY_frac * FH) - cropY;
      if (faceBounds.fromLandmarks && faceBounds.chinY != null) {
        chinInCrop = Math.round(faceBounds.chinY * FH) - cropY;
      }
      console.log(`[composite:${figureId} crop] PORTRAIT-FACE faceBounds=(${faceBounds.x.toFixed(2)},${faceBounds.y.toFixed(2)},${faceBounds.w.toFixed(2)},${faceBounds.h.toFixed(2)}) cropSize=${cropSize} cropX=${cropX} cropY=${cropY}`);


    } else {
      // \u2500\u2500 Profile (or no faceBounds): MediaPipe keypoints on Seedream output \u2500\u2500
      if (LOCAL_SERVER && FW > 500) {
        try {
          // Front figures: detect-face-mp (fast, no outline needed).
          // Profile/3Q: detect-face-full (outline + MediaPipe for precise vertical bounds).
          const detectBuf = await sharp(faceBuf).jpeg({ quality: 85 }).toBuffer();
          const detectEndpoint = isFront ? 'detect-face-mp' : 'detect-face-full';
          const detectRes = await fetch(`${LOCAL_SERVER}/${detectEndpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ init_image: `data:image/jpeg;base64,${detectBuf.toString('base64')}` }),
            signal: AbortSignal.timeout(20000),
          });
          if (detectRes.ok) {
            const detectRaw = await detectRes.json();
            const { box, keypoints } = isFront ? detectRaw : (detectRaw.mediapipe || {});
            const outline = isFront ? null : (detectRaw.outline || null);
            if (box) {
              const bboxW  = Math.round((box.x2 - box.x) * FW);
              const bboxCx = Math.round(((box.x + box.x2) / 2) * FW);

              if (keypoints && keypoints.length >= 4) {
                const kpX = kp => Math.round(kp.x * FW);
                const kpY = kp => Math.round(kp.y * FH);
                const rightEye = { x: kpX(keypoints[0]), y: kpY(keypoints[0]) };
                const leftEye  = { x: kpX(keypoints[1]), y: kpY(keypoints[1]) };
                const noseTip  = { x: kpX(keypoints[2]), y: kpY(keypoints[2]) };
                const mouth    = { x: kpX(keypoints[3]), y: kpY(keypoints[3]) };
                const eyeCx      = Math.round((rightEye.x + leftEye.x) / 2);
                const eyeCy      = Math.round((rightEye.y + leftEye.y) / 2);
                const eyeToMouth = Math.abs(mouth.y - eyeCy);

                // Discard if keypoints are off-image or implausible face size
                if (eyeCy < 50 || eyeCy > FH * 0.85 || eyeToMouth < 100 || eyeToMouth > FH * 0.60) {
                  console.warn(`[composite] Invalid keypoints: eyeCy=${eyeCy} eyeToMouth=${eyeToMouth} \u2014 using bbox fallback`);
                  throw new Error('invalid keypoints');
                }

                // Use outline for vertical bounds only for profile/3Q, and only if
                // it passes sanity check: foreheadTop above eyes, chinBottom below mouth.
                const outlineFt = outline ? Math.round(outline.foreheadTop * FH) : null;
                const outlineCb = outline ? Math.round(outline.chinBottom  * FH) : null;
                const outlineValid = !isFront && outlineFt !== null && outlineCb !== null
                  && outlineFt < eyeCy    // forehead must be above eyes
                  && outlineCb > mouth.y; // chin must be below mouth
                const foreheadTop = outlineValid
                  ? Math.max(0, outlineFt)
                  : Math.max(0, eyeCy - Math.round(eyeToMouth * 1.2));
                const chinBottom = outlineValid
                  ? Math.min(FH, outlineCb)
                  : Math.round(mouth.y + Math.round(eyeToMouth * 0.90));
                const landmarkH   = chinBottom - foreheadTop;
                console.log(`[composite:${figureId} bounds] ${outlineValid ? 'outline' : 'estimated'} foreheadTop=${foreheadTop} chinBottom=${chinBottom} landmarkH=${landmarkH} (outline=${outlineFt !== null ? `ft=${outlineFt} cb=${outlineCb} valid=${outlineValid}` : 'null'})`);
                // cropSize and face center depend on face angle:
                // - Profile: unchanged \u2014 max(landmarkH, bboxW) + 40, centered on (backOfHead+noseTip)/2
                // - 3/4: landmarkH + 40 (bboxW includes background); X centered on near eye (closer to audience)
                // - Front: landmarkH + 40, centered on eyeCx
                // Y center always = (foreheadTop + chinBottom) / 2
                const faceCenterY = Math.round((foreheadTop + chinBottom) / 2);
                let faceCenterX;
                if (isProfile) {
                  const facingRight = noseTip.x > eyeCx;
                  const backOfHead  = facingRight ? Math.round(box.x * FW) : Math.round(box.x2 * FW);
                  faceCenterX = Math.round((backOfHead + noseTip.x) / 2);
                  const faceSpanX = Math.abs(noseTip.x - backOfHead);
                  profileFaceWidthFrac = faceSpanX / Math.max(landmarkH, 1);
                  // Use landmarkH only \u2014 bboxW inflates crop unnecessarily for profile faces
                  cropSize = Math.min(landmarkH + 40, 1500);
                } else if (!isFront) {
                  // 3/4: near eye (facing direction determines which eye is closer to audience)
                  const facingRight = noseTip.x > eyeCx;
                  const nearEye = facingRight ? rightEye : leftEye;
                  faceCenterX = nearEye.x;
                  cropSize = Math.min(landmarkH + 40, 1500);
                } else {
                  faceCenterX = eyeCx;
                  cropSize = Math.min(landmarkH + 40, 1500);
                }
                cropX = Math.max(0, Math.min(faceCenterX - Math.round(cropSize / 2), FW - cropSize));
                cropY = Math.max(0, Math.min(faceCenterY - Math.round(cropSize / 2), FH - cropSize));
                faceCenterInCropX = faceCenterX - cropX;
                faceCenterInCropY = faceCenterY - cropY;
                cropMethod = 'keypoints';
                console.log(`[composite:${figureId} crop] KEYPOINTS eye=(${eyeCx},${eyeCy}) mouth=(${mouth.x},${mouth.y}) faceCenter=(${faceCenterX},${faceCenterY}) bboxW=${bboxW} landmarkH=${landmarkH} cropSize=${cropSize} cropX=${cropX} cropY=${cropY}`);

              } else {
                // Keypoints unavailable \u2014 bbox fallback
                const faceTop   = Math.round(box.y * FH);
                const faceH     = Math.round((box.y2 - box.y) * FH);
                cropSize = Math.round(FW * (isProfile ? 0.38 : 0.50));
                cropX = Math.max(0, Math.min(bboxCx - Math.round(cropSize / 2), FW - cropSize));
                cropY = Math.max(0, Math.min(faceTop - Math.round(cropSize * 0.08), FH - cropSize));
                cropMethod = 'bbox';
                console.log(`[composite:${figureId} crop] BBOX faceTop=${faceTop} bboxW=${bboxW} cropSize=${cropSize} cropX=${cropX} cropY=${cropY}`);
              }
            }
          }
        } catch (e) {
          console.warn('Composite face detection failed:', e.message);
        }
      }
    }

    // Apply crop if we have valid coordinates
    if (cropSize && cropSize > 0) {
      faceCropBox = { x: cropX/FW, y: cropY/FH, w: cropSize/FW, h: cropSize/FH };
      faceCropBuf = await sharp(faceBuf)
        .extract({ left: cropX, top: cropY, width: cropSize, height: cropSize })
        .jpeg({ quality: 95 })
        .toBuffer();
    }
    console.log(`[composite:${figureId}] cropMethod=${cropMethod} cropSize=${cropSize}`);

    // \u2500\u2500 Step 2: Resize face to exact square \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    let faceImg = sharp(faceCropBuf);

    // Resize to exact targetSize x targetSize square (face is upright from Seedream)
    const facePng = await faceImg
      .resize(targetSize, targetSize, { fit: 'cover', position: 'centre' })

      .png()
      .toBuffer();

    // Verify exact dimensions
    const fpMeta = await sharp(facePng).metadata();
    const S = fpMeta.width; // guaranteed square

    // \u2500\u2500 Step 2: Color matching \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    const safeX = Math.max(0, targetX);
    const safeY = Math.max(0, targetY);
    const safeW = Math.min(targetW, PW - safeX);
    const safeH = Math.min(targetH, PH - safeY);

    // Sample painting: use per-figure skinSample if defined (points to actual painted skin),
    // otherwise fall back to tight 20% patch at 38% down the region (may hit hair/hat).
    let faceCenterX, faceCenterY, patchSize;
    if (region.skinSample) {
      // skinSample.cx/cy are painting fractions; r is patch radius fraction
      faceCenterX = Math.round(region.skinSample.cx * PW);
      faceCenterY = Math.round(region.skinSample.cy * PH);
      patchSize   = Math.max(4, Math.round(region.skinSample.r * 2 * Math.min(PW, PH)));
    } else {
      faceCenterX = Math.round(safeX + safeW * 0.50);
      faceCenterY = Math.round(safeY + safeH * 0.65);  // 65% down = cheek/lower face area
      patchSize   = Math.max(4, Math.round(Math.min(safeW, safeH) * 0.20));
    }
    const sampleX = Math.max(0, Math.min(faceCenterX - Math.round(patchSize / 2), PW - patchSize));
    const sampleY = Math.max(0, Math.min(faceCenterY - Math.round(patchSize / 2), PH - patchSize));

    const paintingRaw = await sharp(paintingBuf)
      .extract({ left: sampleX, top: sampleY, width: patchSize, height: patchSize })
      .resize(8, 8, { fit: 'fill' }).removeAlpha().raw().toBuffer();

    // Sample a 20% patch shifted up 10% from center \u2014 lands on cheeks/nose,
    // avoids hair at top and neck/clothing at bottom. Tighter than 30% to stay on skin.
    const fSampleSize = Math.round(S * 0.20);
    const fSampleLeft = Math.round((S - fSampleSize) / 2);
    const fSampleTop  = Math.round(S * 0.50);  // 50% from top = mid-cheek/jaw area
    const faceRaw = await sharp(facePng)
      .extract({ left: fSampleLeft, top: fSampleTop, width: fSampleSize, height: fSampleSize })
      .resize(8, 8).removeAlpha().raw().toBuffer();

    function stats(buf) {
      const n = buf.length / 3;
      let r=0,g=0,b=0;
      for (let i=0; i<buf.length; i+=3) { r+=buf[i]; g+=buf[i+1]; b+=buf[i+2]; }
      const rm=r/n, gm=g/n, bm=b/n;
      let rv=0,gv=0,bv=0;
      for (let i=0; i<buf.length; i+=3) { rv+=(buf[i]-rm)**2; gv+=(buf[i+1]-gm)**2; bv+=(buf[i+2]-bm)**2; }
      return { rm, gm, bm, rs:Math.sqrt(rv/n)||1, gs:Math.sqrt(gv/n)||1, bs:Math.sqrt(bv/n)||1 };
    }

    const ps = stats(paintingRaw), fs = stats(faceRaw);

    // SHIFT controls how far to pull face tone toward painting sample (0=none, 1=full match).
    // Global default 0.75; per-figure override via region.colorShift in faceRegions.js.
    // Per-figure channel caps via region.rMax, region.bMax to prevent over-correction.
    const SHIFT = region.colorShift ?? 0.75;
    const rMax  = region.rMax ?? 1.90;
    const bMax  = region.bMax ?? 1.10;
    const rM = Math.min(rMax, Math.max(0.3, 1 + (ps.rm / Math.max(fs.rm, 1) - 1) * SHIFT));
    const gM = Math.min(1.9,  Math.max(0.3, 1 + (ps.gm / Math.max(fs.gm, 1) - 1) * SHIFT));
    const bM = Math.min(bMax, Math.max(0.3, 1 + (ps.bm / Math.max(fs.bm, 1) - 1) * SHIFT));

    console.log(`[composite:${figureId} color] paintSample=(${ps.rm.toFixed(1)},${ps.gm.toFixed(1)},${ps.bm.toFixed(1)}) faceMean=(${fs.rm.toFixed(1)},${fs.gm.toFixed(1)},${fs.bm.toFixed(1)}) scale=(${rM.toFixed(3)},${gM.toFixed(3)},${bM.toFixed(3)})`);

    // Color match \u2014 keep exact S x S dimensions
    const colorFace = await sharp(facePng)
      .removeAlpha()
      .recomb([[rM,0,0],[0,gM,0],[0,0,bM]])
      .modulate({ saturation: region.saturation ?? 0.72, brightness: region.brightness ?? 1.0 })
      .png()
      .toBuffer();

    // Force exact S x S after color operations (recomb can shift by 1px)
    const colorFaceExact = await sharp(colorFace)
      .resize(S, S, { fit: 'fill' })
      .png()
      .toBuffer();


    // ── Texture overlay ────────────────────────────────────────────────────────
    // Extract the painting texture from the face region and composite it over
    // the color-corrected face using soft-light blend. Transfers canvas grain and
    // brushstroke texture onto the smooth portrait face, making it read as painted.
    let pasteFace = colorFaceExact;
    try {
      // Use skinSample center (known good skin area) as the texture source.
      // Extract S×S patch centered on skinSample, fallback to face region center.
      const skinCx = region.skinSample ? Math.round(region.skinSample.cx * PW) : Math.round(targetX + targetW * 0.5);
      const skinCy = region.skinSample ? Math.round(region.skinSample.cy * PH) : Math.round(targetY + targetH * 0.5);
      const texX = Math.max(0, Math.min(skinCx - Math.round(S / 2), PW - S));
      const texY = Math.max(0, Math.min(skinCy - Math.round(S / 2), PH - S));
      const texW = Math.min(S, PW - texX);
      const texH = Math.min(S, PH - texY);

      const texturePatch = await sharp(paintingBuf)
        .extract({ left: texX, top: texY, width: Math.max(1, texW), height: Math.max(1, texH) })
        .resize(S, S, { fit: 'fill' })
        .removeAlpha()
        .blur(0.8)
        .png()
        .toBuffer();

      // High-pass texture: subtract blurred version to isolate grain only.
      // Then blend at low opacity using 'soft-light' so only fine texture transfers, not color.
      const texBlurred = await sharp(texturePatch).blur(8).png().toBuffer();

      // Normalize grain to mid-grey (128) baseline so it has no net color effect:
      // grain = texturePatch desaturated, contrast reduced toward 128
      const grainOnly = await sharp(texturePatch)
        .greyscale()
        .linear(0.25, 96)  // compress toward mid-grey: output = input*0.25 + 96 → range ~96-160
        .png()
        .toBuffer();

      // Blend grain onto face at soft-light: values near 128 = no effect, slight variation adds texture
      pasteFace = await sharp(colorFaceExact)
        .composite([{ input: grainOnly, blend: 'soft-light' }])
        .png()
        .toBuffer();

      console.log(`[composite:${figureId}] texture overlay: texX=${texX} texY=${texY}`);
    } catch(e) {
      console.warn(`[composite:${figureId}] texture overlay failed: ${e.message}`);
    }

    // Face-fitted oval mask \u2014 sized and positioned to match actual face bounds in the crop.
    // Oval rx/ry: sized to match the painting region (calibrated in calibrate tool).
    // Landmark data is used for positioning (ovalCy) but not for oval size \u2014
    // the oval must fit the painted figure's face, not the portrait face.
    // Oval sized to match painting region \u2014 always region-based, not portrait-derived.
    // The crop already excludes hair/neck via landmarks; the oval covers the painted figure.
    const pasteS = S;
    const ovalRy     = Math.min((targetH / targetSize) * pasteS * 0.50, pasteS * 0.50);
    const ovalRxBase = Math.min((targetW / targetSize) * pasteS * 0.50, pasteS * 0.50);
    // Profile: use actual face width for rx
    const ovalRx = (isProfile && profileFaceWidthFrac)
      ? Math.min(profileFaceWidthFrac * ovalRy * 1.1, pasteS * 0.48)
      : ovalRxBase;
    const ovalR  = Math.min(ovalRx, ovalRy);
    // Oval center: use face center from crop detection if available.
    const ovalCx = faceCenterInCropX != null
      ? Math.max(pasteS * 0.25, Math.min(pasteS * 0.75, (faceCenterInCropX / cropSize) * pasteS))
      : pasteS * 0.50;

    // Center oval on face midpoint (yellow landmark dot = midpoint of hairline\u2192chin).
    // idealCropSize already ensures face fits within ovalRy, so centering on
    // faceCenterInCropY aligns the oval symmetrically with the face.
    const ovalCy = faceCenterInCropY != null
      ? Math.max(pasteS * 0.25, Math.min(pasteS * 0.75, (faceCenterInCropY / cropSize) * pasteS))
      : pasteS * 0.50;
    // Plain sharp polygon mask with forehead points lifted to hairlineY.
    const FACE_OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,
      397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109,10];
    const landmarks = req.body.landmarks ?? null;
    let ovalMask;

    if (landmarks && landmarks.length >= 468) {
      try {
        const lmPx = (lm) => (lm.x * FW - cropX) / cropSize * pasteS;
        const lmPy = (lm) => (lm.y * FH - cropY) / cropSize * pasteS;

        const x21  = lmPx(landmarks[21]),  y21  = lmPy(landmarks[21]);
        const x251 = lmPx(landmarks[251]), y251 = lmPy(landmarks[251]);

        // Jaw: FACE_OVAL positions 5..31 = 251→389→...→162→21 (right cheek, chin, left cheek)
        const jawIndices = [251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21];
        const jawPoints = jawIndices.slice(1)
          .map(i => { const l = landmarks[i]; return `L ${lmPx(l).toFixed(1)} ${lmPy(l).toFixed(1)}`; })
          .join(' ');

        let pathD;
        let svgContent;
        if (region.foreheadClip) {
          // Hat/headwear: use full unmodified FACE_OVAL polygon — hat covers the top so
          // raw lm[10] position is fine, no arc needed.
          const points = FACE_OVAL.map(i => {
            const l = landmarks[i];
            return `${lmPx(l).toFixed(1)},${lmPy(l).toFixed(1)}`;
          }).join(' ');
          svgContent = `<polygon points="${points}" fill="white"/>`;
          console.log(`[composite:${figureId}] mask: raw polygon (hat covers top)`);
        } else {
          // Visible forehead: cubic bezier arc from lm[21]→lm[251] with vertical tangents.
          // CP1=(x21,0) CP2=(x251,0) — arc peaks at y≈36px, hair covers gap to hairlineY.
          const pathD = [
            `M ${x251.toFixed(1)} ${y251.toFixed(1)}`,
            jawPoints,
            `C ${x21.toFixed(1)} 0 ${x251.toFixed(1)} 0 ${x251.toFixed(1)} ${y251.toFixed(1)}`,
            'Z'
          ].join(' ');
          svgContent = `<path d="${pathD}" fill="white"/>`;
          console.log(`[composite:${figureId}] mask: bezier arc hairline`);
        }

        const polygonSvg = `<svg width="${pasteS}" height="${pasteS}" xmlns="http://www.w3.org/2000/svg">
          ${svgContent}
        </svg>`;

        ovalMask = await sharp(Buffer.from(polygonSvg))
          .resize(pasteS, pasteS, { fit: 'fill' })
          .greyscale()
          .png()
          .toBuffer();


      } catch(e) {
        console.warn(`[composite:${figureId}] polygon mask failed: ${e.message}`);
      }
    }

    if (!ovalMask) {
      // Fallback: gradient ellipse (no landmarks available)
      const maskSvg = `<svg width="${pasteS}" height="${pasteS}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="g" cx="50%" cy="50%" rx="50%" ry="50%">
            <stop offset="75%" stop-color="white" stop-opacity="1"/>
            <stop offset="88%" stop-color="white" stop-opacity="0.70"/>
            <stop offset="95%" stop-color="white" stop-opacity="0.20"/>
            <stop offset="100%" stop-color="white" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <ellipse cx="${ovalCx}" cy="${ovalCy}" rx="${ovalRx}" ry="${ovalRy}" fill="url(#g)"/>
      </svg>`;
      ovalMask = await sharp(Buffer.from(maskSvg))
        .resize(pasteS, pasteS, { fit: 'fill' })
        .png()
        .toBuffer();
    }
    // \u2500\u2500 Step 4: Paste onto painting \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    // Apply oval gradient mask while face is upright (correct oval cut)
    let masked = await sharp(pasteFace)
      .ensureAlpha()
      .composite([{ input: ovalMask, blend: 'dest-in' }])
      .png().toBuffer();

    // Then rotate the masked face to match the painting character's head tilt.
    // Sharp.rotate(+angle) = clockwise. region.angle convention: positive = CW tilt in painting.
    // Sharp expands canvas on rotation \u2014 track new size for correct paste centering.
    let maskedSize = pasteS;
    if (region.angle && region.angle !== 0) {
      masked = await sharp(masked)
        .rotate(region.angle, { background: { r:0, g:0, b:0, alpha:0 } })
        .png().toBuffer();
      const a = Math.abs(region.angle) * Math.PI / 180;
      maskedSize = Math.round(pasteS * (Math.abs(Math.cos(a)) + Math.abs(Math.sin(a))));
    }

    // Paste centered on region center (50% x, 55% y \u2014 matches calibrate oval position)
    const cx = targetX + Math.round(targetW * 0.50);
    const cy = targetY + Math.round(targetH * 0.50);
    const px = Math.max(0, Math.min(cx - Math.round(maskedSize / 2), PW - maskedSize));
    const py = Math.max(0, Math.min(cy - Math.round(maskedSize / 2), PH - maskedSize));

    console.log(`[composite:${figureId} paste] S=${S} pasteS=${pasteS} maskedSize=${maskedSize} px=${px} py=${py} ovalRx=${ovalRx.toFixed(0)} ovalRy=${ovalRy.toFixed(0)} ovalCx=${ovalCx.toFixed(0)} ovalCy=${ovalCy.toFixed(0)} profileFaceWidthFrac=${profileFaceWidthFrac?.toFixed(2)??'null'} faceCenterInCropX=${faceCenterInCropX?.toFixed(0)??'null'} cropSize=${cropSize}`);

    const cW = Math.min(maskedSize, PW - px);
    const cH = Math.min(maskedSize, PH - py);
    const pasteBuf = (cW === maskedSize && cH === maskedSize)
      ? masked
      : await sharp(masked).extract({ left:0, top:0, width:cW, height:cH }).png().toBuffer();
    // Composite at full painting resolution first (needed for accurate profile crop)
    const compositedFull = await sharp(paintingBuf)
      .composite([{ input: pasteBuf, left: px, top: py, blend: 'over' }])
      .png().toBuffer();

    // ── Step 5: Profile crop (from full-res composited) ───────────────────────
    const pad = Math.round(targetH * 1.5);
    const profX = Math.max(0, px - pad);
    const profY = Math.max(0, py - pad);
    const profW = Math.min(PW - profX, S + pad * 2);
    const profH = Math.min(PH - profY, S + pad * 2);

    const profileBuf = await sharp(compositedFull)
      .extract({ left: profX, top: profY, width: Math.max(1,profW), height: Math.max(1,profH) })
      .resize(400, 400, { fit: 'cover' })
      .jpeg({ quality: 90 })
      .toBuffer();

    // Downscale full painting before returning — full 4000px JPEG exceeds 4MB API route limit.
    const paintingScale = Math.min(1, 1200 / Math.max(PW, PH));
    const outW = Math.round(PW * paintingScale);
    const outH = Math.round(PH * paintingScale);
    const composited = await sharp(compositedFull)
      .resize(outW, outH, { fit: 'fill' })
      .jpeg({ quality: 85 }).toBuffer();
    // Debug: masked face — resize mask to match pasteFace exactly before compositing
    let maskedDebug = null;
    try {
      const debugMask = await sharp(ovalMask)
        .resize(pasteS, pasteS, { fit: 'fill' })
        .greyscale()
        .png()
        .toBuffer();
      // Break into two calls — Sharp can't chain resize after composite reliably
      const maskedFull = await sharp(pasteFace)
        .resize(pasteS, pasteS, { fit: 'fill' })
        .ensureAlpha()
        .composite([{ input: debugMask, blend: 'dest-in' }])
        .png()
        .toBuffer();
      maskedDebug = await sharp(maskedFull)
        .resize(120, 120, { fit: 'contain', background: {r:0,g:0,b:0,alpha:0} })
        .png({ compressionLevel: 9 })
        .toBuffer();
    } catch(e) {
      console.warn(`[composite:${figureId}] maskedDebug failed: ${e.message}`);
    }

    // Debug: raw portrait crop (before color correction) \u2014 shows what MediaPipe detected
    const portraitCropDebug = await sharp(facePng)
      .resize(120, 120, { fit: 'contain', background: {r:0,g:0,b:0,alpha:1} })
      .jpeg({ quality: 75 })
      .toBuffer();

    return res.status(200).json({
      outputUrl:       `data:image/jpeg;base64,${composited.toString('base64')}`,
      profileUrl:      `data:image/jpeg;base64,${profileBuf.toString('base64')}`,
      maskedFaceUrl:   maskedDebug ? `data:image/png;base64,${maskedDebug.toString('base64')}` : null,
      portraitCropUrl: `data:image/jpeg;base64,${portraitCropDebug.toString('base64')}`,
      cropBox: faceCropBox,
      faceBoundsBox: faceBounds || null,
      // Debug: painting sample region as fractions of painting dimensions
      paintSampleBox: {
        x: sampleX / PW,
        y: sampleY / PH,
        w: patchSize / PW,
        h: patchSize / PH,
      },
    });

  } catch (err) {
    console.error('Composite error:', err);
    return res.status(500).json({ error: err.message });
  }
}
