// pages/api/save-face-regions.js
// Saves updated FACE_REGIONS to lib/faceRegions.js
// IMPORTANT: preserves existing angle and faceAngle values
import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { regions } = req.body;
  if (!regions) return res.status(400).json({ error: 'regions required' });

  const filePath = path.join(process.cwd(), 'lib/faceRegions.js');

  // Read existing angles and faceAngles from current file
  const existingAngles = {};
  const existingFaceAngles = {};
  let existingFooter = ''; // preserve GUEST_SPOTS and anything after FACE_REGIONS
  try {
    const existing = fs.readFileSync(filePath, 'utf8');
    // Extract rotation angles
    const angleMatches = existing.matchAll(/(\w+)\s*:\s*\{[^}]*angle\s*:\s*(-?\d+)/g);
    for (const m of angleMatches) existingAngles[m[1]] = parseInt(m[2]);
    // Extract faceAngles
    const faceAngleMatches = existing.matchAll(/(\w+)\s*:\s*\{[^}]*faceAngle\s*:\s*'([^']+)'/g);
    for (const m of faceAngleMatches) existingFaceAngles[m[1]] = m[2];
    // Preserve everything after FACE_REGIONS closing
    const footerMatch = existing.match(/\};\s*\n([\s\S]*)$/);
    if (footerMatch) existingFooter = '\n' + footerMatch[1].trim();
  } catch {}

  const lines = [
    '// lib/faceRegions.js',
    '// Single source of truth for face region coordinates.',
    '// Updated by calibrate tool at ' + new Date().toISOString(),
    '// faceAngle: viewing angle of the character in the painting',
    "//   'front' | 'three_quarter_left' | 'three_quarter_right' | 'profile_left' | 'profile_right'",
    '',
    'export const FACE_REGIONS = {',
  ];

  for (const [paintingId, figures] of Object.entries(regions)) {
    lines.push(`  ${paintingId}: {`);
    for (const [figId, v] of Object.entries(figures)) {
      const existingAngle = existingAngles[figId];
      const angle = (v.angle === 0 && existingAngle && existingAngle !== 0)
        ? existingAngle
        : (v.angle ?? 0);
      const faceAngle = existingFaceAngles[figId] || 'front';
      lines.push(`    ${figId.padEnd(12)}: { x:${v.x.toFixed(4)}, y:${v.y.toFixed(4)}, w:${v.w.toFixed(4)}, h:${v.h.toFixed(4)}, angle:${angle}, faceAngle:'${faceAngle}' },`);
    }
    lines.push(`  },`);
  }
  lines.push('};');
  if (existingFooter) lines.push(existingFooter);
  lines.push('');

  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  res.status(200).json({ ok: true });
}
