// pages/api/save-face-regions.js
// Saves updated FACE_REGIONS to lib/faceRegions.js
//
// IMPORTANT — merge, never clobber:
// The calibrate tool only ever holds a snapshot of FACE_REGIONS taken when
// the browser tab loaded (or last hit "Reset"). That snapshot can go stale —
// a hand-edit to this file, a second browser tab, a figure/painting the
// client hasn't touched yet — and a naive "rebuild the whole file from what
// the client sent" save will silently delete anything not in that snapshot.
// This has actually happened (foreheadClip dropped after a hand-edit,
// hanxizai fields lost previously).
//
// So: read the CURRENT on-disk FACE_REGIONS first (real eval, not regex —
// regexes only know about the specific fields someone remembered to list),
// then merge the client's submission on top of it. Any painting, figure, or
// field the client didn't send is preserved from disk untouched. This makes
// the save operation additive/safe by construction instead of relying on a
// hand-maintained allowlist of "fields to remember to preserve."
import fs from 'fs';
import path from 'path';

function readExisting(filePath) {
  let regions = {};
  let footer = '';
  try {
    const existing = fs.readFileSync(filePath, 'utf8');
    const match = existing.match(/export const FACE_REGIONS\s*=\s*(\{[\s\S]*?\n\};)/);
    if (match) {
      regions = new Function(`return ${match[1].replace(/;$/, '')}`)();
    }
    const footerMatch = existing.match(/\};\s*\n([\s\S]*)$/);
    if (footerMatch) footer = '\n' + footerMatch[1].trim();
  } catch {
    // No existing file yet — start from empty, that's fine.
  }
  return { regions, footer };
}

// Fields with dedicated formatting (arrays/objects, or values needing
// specific numeric formatting). Everything else is passed through generically
// so a new field never needs a matching code change here to survive a save.
const SPECIAL_FIELDS = new Set([
  'x', 'y', 'w', 'h', 'angle', 'faceAngle',
  'skinSample', 'faceCenter', 'faceSize',
  'foreheadClip', 'disabled', 'exactSample',
  'saturation', 'brightness', 'rMax', 'gMax', 'bMax',
]);

function serializeFigure(figId, v) {
  const x = Number(v.x) || 0, y = Number(v.y) || 0, w = Number(v.w) || 0, h = Number(v.h) || 0;
  const angle = v.angle ?? 0;
  const faceAngle = v.faceAngle || 'front';

  const faceCenterStr   = v.faceCenter   ? `, faceCenter:{ cx:${(+v.faceCenter.cx).toFixed(4)}, cy:${(+v.faceCenter.cy).toFixed(4)} }` : '';
  const skinSampleStr   = v.skinSample   ? `, skinSample:{ cx:${(+v.skinSample.cx).toFixed(4)}, cy:${(+v.skinSample.cy).toFixed(4)}, r:${(+v.skinSample.r).toFixed(4)} }` : '';
  const foreheadClipStr = v.foreheadClip ? `, foreheadClip:true` : '';
  const disabledStr     = v.disabled     ? `, disabled:true`     : '';
  const exactSampleStr  = v.exactSample  ? `, exactSample:true`  : '';
  const saturationStr   = v.saturation != null ? `, saturation:${v.saturation}` : '';
  const brightnessStr   = v.brightness != null ? `, brightness:${v.brightness}` : '';
  const rMaxStr         = v.rMax != null ? `, rMax:${v.rMax}` : '';
  const gMaxStr         = v.gMax != null ? `, gMax:${v.gMax}` : '';
  const bMaxStr         = v.bMax != null ? `, bMax:${v.bMax}` : '';
  const faceSizeStr     = v.faceSize != null ? `, faceSize:${v.faceSize}` : '';

  // Any field not in SPECIAL_FIELDS gets passed through generically, so a
  // future new field doesn't silently vanish just because this file wasn't
  // updated to know about it explicitly.
  const extra = Object.entries(v)
    .filter(([k, val]) => !SPECIAL_FIELDS.has(k) && k !== '_original' && val !== undefined)
    .map(([k, val]) => `, ${k}:${JSON.stringify(val)}`)
    .join('');

  return `    ${figId.padEnd(12)}: { x:${x.toFixed(4)}, y:${y.toFixed(4)}, w:${w.toFixed(4)}, h:${h.toFixed(4)}, angle:${angle}, faceAngle:'${faceAngle}'${foreheadClipStr}${disabledStr}${faceSizeStr}${faceCenterStr}${saturationStr}${brightnessStr}${rMaxStr}${gMaxStr}${bMaxStr}${exactSampleStr}${skinSampleStr}${extra} },`;
}

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { regions: incoming } = req.body;
  if (!incoming) return res.status(400).json({ error: 'regions required' });

  const filePath = path.join(process.cwd(), 'lib/faceRegions.js');
  const { regions: existing, footer } = readExisting(filePath);

  // Union of every painting id we know about from either side, so a
  // painting missing from the client's snapshot (e.g. never opened in this
  // tab) is preserved rather than dropped.
  const paintingIds = Array.from(new Set([...Object.keys(existing), ...Object.keys(incoming)]));

  const lines = [
    '// lib/faceRegions.js',
    '// Single source of truth for face region coordinates.',
    '// Updated by calibrate tool at ' + new Date().toISOString(),
    '// faceAngle: viewing angle of the character in the painting',
    "//   'front' | 'three_quarter_left' | 'three_quarter_right' | 'profile_left' | 'profile_right'",
    '',
    'export const FACE_REGIONS = {',
  ];

  for (const paintingId of paintingIds) {
    const existingFigures = existing[paintingId] || {};
    const incomingFigures = incoming[paintingId] || {};
    const figureIds = Array.from(new Set([...Object.keys(existingFigures), ...Object.keys(incomingFigures)]));

    lines.push(`  ${paintingId}: {`);
    for (const figId of figureIds) {
      const existingV = existingFigures[figId] || {};
      const incomingV = incomingFigures[figId];
      // Figure the client never touched this session → keep on-disk as-is.
      // Figure the client did send → merge on top of existing (client wins
      // for anything it explicitly provided; disk wins for anything it
      // didn't, e.g. hand-edited fields with no UI control yet).
      const merged = incomingV ? { ...existingV, ...incomingV } : existingV;
      lines.push(serializeFigure(figId, merged));
    }
    lines.push(`  },`);
  }
  lines.push('};');
  if (footer) lines.push(footer);
  lines.push('');

  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  res.status(200).json({ ok: true, paintings: paintingIds.length });
}
