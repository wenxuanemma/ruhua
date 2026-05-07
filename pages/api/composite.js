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

  const { styledFaceUrl, paintingImageUrl, paintingId, figureId } = req.body;
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

    // ── Step 1: Detect face and crop from full portrait ───────────────────────
    let faceCropBuf = faceBuf;
    const LOCAL_SERVER = process.env.LOCAL_INFERENCE_URL;
    if (LOCAL_SERVER && (FW > 500 || FH > 500)) {
      // Only run detection if input is a large portrait (not already cropped)
      try {
        const resizedForDetect = await sharp(faceBuf)
          .resize(640, 640, { fit: 'cover' })
          .jpeg({ quality: 85 })
          .toBuffer();
        const detectRes = await fetch(`${LOCAL_SERVER}/detect-face`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ init_image: `data:image/jpeg;base64,${resizedForDetect.toString('base64')}` }),
          signal: AbortSignal.timeout(15000),
        });
        if (detectRes.ok) {
          const { box } = await detectRes.json();
          if (box) {
            const faceCx  = Math.round(((box.x  + box.x2) / 2) * FW);
            const faceTop = Math.round(box.y  * FH);
            const faceBot = Math.round(box.y2 * FH);
            const faceH   = faceBot - faceTop;
            const faceW   = Math.round((box.x2 - box.x) * FW);
            const faceRatio = faceH / FH;

            let cropSize, cropX, cropY;
            if (faceRatio < 0.60) {
              // Good detection — use face bounds with padding
              const padTop = Math.round(faceH * 0.25);
              const padBot = Math.round(faceH * 0.15);
              cropSize = Math.max(Math.round(faceW * 1.1), faceH + padTop + padBot);
              cropX = Math.max(0, Math.min(faceCx - Math.round(cropSize/2), FW - cropSize));
              cropY = Math.max(0, Math.min(faceTop - padTop, FH - cropSize));
              console.log(`[composite face detect] ratio=${faceRatio.toFixed(2)} cropX=${cropX} cropY=${cropY} size=${cropSize}`);
            } else {
              // Oversized box — use horizontal center, start from top, 75% height
              // Crop: 70% width, 80% height square — includes full face forehead to chin
              const cropW = Math.round(FW * 0.70);
              cropX = Math.max(0, Math.min(faceCx - Math.round(cropW/2), FW - cropW));
              cropY = 0;
              cropSize = Math.round(FH * 0.80); // 80% height includes full face
              console.log(`[composite fallback crop] ratio=${faceRatio.toFixed(2)} cropX=${cropX} cropY=${cropY} size=${cropSize}`);
            }
            faceCropBuf = await sharp(faceBuf)
              .extract({ left: cropX, top: cropY, width: cropSize, height: cropSize })
              .jpeg({ quality: 95 })
              .toBuffer();
          }
        }
      } catch (e) {
        console.warn('Composite face detection failed:', e.message);
      }
    }

    // ── Step 2: Resize face to exact square ───────────────────────────────────
    let faceImg = sharp(faceCropBuf);

    if (region.angle && region.angle !== 0) {
      faceImg = faceImg.rotate(region.angle, { background: { r:128, g:100, b:70, alpha:1 } });
    }

    // Resize to exact targetSize x targetSize square — cover preserves aspect
    const facePng = await faceImg
      .resize(targetSize, targetSize, { fit: 'cover', position: 'centre' })
      .linear(0.70, 20)  // mild contrast reduction — avoid faded photo look
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

    const paintingRaw = await sharp(paintingBuf)
      .extract({ left: safeX, top: safeY, width: safeW, height: safeH })
      .resize(8, 8, { fit: 'fill' }).removeAlpha().raw().toBuffer();

    const faceRaw = await sharp(facePng)
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
    const bl = 0.90; // strong pull toward painting palette to reduce vivid colors
    const rS = (ps.rs/fs.rs-1)*bl+1;
    const gS = (ps.gs/fs.gs-1)*bl+1;
    const bS = (ps.bs/fs.bs-1)*bl+1;

    // Color match — keep exact S x S dimensions
    const colorFace = await sharp(facePng)
      .removeAlpha()
      .recomb([[rS,0,0],[0,gS,0],[0,0,bS]])
      .modulate({ saturation: 0.65 }) // reduce vivid Seedream saturation
      .png()
      .toBuffer();

    // Force exact S x S after color operations (recomb can shift by 1px)
    const colorFaceExact = await sharp(colorFace)
      .resize(S, S, { fit: 'fill' })
      .png()
      .toBuffer();

    // ── Step 3: Oval mask ─────────────────────────────────────────────────────
    const ovalSvg = `<svg width="${S}" height="${S}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="g" cx="50%" cy="52%" rx="50%" ry="50%">
          <stop offset="50%" stop-color="white" stop-opacity="1"/>
          <stop offset="70%" stop-color="white" stop-opacity="0.7"/>
          <stop offset="85%" stop-color="white" stop-opacity="0.2"/>
          <stop offset="100%" stop-color="white" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <ellipse cx="${S*0.50}" cy="${S*0.52}" rx="${S*0.36}" ry="${S*0.44}" fill="url(#g)"/>
    </svg>`;

    const ovalMask = await sharp(Buffer.from(ovalSvg))
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
    });

  } catch (err) {
    console.error('Composite error:', err);
    return res.status(500).json({ error: err.message });
  }
}
