// pages/api/training-data.js
// Returns list of passed paintings from filtered-metadata.json
// Only includes paintings whose image file exists on disk (resolved by ID prefix)
import fs from 'fs';
import path from 'path';

const IMG_DIRS = [
  'wikimedia-paintings/images',
  'met-paintings/images',
  'museum-paintings/cleveland/images',
  'museum-paintings/smithsonian/images',
];

function resolveById(id) {
  const sid = String(id);
  for (const dir of IMG_DIRS) {
    const fullDir = path.join(process.cwd(), dir);
    if (!fs.existsSync(fullDir)) continue;
    const match = fs.readdirSync(fullDir).find(f =>
      f.startsWith(sid + '_') || f.startsWith(sid + '.')
    );
    if (match) return path.join(dir, match);
  }
  return null;
}

export default function handler(req, res) {
  const metaPath = path.join(process.cwd(), 'museum-paintings/filtered-metadata.json');
  if (!fs.existsSync(metaPath)) {
    return res.status(404).json({ error: 'filtered-metadata.json not found' });
  }
  const data = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

  const paintings = [];
  for (const p of (data.passed || [])) {
    // Try ID-based lookup first, then stored localFile
    const resolved = resolveById(p.id) ||
      (p.localFile && fs.existsSync(p.localFile) ? p.localFile : null);
    if (!resolved) continue; // skip missing files
    paintings.push({
      id: p.id,
      title: p.title,
      dynasty: p.dynasty || '',
      localFile: resolved, // use resolved path so API can serve it
      faces: p.faces || [],
      source: p.source,
    });
  }

  res.status(200).json({ paintings, total: paintings.length });
}
