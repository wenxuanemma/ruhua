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

    console.log(`[composite] painting=${PW}x${PH} region=${targetW}x${targetH} targetSize=${targetSize} faceInput=${FW}x${FH}`);

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
    let cropMethod = 'fallback';

    // Selfie-based crop only for front-facing figures — three-quarter and profile
    // figures have different poses than the selfie so faceBounds doesn't apply.
    if (isFront && faceBounds && faceBounds.w > 0 && faceBounds.h > 0) {
      // ── Front/3Q: selfie-based crop ──────────────────────────────────────
      // faceBounds is normalized to selfie dimensions.
      // Seedream is asked to match framing, so we apply same normalized coords
      // to the 1920px output, with a generous pad to account for imperfect matching.
      const PAD = 0.10; // 10% padding on each side
      const cx = faceBounds.x + faceBounds.w / 2;
      const cy = faceBounds.y + faceBounds.h / 2;
      // Use the larger of w/h for a square crop
      const faceSpan = Math.max(faceBounds.w, faceBounds.h);
      const cropSpan = Math.min(faceSpan * (1 + PAD * 2) * 1.1, 0.90); // 1.1× for Seedream framing variance
      cropSize = Math.round(cropSpan * FW);
      cropX = Math.max(0, Math.min(Math.round(cx * FW - cropSize / 2), FW - cropSize));
      cropY = Math.max(0, Math.min(Math.round(cy * FH - cropSize / 2), FH - cropSize));
      cropMethod = 'selfie';
      console.log(`[composite crop] SELFIE faceBounds=(${faceBounds.x.toFixed(2)},${faceBounds.y.toFixed(2)},${faceBounds.w.toFixed(2)},${faceBounds.h.toFixed(2)}) cropSize=${cropSize} cropX=${cropX} cropY=${cropY}`);

    } else {
      // ── Profile (or no faceBounds): MediaPipe keypoints on Seedream output ──
      const LOCAL_SERVER = process.env.LOCAL_INFERENCE_URL;
      if (LOCAL_SERVER && FW > 500) {
        try {
          const resizedForDetect = await sharp(faceBuf)
            .resize(640, 640, { fit: 'cover' })
            .jpeg({ quality: 85 })
            .toBuffer();
          const detectRes = await fetch(`${LOCAL_SERVER}/detect-face-mp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ init_image: `data:image/jpeg;base64,${resizedForDetect.toString('base64')}` }),
            signal: AbortSignal.timeout(15000),
          });
          if (detectRes.ok) {
            const { box, keypoints } = await detectRes.json();
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

                const foreheadTop = Math.max(0, eyeCy - Math.round(eyeToMouth * 1.2));
                const chinBottom  = Math.round(mouth.y + Math.round(eyeToMouth * 0.55));
                const landmarkH   = chinBottom - foreheadTop;
                cropSize = Math.min(Math.max(landmarkH, bboxW) + 40, 1500);
                cropX = Math.max(0, Math.min(eyeCx - Math.round(cropSize / 2), FW - cropSize));
                cropY = Math.max(0, Math.min(foreheadTop, FH - cropSize));
                cropMethod = 'keypoints';
                console.log(`[composite crop] KEYPOINTS eye=(${eyeCx},${eyeCy}) mouth=(${mouth.x},${mouth.y}) bboxW=${bboxW} landmarkH=${landmarkH} cropSize=${cropSize} cropX=${cropX} cropY=${cropY}`);
              } else {
                // Keypoints unavailable — bbox fallback
                const faceTop   = Math.round(box.y * FH);
                const faceH     = Math.round((box.y2 - box.y) * FH);
                cropSize = Math.round(FW * (isProfile ? 0.38 : 0.50));
                cropX = Math.max(0, Math.min(bboxCx - Math.round(cropSize / 2), FW - cropSize));
                cropY = Math.max(0, Math.min(faceTop - Math.round(cropSize * 0.08), FH - cropSize));
                cropMethod = 'bbox';
                console.log(`[composite crop] BBOX faceTop=${faceTop} bboxW=${bboxW} cropSize=${cropSize} cropX=${cropX} cropY=${cropY}`);
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
    console.log(`[composite] cropMethod=${cropMethod} cropSize=${cropSize}`);

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

    // Sample painting: tight 20% patch centered at face center, 38% down (cheek/nose area)
    const faceCenterX = Math.round(safeX + safeW * 0.50);
    const faceCenterY = Math.round(safeY + safeH * 0.38);
    const patchSize   = Math.max(4, Math.round(Math.min(safeW, safeH) * 0.20));
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

    // Per-channel mean ratio scaling with per-channel SHIFT.
    // R/G pull more toward painting tone; B is gentler to avoid blue crushing
    // on warm dark paintings (where paintBlue << faceBue).
    const SHIFT_R = 0.55, SHIFT_G = 0.55, SHIFT_B = 0.35;
    const rM = Math.min(1.9, Math.max(0.3, 1 + (ps.rm / Math.max(fs.rm, 1) - 1) * SHIFT_R));
    const gM = Math.min(1.9, Math.max(0.3, 1 + (ps.gm / Math.max(fs.gm, 1) - 1) * SHIFT_G));
    const bM = Math.min(1.9, Math.max(0.3, 1 + (ps.bm / Math.max(fs.bm, 1) - 1) * SHIFT_B));

    console.log(`[composite color] paintSample=(${ps.rm.toFixed(1)},${ps.gm.toFixed(1)},${ps.bm.toFixed(1)}) faceMean=(${fs.rm.toFixed(1)},${fs.gm.toFixed(1)},${fs.bm.toFixed(1)}) scale=(${rM.toFixed(3)},${gM.toFixed(3)},${bM.toFixed(3)})`);

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

    // Oval mask: hard center, tight fade zone
    const ovalR = S * 0.40;
    const maskSvg = `<svg width="${S}" height="${S}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="g" cx="50%" cy="50%" rx="50%" ry="50%">
          <stop offset="78%" stop-color="white" stop-opacity="1"/>
          <stop offset="88%" stop-color="white" stop-opacity="0.60"/>
          <stop offset="94%" stop-color="white" stop-opacity="0.10"/>
          <stop offset="100%" stop-color="white" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <ellipse cx="${S*0.50}" cy="${S*0.50}" rx="${ovalR}" ry="${ovalR}" fill="url(#g)"/>
    </svg>`;

    const ovalMask = await sharp(Buffer.from(maskSvg))
      .resize(S, S, { fit: 'fill' })
      .png()
      .toBuffer();

    const masked = await sharp(colorFaceExact)
      .ensureAlpha()
      .composite([{ input: ovalMask, blend: 'dest-in' }])
      .png()
      .toBuffer();

    // ── Step 4: Paste onto painting — center over region ─────────────────────
    const cx = targetX + Math.round(targetW / 2);
    const cy = targetY + Math.round(targetH / 2);
    const px = Math.max(0, Math.min(cx - Math.round(S/2), PW - S));
    const py = Math.max(0, Math.min(cy - Math.round(S/2), PH - S));

    // Clamp without squashing — extract if overflows
    const cW = Math.min(S, PW - px);
    const cH = Math.min(S, PH - py);
    const pasteBuf = (cW === S && cH === S)
      ? masked
      : await sharp(masked).extract({ left:0, top:0, width:cW, height:cH }).png().toBuffer();

    const composited = await sharp(paintingBuf)
      .composite([{ input: pasteBuf, left: px, top: py, blend: 'over' }])
      .jpeg({ quality: 92 })
      .toBuffer();

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

    return res.status(200).json({
      outputUrl:  `data:image/jpeg;base64,${composited.toString('base64')}`,
      profileUrl: `data:image/jpeg;base64,${profileBuf.toString('base64')}`,
      cropBox: faceCropBox,
    });

  } catch (err) {
    console.error('Composite error:', err);
    return res.status(500).json({ error: err.message });
  }
}
