// pages/api/save-face-regions.js
// Saves updated FACE_REGIONS to lib/faceRegions.js
// IMPORTANT: preserves existing angle values — never overwrites with 0
import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { regions } = req.body;
  if (!regions) return res.status(400).json({ error: 'regions required' });

  const filePath = path.join(process.cwd(), 'lib/faceRegions.js');

  // Read existing angles from current file to preserve them
  const existingAngles = {};
  try {
    const existing = fs.readFileSync(filePath, 'utf8');
    // Extract angle values using regex
    const matches = existing.matchAll(/(\w+)\s*:\s*\{[^}]*angle\s*:\s*(-?\d+)/g);
    for (const m of matches) {
      existingAngles[m[1]] = parseInt(m[2]);
    }
  } catch {}

  const lines = [
    '// lib/faceRegions.js',
    '// Single source of truth for face region coordinates.',
    '// Updated by calibrate tool at ' + new Date().toISOString(),
    '',
    'export const FACE_REGIONS = {',
  ];

  for (const [paintingId, figures] of Object.entries(regions)) {
    lines.push(`  ${paintingId}: {`);
    for (const [figId, v] of Object.entries(figures)) {
      // Preserve existing angle if incoming angle is 0 and existing is non-zero
      const existingAngle = existingAngles[figId];
      const angle = (v.angle === 0 && existingAngle && existingAngle !== 0)
        ? existingAngle
        : (v.angle ?? 0);
      lines.push(`    ${figId.padEnd(12)}: { x:${v.x.toFixed(4)}, y:${v.y.toFixed(4)}, w:${v.w.toFixed(4)}, h:${v.h.toFixed(4)}, angle:${angle} },`);
    }
    lines.push(`  },`);
  }
  lines.push('};', '');

  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  res.status(200).json({ ok: true });
}
