// pages/api/composite.js
import sharp from 'sharp';
import { FACE_REGIONS } from '../../lib/faceRegions.js';

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

async function fetchImageBuffer(url) {
  if (url.startsWith('data:')) {
    return Buffer.from(url.split(',')[1], 'base64');
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

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

    const targetX = Math.round(region.x * PW);
    const targetY = Math.round(region.y * PH);
    const targetW = Math.round(region.w * PW);
    const targetH = Math.round(region.h * PH);

    const safeX = Math.max(0, targetX);
    const safeY = Math.max(0, targetY);
    const safeW = Math.min(targetW, PW - safeX);
    const safeH = Math.min(targetH, PH - safeY);

    // ── Face crop ─────────────────────────────────────────────────────────────
    const cropX = 0;
    const cropY = 0;
    const cropW = FW;
    const cropH = FH;

    let faceImg = sharp(faceBuf)
      .extract({ left: cropX, top: cropY, width: cropW, height: cropH });

    if (region.angle !== 0) {
      faceImg = faceImg.rotate(region.angle, {
        background: { r: 128, g: 100, b: 70, alpha: 1 },
      });
    }

    // Resize to square to avoid squashing — face image is square from generate.js
    const targetSize = Math.max(targetW, targetH);
    console.log(`[composite] painting=${PW}x${PH} region=${targetW}x${targetH} targetSize=${targetSize} faceInput=${FW}x${FH}`);

    const facePng = await faceImg
      .resize(targetSize, targetSize, { fit: 'cover', position: 'centre' })
      .linear(0.60, 40)
      .png()
      .toBuffer();

    // ── Color matching (Reinhard) ──────────────────────────────────────────────
    const paintingCropRaw = await sharp(paintingBuf)
      .extract({ left: safeX, top: safeY, width: safeW, height: safeH })
      .resize(8, 8, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer();

    const faceCropRaw = await sharp(facePng)
      .resize(8, 8)
      .removeAlpha()
      .raw()
      .toBuffer();

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

    const blend = 0.75;
    const rScale = fStats.rS > 1 ? (pStats.rS/fStats.rS-1)*blend+1 : 1;
    const gScale = fStats.gS > 1 ? (pStats.gS/fStats.gS-1)*blend+1 : 1;
    const bScale = fStats.bS > 1 ? (pStats.bS/fStats.bS-1)*blend+1 : 1;

    const colorMatchedFace = await sharp(facePng)
      .removeAlpha()
      .recomb([
        [rScale, 0, 0],
        [0, gScale, 0],
        [0, 0, bScale],
      ])
      .modulate({ saturation: 0.90 })
      .resize(targetSize, targetSize, { fit: 'fill' })
      .png()
      .toBuffer();

    // ── Oval blend mask ───────────────────────────────────────────────────────
    const ovalSvg = `<svg width="${targetSize}" height="${targetSize}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="g" cx="50%" cy="60%" rx="50%" ry="50%">
          <stop offset="60%" stop-color="white" stop-opacity="1"/>
          <stop offset="78%" stop-color="white" stop-opacity="0.55"/>
          <stop offset="91%" stop-color="white" stop-opacity="0.07"/>
          <stop offset="100%" stop-color="white" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <ellipse cx="${targetSize*0.50}" cy="${targetSize*0.60}"
               rx="${targetSize*0.42}" ry="${targetSize*0.47}"
               fill="url(#g)"/>
    </svg>`;
    const blendMask = await sharp(Buffer.from(ovalSvg))
      .resize(targetSize, targetSize)
      .png()
      .toBuffer();

    // Get exact colorMatchedFace dimensions
    const cmMeta = await sharp(colorMatchedFace).metadata();
    const cmW = cmMeta.width;
    const cmH = cmMeta.height;

    // Resize blendMask to exactly match colorMatchedFace — must not exceed it
    const blendMaskSized = await sharp(blendMask)
      .resize(cmW, cmH, { fit: 'fill' })
      .png()
      .toBuffer();

    const maskedFaceFull = await sharp(colorMatchedFace)
      .ensureAlpha()
      .composite([{ input: blendMaskSized, blend: 'dest-in' }])
      .png()
      .toBuffer();

    // Keep face square — center it over target region
    // Offset paste position so the square face is centered on the target region center
    const targetCenterX = targetX + Math.round(targetW / 2);
    const targetCenterY = targetY + Math.round(targetH / 2);
    const pasteX = Math.max(0, Math.min(targetCenterX - Math.round(cmW / 2), PW - cmW));
    const pasteY = Math.max(0, Math.min(targetCenterY - Math.round(cmH / 2), PH - cmH));

    // Clamp to painting bounds
    const faceW = Math.min(cmW, PW - pasteX);
    const faceH = Math.min(cmH, PH - pasteY);
    const maskedFace = (faceW === cmW && faceH === cmH)
      ? maskedFaceFull
      : await sharp(maskedFaceFull).resize(faceW, faceH, { fit: 'fill' }).png().toBuffer();

    const composited = await sharp(paintingBuf)
      .composite([{ input: maskedFace, left: pasteX, top: pasteY, blend: 'over' }])
      .jpeg({ quality: 92 })
      .toBuffer();

    // ── Profile crop ──────────────────────────────────────────────────────────
    const sizeScale = Math.max(0.3, Math.min(1.0, 0.12 / region.w));
    const padX = Math.round(targetW * 0.5 * sizeScale);
    const padY = Math.round(targetH * 0.4 * sizeScale);
    const profX = Math.max(0, pasteX - padX);
    const profY = Math.max(0, pasteY - padY);
    const profW = Math.min(PW - profX, targetW + padX * 2);
    const profH = Math.min(PH - profY, targetH + padY * 2);

    const profileBuf = await sharp(composited)
      .extract({ left: profX, top: profY, width: profW, height: profH })
      .resize(400, 400, { fit: 'cover' })
      .jpeg({ quality: 90 })
      .toBuffer();

    const outputUrl  = `data:image/jpeg;base64,${composited.toString('base64')}`;
    const profileUrl = `data:image/jpeg;base64,${profileBuf.toString('base64')}`;

    return res.status(200).json({ outputUrl, profileUrl });

  } catch (err) {
    console.error('Composite error:', err);
    return res.status(500).json({ error: err.message });
  }
}
