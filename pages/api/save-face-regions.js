// pages/api/save-face-regions.js
// Saves updated FACE_REGIONS to lib/faceRegions.js
import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { regions } = req.body;
  if (!regions) return res.status(400).json({ error: 'regions required' });

  const filePath = path.join(process.cwd(), 'lib/faceRegions.js');

  // Build file content
  const lines = ['// lib/faceRegions.js', '// Single source of truth for face region coordinates.', '// Updated by calibrate tool at ' + new Date().toISOString(), '', 'export const FACE_REGIONS = {'];

  for (const [paintingId, figures] of Object.entries(regions)) {
    lines.push(`  ${paintingId}: {`);
    for (const [figId, v] of Object.entries(figures)) {
      lines.push(`    ${figId.padEnd(12)}: { x:${v.x.toFixed(4)}, y:${v.y.toFixed(4)}, w:${v.w.toFixed(4)}, h:${v.h.toFixed(4)}, angle:${v.angle ?? 0} },`);
    }
    lines.push(`  },`);
  }
  lines.push('};', '');

  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  res.status(200).json({ ok: true });
}
