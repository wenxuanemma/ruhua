// pages/api/composite.js
import sharp from 'sharp';
import { FACE_REGIONS } from '../../lib/faceRegions.js';

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

async function fetchBuf(url) {
  if (url.startsWith('data:')) return Buffer.from(url.split(',')[1], 'base64');
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

    // Use square target — max of width/height
    const targetSize = Math.max(targetW, targetH);

    console.log(`[composite:${figureId}] painting=${PW}x${PH} region=${targetW}x${targetH} targetSize=${targetSize} faceInput=${FW}x${FH}`);

    // ── Step 1: Crop face from Seedream portrait ──────────────────────────────
    // Strategy depends on face angle:
    //
    // FRONT / THREE-QUARTER: use selfie faceBounds to derive crop position.
    //   Seedream is prompted to match selfie framing, so face position in the
    //   1920px output correlates with face position in the selfie. This is
    //   stable across runs for the same selfie.
    //
    // PROFILE: selfie framing doesn't match (Seedream generates a side view).
    //   Use MediaPipe keypoints on the Seedream output — keypoints are stable
    //   even when the bbox is inflated by hair/robes.

    const isProfile    = region.faceAngle && region.faceAngle.includes('profile');
    const isFront      = !region.faceAngle || region.faceAngle === 'front';
    let faceCropBuf = faceBuf;
    let faceCropBox = null;
    let cropX, cropY, cropSize;
    let faceCenterInCropX = null, faceCenterInCropY = null;
    let profileFaceWidthFrac = null;
    let cropMethod = 'fallback';

    // Selfie-based crop only for front-facing figures — three-quarter and profile
    // figures have different poses than the selfie so faceBounds doesn't apply.
    if (isFront && faceBounds && faceBounds.w > 0 && faceBounds.h > 0) {
      // ── Front/3Q: portrait face bounds crop ─────────────────────────────
      // faceBounds detected directly from portrait via client MediaPipe.
      // Asymmetric padding: large top (40%) for forehead, small bottom (5%) to avoid neck.
      const padTop = 0.40, padBot = 0.05, padX = 0.15;
      const faceW = faceBounds.w, faceH = faceBounds.h;
      const cx = faceBounds.x + faceW / 2;
      const cropTop  = Math.max(0, faceBounds.y - faceH * padTop);
      const cropBot  = Math.min(1, faceBounds.y + faceH * (1 + padBot));
      const cropLeft = Math.max(0, cx - faceW * (0.5 + padX));
      const cropRight= Math.min(1, cx + faceW * (0.5 + padX));
      cropSize = Math.round(Math.max(cropBot - cropTop, cropRight - cropLeft) * FW);
      cropX = Math.max(0, Math.min(Math.round(cropLeft * FW), FW - cropSize));
      cropY = Math.max(0, Math.min(Math.round(cropTop * FH), FH - cropSize));
      cropMethod = 'portrait-face';
      faceCenterInCropX = Math.round(cx * FW) - cropX;
      faceCenterInCropY = Math.round((faceBounds.y + faceH / 2) * FH) - cropY;
      console.log(`[composite:${figureId} crop] PORTRAIT-FACE faceBounds=(${faceBounds.x.toFixed(2)},${faceBounds.y.toFixed(2)},${faceBounds.w.toFixed(2)},${faceBounds.h.toFixed(2)}) cropSize=${cropSize} cropX=${cropX} cropY=${cropY}`);


    } else {
      // ── Profile (or no faceBounds): MediaPipe keypoints on Seedream output ──
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
                  console.warn(`[composite] Invalid keypoints: eyeCy=${eyeCy} eyeToMouth=${eyeToMouth} — using bbox fallback`);
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
                // - Profile: unchanged — max(landmarkH, bboxW) + 40, centered on (backOfHead+noseTip)/2
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
                  // Use landmarkH only — bboxW inflates crop unnecessarily for profile faces
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
                // Keypoints unavailable — bbox fallback
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

    // ── Step 2: Resize face to exact square ───────────────────────────────────
    let faceImg = sharp(faceCropBuf);

    if (region.angle && region.angle !== 0) {
      // Rotate with neutral skin-tone background to avoid black corners after removeAlpha
      faceImg = faceImg.rotate(region.angle, { background: { r:200, g:170, b:140, alpha:1 } });
    }

    // Resize to exact targetSize x targetSize square
    const facePng = await faceImg
      .resize(targetSize, targetSize, { fit: 'cover', position: 'centre' })

      .png()
      .toBuffer();

    // Verify exact dimensions
    const fpMeta = await sharp(facePng).metadata();
    const S = fpMeta.width; // guaranteed square

    // ── Step 2: Color matching ────────────────────────────────────────────────
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

    // Sample a 20% patch shifted up 10% from center — lands on cheeks/nose,
    // avoids hair at top and neck/clothing at bottom. Tighter than 30% to stay on skin.
    const fSampleSize = Math.round(S * 0.20);
    const fSampleLeft = Math.round((S - fSampleSize) / 2);
    const fSampleTop  = Math.round(S * 0.35);  // 35% from top = upper cheek area
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
    // B is capped at 1.10 to avoid blue oversaturation on cooler paintings (e.g. Dancer).
    const SHIFT = region.colorShift ?? 0.75;
    const rM = Math.min(1.9, Math.max(0.3, 1 + (ps.rm / Math.max(fs.rm, 1) - 1) * SHIFT));
    const gM = Math.min(1.9, Math.max(0.3, 1 + (ps.gm / Math.max(fs.gm, 1) - 1) * SHIFT));
    const bM = Math.min(1.10, Math.max(0.3, 1 + (ps.bm / Math.max(fs.bm, 1) - 1) * SHIFT));

    console.log(`[composite:${figureId} color] paintSample=(${ps.rm.toFixed(1)},${ps.gm.toFixed(1)},${ps.bm.toFixed(1)}) faceMean=(${fs.rm.toFixed(1)},${fs.gm.toFixed(1)},${fs.bm.toFixed(1)}) scale=(${rM.toFixed(3)},${gM.toFixed(3)},${bM.toFixed(3)})`);

    // Color match — keep exact S x S dimensions
    const colorFace = await sharp(facePng)
      .removeAlpha()
      .recomb([[rM,0,0],[0,gM,0],[0,0,bM]])
      .modulate({ saturation: 0.72 })
      .png()
      .toBuffer();

    // Force exact S x S after color operations (recomb can shift by 1px)
    const colorFaceExact = await sharp(colorFace)
      .resize(S, S, { fit: 'fill' })
      .png()
      .toBuffer();

    // pasteS always = S — paste at full targetSize.
    const faceSize = region.faceSize ?? 1.0;
    const pasteS = S;
    const pasteFace = colorFaceExact;

    // Face-fitted oval mask — sized and positioned to match actual face bounds in the crop.
    // Oval rx/ry: calibrate proportions (82%/84%) applied to pasteS.
    // pasteS is already scaled by faceSize so oval naturally matches painted face.
    // Profile faces get wider rx to cover nose tip.
    const ovalRy = Math.min((targetH / targetSize) * pasteS * 0.42, pasteS * 0.48);
    const ovalRxBase = Math.min((targetW / targetSize) * pasteS * 0.41, pasteS * 0.48);
    // Profile: use actual face width (noseTip-to-ear fraction of landmarkH) for rx
    const ovalRx = (isProfile && profileFaceWidthFrac)
      ? Math.min(profileFaceWidthFrac * ovalRy * 1.1, pasteS * 0.48)
      : ovalRxBase;
    const ovalR  = Math.min(ovalRx, ovalRy);
    // Oval center: map face center from crop space to pasteS space
    // faceCenterInCropX is in crop pixel space (0..cropSize), not resized space (0..S).
    // Divide by cropSize to normalize, then scale to pasteS.
    // Oval centered in pasteS square — converted face is resized to fill pasteS.
    const ovalCx = pasteS * 0.50;
    const ovalCy = pasteS * 0.50;
    const maskSvg = `<svg width="${pasteS}" height="${pasteS}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="g" cx="50%" cy="50%" rx="50%" ry="50%">
          <stop offset="65%" stop-color="white" stop-opacity="1"/>
          <stop offset="80%" stop-color="white" stop-opacity="0.70"/>
          <stop offset="90%" stop-color="white" stop-opacity="0.20"/>
          <stop offset="100%" stop-color="white" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <ellipse cx="${ovalCx}" cy="${ovalCy}" rx="${ovalRx}" ry="${ovalRy}" fill="url(#g)"/>
    </svg>`;

    const ovalMask = await sharp(Buffer.from(maskSvg))
      .resize(pasteS, pasteS, { fit: 'fill' })
      .png()
      .toBuffer();

    // ── Step 4: Paste onto painting ──────────────────────────────────────────
    // Paste centered on region center (50% x, 55% y — matches calibrate oval position)
    const cx = targetX + Math.round(targetW * 0.50);
    const cy = targetY + Math.round(targetH * 0.55);
    const px = Math.max(0, Math.min(cx - Math.round(pasteS / 2), PW - pasteS));
    const py = Math.max(0, Math.min(cy - Math.round(pasteS / 2), PH - pasteS));

    console.log(`[composite:${figureId} paste] S=${S} pasteS=${pasteS} px=${px} py=${py} ovalRx=${ovalRx.toFixed(0)} ovalRy=${ovalRy.toFixed(0)} ovalCx=${ovalCx.toFixed(0)} ovalCy=${ovalCy.toFixed(0)} profileFaceWidthFrac=${profileFaceWidthFrac?.toFixed(2)??'null'} faceCenterInCropX=${faceCenterInCropX?.toFixed(0)??'null'} cropSize=${cropSize}`);

    // Sharp paste with oval gradient mask
    const masked = await sharp(pasteFace)
      .ensureAlpha()
      .composite([{ input: ovalMask, blend: 'dest-in' }])
      .png().toBuffer();
    const cW = Math.min(pasteS, PW - px);
    const cH = Math.min(pasteS, PH - py);
    const pasteBuf = (cW === pasteS && cH === pasteS)
      ? masked
      : await sharp(masked).extract({ left:0, top:0, width:cW, height:cH }).png().toBuffer();
    const composited = await sharp(paintingBuf)
      .composite([{ input: pasteBuf, left: px, top: py, blend: 'over' }])
      .jpeg({ quality: 92 }).toBuffer();

    // ── Step 5: Profile crop ──────────────────────────────────────────────────
    const pad = Math.round(targetH * 1.5);
    const profX = Math.max(0, px - pad);
    const profY = Math.max(0, py - pad);
    const profW = Math.min(PW - profX, S + pad * 2);
    const profH = Math.min(PH - profY, S + pad * 2);

    const profileBuf = await sharp(composited)
      .extract({ left: profX, top: profY, width: profW, height: profH })
      .resize(400, 400, { fit: 'cover' })
      .jpeg({ quality: 90 })
      .toBuffer();

    // Build debug composite: painting region crop with masked face pasted on top
    // Debug: color-corrected face with oval mask — shows what gets pasted and transparency
    const maskedDebug = await sharp(pasteFace)
      .ensureAlpha()
      .composite([{ input: ovalMask, blend: 'dest-in' }])
      .png()
      .toBuffer();

    return res.status(200).json({
      outputUrl:  `data:image/jpeg;base64,${composited.toString('base64')}`,
      profileUrl: `data:image/jpeg;base64,${profileBuf.toString('base64')}`,
      maskedFaceUrl: `data:image/png;base64,${maskedDebug.toString('base64')}`,
      cropBox: faceCropBox,
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
