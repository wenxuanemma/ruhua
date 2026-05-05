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
  // qingming — large faces from city gate crop
  qingming: {
    scholar:  { x:0.000, y:0.390, w:0.130, h:0.200, angle:0 },
    merchant: { x:0.000, y:0.350, w:0.080, h:0.180, angle:5   },
    boatman:  { x:0.000, y:0.840, w:0.070, h:0.180, angle:-8  },
  },
  // hanxizai — guest=right, host=Han Xizai center-left, dancer=standing center
  hanxizai: {
    guest:  { x:0.7647, y:0.0180, w:0.1005, h:0.1480, angle:5  },
    host:   { x:0.3600, y:0.2820, w:0.1029, h:0.1660, angle:-3 },
    dancer: { x:0.0767, y:0.3520, w:0.0838, h:0.1340, angle:-5 },
  },
  // bunianta — padded from detected centers
  bunianta: {
    official: { x:0.340, y:0.330, w:0.090, h:0.160, angle:3  },
    envoy:    { x:0.820, y:0.270, w:0.090, h:0.180, angle:-5 },
  },
  // guoguo — padded, h capped for mounted riders
  guoguo: {
    lady:      { x:0.240, y:0.330, w:0.090, h:0.180, angle:0 },
    attendant: { x:0.390, y:0.170, w:0.090, h:0.180, angle:3  },
    rider:     { x:0.785, y:0.210, w:0.090, h:0.180, angle:-5 },
  },
  // luoshen — padded from detected centers
  luoshen: {
    cao:       { x:0.565, y:0.110, w:0.110, h:0.220, angle:-5 },
    attendant: { x:0.220, y:0.285, w:0.080, h:0.160, angle:-2 },
  },
  // gongle — padded from detected centers
  gongle: {
    listener: { x:0.210, y:0.170, w:0.110, h:0.200, angle:0 },
    musician: { x:0.575, y:0.450, w:0.120, h:0.200, angle:-8 },
    serving:  { x:0.015, y:0.355, w:0.100, h:0.180, angle:0 },
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
      .resize(targetW, targetH, { fit: 'cover', position: 'top' })
      .png()
      .toBuffer();

    // Safe bounds — clamp target region to painting dimensions
    const safeX = Math.max(0, targetX);
    const safeY = Math.max(0, targetY);
    const safeW = Math.min(targetW, PW - safeX);
    const safeH = Math.min(targetH, PH - safeY);

    // ── Per-channel color statistics matching (Reinhard method) ──────────────
    // Matches mean+stddev of each RGB channel from generated face to painted face region.
    // This makes the face adopt the exact ochre/umber palette of the original figure
    // without any AI generation — deterministic, fast, free.

    // Sample painting face region pixels (8×8)
    const paintingCropRaw = await sharp(paintingBuf)
      .extract({ left: safeX, top: safeY, width: safeW, height: safeH })
      .resize(8, 8, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer();

    // Sample generated face pixels (center 8×8)
    const faceCropRaw = await sharp(facePng)
      .resize(8, 8)
      .removeAlpha()
      .raw()
      .toBuffer();

    // Compute per-channel mean + stddev for both images
    function channelStats(buf) {
      const n = buf.length / 3;
      let rS=0, gS=0, bS=0;
      for (let i=0; i<buf.length; i+=3) { rS+=buf[i]; gS+=buf[i+1]; bS+=buf[i+2]; }
      const rM=rS/n, gM=gS/n, bM=bS/n;
      let rV=0, gV=0, bV=0;
      for (let i=0; i<buf.length; i+=3) {
        rV+=(buf[i]-rM)**2; gV+=(buf[i+1]-gM)**2; bV+=(buf[i+2]-bM)**2;
      }
      return { rM, gM, bM, rS:Math.sqrt(rV/n), gS:Math.sqrt(gV/n), bS:Math.sqrt(bV/n) };
    }

    const pStats = channelStats(paintingCropRaw);
    const fStats = channelStats(faceCropRaw);

    // Reinhard transfer: x' = (x - fMean) * (pStd/fStd) * blend + (fMean + pMean*blend)
    // blend=0.75: 75% toward painting statistics — stronger correction for LoRA vivid output
    const blend = 0.75;
    const rScale = fStats.rS > 1 ? (pStats.rS/fStats.rS-1)*blend+1 : 1;
    const gScale = fStats.gS > 1 ? (pStats.gS/fStats.gS-1)*blend+1 : 1;
    const bScale = fStats.bS > 1 ? (pStats.bS/fStats.bS-1)*blend+1 : 1;
    const rOff = (pStats.rM - fStats.rM) * blend;
    const gOff = (pStats.gM - fStats.gM) * blend;
    const bOff = (pStats.bM - fStats.bM) * blend;

    // Apply per-channel transform via Sharp recomb matrix
    // recomb multiplies [R,G,B] by 3×3 matrix — diagonal for independent channels
    const colorMatchedFace = await sharp(facePng)
      .removeAlpha()
      .recomb([
        [rScale, 0, 0],
        [0, gScale, 0],
        [0, 0, bScale],
      ])
      .modulate({ saturation: 0.90 })
      .png()
      .toBuffer();

    // Note: recomb handles scale; overall brightness nudge via modulate
    // ── Blend mask: SVG radial gradient oval ─────────────────────────────────
    // cy=52% means oval spans from ~15% to ~89% of region height.
    // Top 15% (hat/headdress area) is transparent → original hat preserved.
    // SVG PNG has a proper alpha channel — dest-in works correctly with it.
    // Raw buffer approach (joinChannel / manual RGBA) has stride alignment bugs.
    const ovalSvg = `<svg width="${targetW}" height="${targetH}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="g" cx="50%" cy="52%" rx="50%" ry="50%">
          <stop offset="60%" stop-color="white" stop-opacity="1"/>
          <stop offset="78%" stop-color="white" stop-opacity="0.55"/>
          <stop offset="91%" stop-color="white" stop-opacity="0.07"/>
          <stop offset="100%" stop-color="white" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <ellipse cx="${targetW*0.50}" cy="${targetH*0.52}"
               rx="${targetW*0.39}" ry="${targetH*0.37}"
               fill="url(#g)"/>
    </svg>`;
    const blendMask = await sharp(Buffer.from(ovalSvg))
      .resize(targetW, targetH)
      .png()
      .toBuffer();

    // ── Apply mask and composite ──────────────────────────────────────────────
    const maskedFace = await sharp(colorMatchedFace)
      .ensureAlpha()
      .composite([{ input: blendMask, blend: 'dest-in' }])
      .png()
      .toBuffer();

    const composited = await sharp(paintingBuf)
      .composite([{ input: maskedFace, left: targetX, top: targetY, blend: 'over' }])
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
