// Dev-only live preview for /calibrate: composites a saved test portrait onto
// one figure using the box as it is on screen (not yet saved), and returns a
// crop around the face. Saved composite requests (portrait + landmarks + skin
// mask, one per figure) live in .dev-cache/preview/all-<painting>.<figure>.json
// (gitignored -- they hold the tester's selfie-derived portraits). Remote
// paintings can be cached there as <painting>.jpg to skip the download.
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import composite from './composite';

export const config = { api: { bodyParser: { sizeLimit: '2mb' }, responseLimit: false } };

const DIR = path.join(process.cwd(), '.dev-cache', 'preview');

export default async function handler(req, res) {
  if (process.env.NODE_ENV !== 'development') return res.status(404).end();
  if (req.method !== 'POST') return res.status(405).end();
  const { paintingId, figureId, region } = req.body || {};
  const file = path.join(DIR, `all-${paintingId}.${figureId}.json`);
  if (!fs.existsSync(file)) return res.status(404).json({ error: `no saved portrait for ${paintingId}.${figureId}` });

  const body = JSON.parse(fs.readFileSync(file, 'utf8'));
  const cached = path.join(DIR, `${paintingId}.jpg`);
  if (fs.existsSync(cached)) body.paintingImageUrl = `data:image/jpeg;base64,${fs.readFileSync(cached).toString('base64')}`;
  body.debugRegion = region;
  body.idempotencyKey = `preview-${Date.now()}`;

  let out, status = 200;
  const fake = { status(s) { status = s; return this; }, json(j) { out = j; return this; }, end() { return this; }, setHeader() {} };
  await composite({ method: 'POST', body }, fake);
  if (status !== 200 || !out?.outputUrl) return res.status(500).json({ error: out?.error || `composite ${status}` });

  // Crop: 1.8x the box's longer side, centred on the box.
  const img = Buffer.from(out.outputUrl.split(',')[1], 'base64');
  const { width: W, height: H } = await sharp(img).metadata();
  const r = { ...region };
  const cx = (r.x + r.w / 2) * W, cy = (r.y + r.h / 2) * H;
  const sz = Math.round(Math.max(r.w * W, r.h * H) * 1.8);
  const left = Math.max(0, Math.min(W - 1, Math.round(cx - sz / 2)));
  const top = Math.max(0, Math.min(H - 1, Math.round(cy - sz / 2)));
  const crop = await sharp(img)
    .extract({ left, top, width: Math.min(sz, W - left), height: Math.min(sz, H - top) })
    .resize(360, 360, { fit: 'inside' }).jpeg({ quality: 88 }).toBuffer();
  res.status(200).json({ url: `data:image/jpeg;base64,${crop.toString('base64')}` });
}
