// pages/api/composite.js
//
// Sharp-based geometric compositing.
// By the time we get here, the face is already painted (from generate.js Stage 2).
// This stage handles: face crop → color match → feathered oval → paste into painting.
//
// npm install sharp

import sharp from 'sharp';

export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
};

const FACE_REGIONS = {
  qingming: {
    scholar:  { x:0.53, y:0.35, w:0.04, h:0.30, angle:0   },
    merchant: { x:0.62, y:0.32, w:0.04, h:0.30, angle:5   },
    boatman:  { x:0.44, y:0.40, w:0.04, h:0.28, angle:-8  },
  },
  hanxizai: {
    guest:  { x:0.77, y:0.01, w:0.10, h:0.18, angle:5  },
    host:   { x:0.32, y:0.24, w:0.12, h:0.20, angle:-3 },
    dancer: { x:0.47, y:0.26, w:0.08, h:0.12, angle:-5 },
  },
  bunianta: {
    official: { x:0.35, y:0.35, w:0.06, h:0.14, angle:3  },
    envoy:    { x:0.72, y:0.35, w:0.06, h:0.15, angle:-5 },
  },
  guoguo: {
    lady:      { x:0.55, y:0.10, w:0.10, h:0.35, angle:0  },
    attendant: { x:0.35, y:0.10, w:0.09, h:0.32, angle:3  },
    rider:     { x:0.15, y:0.08, w:0.09, h:0.30, angle:-5 },
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

async function fetchImageBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${url} (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { styledFaceUrl, paintingImageUrl, paintingId, figureId, faceBounds } = req.body;
  if (!styledFaceUrl || !paintingImageUrl || !paintingId || !figureId)
    return res.status(400).json({ error: 'Missing required fields' });

  const region = FACE_REGIONS[paintingId]?.[figureId];
  if (!region)
    return res.status(400).json({ error: `No face region for ${paintingId}/${figureId}` });

  try {
    const [paintingBuf, faceBuf] = await Promise.all([
      fetchImageBuffer(paintingImageUrl),
      fetchImageBuffer(styledFaceUrl),
    ]);

    const { width: PW, height: PH } = await sharp(paintingBuf).metadata();
    const { width: FW, height: FH } = await sharp(faceBuf).metadata();

    // Target pixel region in the painting
    const targetX = Math.round(region.x * PW);
    const targetY = Math.round(region.y * PH);
    const targetW = Math.round(region.w * PW);
    const targetH = Math.round(region.h * PH);

    // Crop face from InstantID output — face is centered in 640x640 frame
    // Use full height so chin is never cut; oval mask defines the blend boundary
    const cropX = Math.round(FW * 0.15);
    const cropY = 0;
    const cropW = Math.round(FW * 0.70);
    const cropH = FH;

    let faceImg = sharp(faceBuf)
      .extract({ left: cropX, top: cropY, width: cropW, height: cropH });

    if (region.angle !== 0) {
      faceImg = faceImg.rotate(region.angle, {
        background: { r: 128, g: 100, b: 70, alpha: 1 },
      });
    }

    const facePng = await faceImg
      .resize(targetW, targetH, { fit: 'cover', position: 'top' })  // cover preserves aspect ratio; top keeps forehead
      .png()
      .toBuffer();

    // ── Sample painting color at face region ──────────────────────────────────
    const safeX = Math.max(0, targetX);
    const safeY = Math.max(0, targetY);
    const safeW = Math.min(targetW, PW - safeX);
    const safeH = Math.min(targetH, PH - safeY);

    const paintingCrop = await sharp(paintingBuf)
      .extract({ left: safeX, top: safeY, width: safeW, height: safeH })
      .resize(8, 8, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer();

    let rSum = 0, gSum = 0, bSum = 0;
    const pixels = paintingCrop.length / 3;
    for (let i = 0; i < paintingCrop.length; i += 3) {
      rSum += paintingCrop[i]; gSum += paintingCrop[i+1]; bSum += paintingCrop[i+2];
    }
    const pR = rSum/pixels, pG = gSum/pixels, pB = bSum/pixels;

    // ── Sample raw face color ─────────────────────────────────────────────────
    const faceCropSmall = await sharp(facePng)
      .resize(8, 8)
      .removeAlpha()
      .raw()
      .toBuffer();
    let fR = 0, fG = 0, fB = 0;
    const fp = faceCropSmall.length / 3;
    for (let i = 0; i < faceCropSmall.length; i += 3) {
      fR += faceCropSmall[i]; fG += faceCropSmall[i+1]; fB += faceCropSmall[i+2];
    }

    // ── Calculate adaptive brightness to match painting region ────────────────
    // Each painting has a different brightness level — this generalizes automatically:
    // 韩熙载夜宴图 → dark (0.3–0.4), 千里江山图 → bright (0.6–0.7), 宫乐图 → warm mid (0.5)
    const paintingBrightness = (pR + pG + pB) / 3 / 255;
    const faceBrightness     = ((fR + fG + fB) / 3) / fp / 255;
    const targetBrightness   = faceBrightness + (paintingBrightness - faceBrightness) * 0.40;  // 40%, was 60%
    const brightnessRatio    = faceBrightness > 0.01
      ? Math.max(0.4, Math.min(1.5, targetBrightness / faceBrightness))
      : 1.0;

    // ── Extract painting figure at target size ─────────────────────────────────
    const paintingRegionBuf = await sharp(paintingBuf)
      .extract({ left: safeX, top: safeY, width: safeW, height: safeH })
      .resize(targetW, targetH, { fit: 'fill' })
      .png()
      .toBuffer();

    // ── Detect face skin in the painting figure via color analysis ─────────────
    // Only scan the upper 55% of the figure region — that's where the face is.
    // Lower portion contains robes/clothes that may share warm hues with skin.
    const { data: pxData } = await sharp(paintingRegionBuf)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const skinData = Buffer.alloc(targetW * targetH * 3);
    let skinPixelCount = 0;
    const faceZoneHeight = Math.round(targetH * 0.55); // only scan top 55%

    for (let py = 0; py < targetH; py++) {
      for (let px = 0; px < targetW; px++) {
        const i = (py * targetW + px) * 3;
        // Below face zone — always mask out (robes/background)
        if (py > faceZoneHeight) {
          skinData[i] = skinData[i+1] = skinData[i+2] = 0;
          continue;
        }
        const r = pxData[i], g = pxData[i+1], b = pxData[i+2];
        const rn = r/255, gn = g/255, bn = b/255;
        const max = Math.max(rn,gn,bn), min = Math.min(rn,gn,bn);
        const l = (max+min)/2;
        const d = max-min;
        const s = d === 0 ? 0 : d/(1 - Math.abs(2*l - 1));
        let h = 0;
        if (d !== 0) {
          if (max===rn) h = ((gn-bn)/d + 6) % 6;
          else if (max===gn) h = (bn-rn)/d + 2;
          else h = (rn-gn)/d + 4;
          h *= 60;
        }
        // Tighter skin: warm-yellow hue only (excludes red robes at <15°, ochre bg at >42°)
        // Higher sat minimum (0.18) excludes desaturated ochre backgrounds
        const isSkin = h>=15 && h<=42 && s>=0.18 && s<=0.55 && l>=0.52 && l<=0.88;
        const v = isSkin ? 255 : 0;
        skinData[i] = v; skinData[i+1] = v; skinData[i+2] = v;
        if (isSkin) skinPixelCount++;
      }
    }

    // ── Center oval — shifted DOWN to protect hat at top of region ───────────
    // cy=0.52 means oval starts at ~14% from top → hat area (0-14%) is protected
    const cx = targetW * 0.50, cy = targetH * 0.52;
    const rx = targetW * 0.37, ry = targetH * 0.36;
    const rawMask = Buffer.alloc(targetW * targetH); // 1-channel
    for (let py = 0; py < targetH; py++) {
      for (let px = 0; px < targetW; px++) {
        const dx = (px - cx) / rx, dy = (py - cy) / ry;
        const dist = Math.sqrt(dx*dx + dy*dy);
        const alpha = dist < 0.82 ? 1 : Math.max(0, 1 - (dist - 0.82) / 0.18);
        rawMask[py * targetW + px] = Math.round(alpha * 255);
      }
    }

    // ── Intersect oval with skin mask if detected ─────────────────────────────
    const skinCoverage = skinPixelCount / (targetW * faceZoneHeight);
    const finalMask1ch = Buffer.alloc(targetW * targetH);
    if (skinCoverage > 0.04) {
      for (let i = 0; i < targetW * targetH; i++) {
        const s = skinData[i * 3];  // 0 or 255
        const o = rawMask[i];       // 0–255
        finalMask1ch[i] = Math.round((s / 255) * (o / 255) * 255);
      }
      console.log(`Skin+oval: ${(skinCoverage*100).toFixed(1)}%`);
    } else {
      rawMask.copy(finalMask1ch);
      console.log(`Oval only (skin ${(skinCoverage*100).toFixed(1)}%)`);
    }

    // ── Blur the 1-channel mask, then convert to RGBA for dest-in ─────────────
    // joinChannel is unreliable with PNG grayscale format.
    // dest-in with RGBA source is the correct Sharp approach:
    //   output.alpha = face.alpha × mask.alpha  (face is opaque → output.alpha = mask.alpha)
    const blurredMask1ch = await sharp(finalMask1ch, {
      raw: { width: targetW, height: targetH, channels: 1 },
    }).blur(2).raw().toBuffer();

    // Build RGBA mask: R=G=B=255 (white), A=blurred mask value
    const rgbaData = Buffer.alloc(targetW * targetH * 4);
    for (let i = 0; i < targetW * targetH; i++) {
      rgbaData[i*4]   = 255;
      rgbaData[i*4+1] = 255;
      rgbaData[i*4+2] = 255;
      rgbaData[i*4+3] = blurredMask1ch[i];
    }
    const blendMask = await sharp(rgbaData, {
      raw: { width: targetW, height: targetH, channels: 4 },
    }).png().toBuffer();

    // ── Apply: dest-in masks the face, then composite onto painting ───────────
    const colorMatchedFace = await sharp(facePng)
      .modulate({ saturation: 0.92, brightness: brightnessRatio })
      .ensureAlpha()
      .composite([{ input: blendMask, blend: 'dest-in' }])
      .png()
      .toBuffer();

    const composited = await sharp(paintingBuf)
      .composite([{ input: colorMatchedFace, left: targetX, top: targetY, blend: 'over' }])
      .jpeg({ quality: 92 })
      .toBuffer();

    // Profile crop — padding scales inversely with face region size
    // Small regions (bunianta w:0.06) need less padding than large ones (host w:0.18)
    const sizeScale = Math.max(0.3, Math.min(1.0, 0.12 / region.w)); // normalize around w=0.12
    const padX = Math.round(targetW * 0.5 * sizeScale);
    const padY = Math.round(targetH * 0.4 * sizeScale);
    const cropLeft   = Math.max(0, targetX - padX);
    const cropTop    = Math.max(0, targetY - padY);
    const cropRight  = Math.min(PW, targetX + targetW + padX);
    const cropBottom = Math.min(PH, targetY + targetH + padY);

    const profileCrop = await sharp(composited)
      .extract({
        left:   cropLeft,
        top:    cropTop,
        width:  cropRight - cropLeft,
        height: cropBottom - cropTop,
      })
      .resize(400, 400, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 90 })
      .toBuffer();

    const outputUrl  = `data:image/jpeg;base64,${composited.toString('base64')}`;
    const profileUrl = `data:image/jpeg;base64,${profileCrop.toString('base64')}`;

    return res.status(200).json({ outputUrl, profileUrl });

  } catch (err) {
    console.error('Composite error:', err);
    return res.status(500).json({ error: err.message || 'Compositing failed' });
  }
}
