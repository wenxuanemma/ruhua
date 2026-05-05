// pages/api/painting-image.js
// Serves painting images from local filesystem paths
// Resolves by ID prefix if the stored localFile path is stale/missing
import fs from 'fs';
import path from 'path';

const IMG_DIRS = [
  'wikimedia-paintings/images',
  'met-paintings/images',
  'museum-paintings/cleveland/images',
  'museum-paintings/smithsonian/images',
];

function resolveById(id) {
  if (!id) return null;
  const sid = String(id);
  for (const dir of IMG_DIRS) {
    const fullDir = path.join(process.cwd(), dir);
    if (!fs.existsSync(fullDir)) continue;
    const files = fs.readdirSync(fullDir);
    const match = files.find(f => f.startsWith(sid + '_') || f.startsWith(sid + '.'));
    if (match) return path.join(fullDir, match);
  }
  return null;
}

export default function handler(req, res) {
  const { path: imgPath, id } = req.query;

  let fullPath = null;

  // First try ID-based lookup (most reliable)
  if (id) {
    fullPath = resolveById(id);
  }

  // Fall back to path-based lookup
  if (!fullPath && imgPath) {
    const normalized = path.normalize(imgPath).replace(/\\/g, '/');
    const allowed = IMG_DIRS;
    const isAllowed = allowed.some(dir => normalized.startsWith(dir));
    if (isAllowed) {
      const candidate = path.join(process.cwd(), normalized);
      if (fs.existsSync(candidate)) fullPath = candidate;
    }

    // If path doesn't exist, try extracting ID from filename and resolving
    if (!fullPath) {
      const basename = path.basename(normalized);
      const extractedId = basename.split('_')[0];
      if (extractedId) fullPath = resolveById(extractedId);
    }
  }

  if (!fullPath || !fs.existsSync(fullPath)) {
    return res.status(404).end();
  }

  const ext = path.extname(fullPath).toLowerCase();
  const mimeTypes = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png', '.tif': 'image/tiff', '.tiff': 'image/tiff',
  };
  res.setHeader('Content-Type', mimeTypes[ext] || 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  fs.createReadStream(fullPath).pipe(res);
}
