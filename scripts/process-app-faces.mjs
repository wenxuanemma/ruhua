// scripts/process-app-faces.mjs
// Processes auto-detected-faces.json (from detect-faces.py --dir tmp-calibration/)
// and writes public/painting-faces.json for use by the app.
//
// Usage:
//   python3 scripts/detect-faces.py --dir tmp-calibration/ --output auto-detected-faces.json
//   node scripts/process-app-faces.mjs
//
// Output: public/painting-faces.json
// Format:
// {
//   "hanxizai": [
//     { "x": 0.12, "y": 0.34, "w": 0.08, "h": 0.10 },
//     ...
//   ],
//   ...
// }

import fs from 'fs';

// Map from tmp-calibration filename → painting id
const FILE_TO_ID = {
  'qingming': 'qingming',
  'hanxizai': 'hanxizai',
  'bunianta':  'bunianta',
  'guoguo':    'guoguo',
  'luoshen':   'luoshen',
  'gongle':    'gongle',
};

// Manual face boxes for paintings where DINO fails (e.g. mounted riders)
// These come from the calibrate tool corrections
const MANUAL_OVERRIDES = {
  guoguo: [
    { x:0.2667, y:0.3875, w:0.0371, h:0.12 },
    { x:0.4152, y:0.2252, w:0.0457, h:0.12 },
    { x:0.3663, y:0.0021, w:0.0346, h:0.12 },
    { x:0.5757, y:0.1882, w:0.0419, h:0.12 },
    { x:0.6601, y:0.3896, w:0.0326, h:0.12 },
    { x:0.8082, y:0.2656, w:0.0406, h:0.12 },
  ],
};

// NMS to deduplicate overlapping boxes
function iou(a, b) {
  const ix1 = Math.max(a.x1, b.x1), iy1 = Math.max(a.y1, b.y1);
  const ix2 = Math.min(a.x2, b.x2), iy2 = Math.min(a.y2, b.y2);
  if (ix2 <= ix1 || iy2 <= iy1) return 0;
  const inter = (ix2-ix1)*(iy2-iy1);
  const aArea = (a.x2-a.x1)*(a.y2-a.y1);
  const bArea = (b.x2-b.x1)*(b.y2-b.y1);
  return inter / (aArea + bArea - inter);
}

function nms(boxes, threshold = 0.3) {
  const sorted = [...boxes].sort((a,b) => b.score - a.score);
  const kept = [];
  for (const box of sorted) {
    if (kept.every(k => iou(box, k) < threshold)) kept.push(box);
  }
  return kept;
}

function isValidFace(box) {
  const w = box.x2 - box.x1;
  const h = box.y2 - box.y1;
  // Reject tiny boxes
  if (w < 0.02 || h < 0.02) return false;
  // Reject very tall bodies (h/w > 2.5)
  if (h / w > 2.5) return false;
  // Reject oversized (full image)
  if (w > 0.8 || h > 0.8) return false;
  return true;
}

const INPUT  = './auto-detected-faces.json';
const OUTPUT = './public/painting-faces.json';

if (!fs.existsSync(INPUT)) {
  console.error(`❌ ${INPUT} not found. Run:`);
  console.error('   python3 scripts/detect-faces.py --dir tmp-calibration/ --output auto-detected-faces.json');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
const result = {};

for (const entry of raw) {
  // Match filename to painting id
  const filename = entry.file.split('/').pop().replace(/\.[^.]+$/, '').toLowerCase();
  const paintingId = FILE_TO_ID[filename];
  if (!paintingId) {
    console.log(`⚠️  No mapping for file: ${entry.file}`);
    continue;
  }

  if (entry.error) {
    console.log(`❌ ${paintingId}: ${entry.error}`);
    continue;
  }

  const boxes = (entry.boxes || [])
    .filter(b => isValidFace(b))
    .map(b => ({ ...b, score: b.score || 0 }));

  const deduped = nms(boxes, 0.3);

  // Use manual override if DINO found nothing
  if (deduped.length === 0 && MANUAL_OVERRIDES[paintingId]) {
    result[paintingId] = MANUAL_OVERRIDES[paintingId];
    console.log(`✅ ${paintingId}: ${result[paintingId].length} faces (manual)`);
    continue;
  }

  // Convert to {x,y,w,h} normalized format
  result[paintingId] = deduped
    .sort((a,b) => a.x1 - b.x1) // left to right
    .map(b => ({
      x: +b.x1.toFixed(4),
      y: +b.y1.toFixed(4),
      w: +(b.x2 - b.x1).toFixed(4),
      h: +(b.y2 - b.y1).toFixed(4),
      score: +b.score.toFixed(3),
    }));

  console.log(`✅ ${paintingId}: ${result[paintingId].length} faces`);
}

fs.mkdirSync('./public', { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
console.log(`\n📄 Written to ${OUTPUT}`);
console.log('\nFace counts:');
Object.entries(result).forEach(([id, faces]) => {
  console.log(`  ${id.padEnd(12)}: ${faces.length} faces`);
});
