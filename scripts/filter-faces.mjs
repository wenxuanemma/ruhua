// filter-faces.mjs
// Runs Grounding DINO face detection on all downloaded paintings.
// Rejects images where no face is detected, or all faces are too small
// (< MIN_FACE_PX pixels in the shortest dimension).
//
// Usage:
//   REPLICATE_API_TOKEN=your_token node scripts/filter-faces.mjs
//
// Input:  reads all-metadata.json + image files from museum-paintings/
// Output: filtered-metadata.json  — paintings with usable faces
//         face-crops/             — cropped face regions ready for LoRA training
//         rejected/               — symlinks to rejected paintings (for review)
//
// Cost: ~$0.001 per image via Grounding DINO on Replicate

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

const MIN_FACE_PX = 80;
const MIN_FACE_FRAC = 0.04;
const OUT_DIR = './museum-paintings';
const CROPS_DIR = './face-crops';
const REJECTED_DIR = './rejected-paintings';
const DELAY_MS = 500; // delay between images to avoid overwhelming local CPU

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function fetchJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      headers: { 'User-Agent': 'RuHua-Research/1.0', ...options.headers },
    }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        fetchJson(res.headers.location, options).then(resolve).catch(reject);
        return;
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON error: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// Convert image file to base64 data URI for Replicate
async function detectFaces(imagePath) {
  // Run local Grounding DINO via Python script (uses RTX 5070, free, no API needed)
  const { spawnSync } = await import('child_process');
  const result = spawnSync('python3', [
    'scripts/detect-faces.py',
    '--image', imagePath,
  ], { encoding: 'utf8', timeout: 60000 });

  if (result.error) throw new Error(`Python error: ${result.error.message}`);
  if (result.status !== 0) throw new Error(result.stderr?.slice(0, 100) || 'detect-faces.py failed');

  const data = JSON.parse(result.stdout);
  const boxes = data[0]?.boxes || [];
  // Return [[x1,y1,x2,y2], ...] normalized format
  return boxes.map(b => [b.x1, b.y1, b.x2, b.y2]);
}

function parseBoxes(output) {
  // Grounding DINO output formats vary by version
  if (!output) return [];
  if (Array.isArray(output)) {
    // Format: [[x1,y1,x2,y2], ...] normalized 0-1
    if (Array.isArray(output[0])) return output;
    // Format: [{xmin, ymin, xmax, ymax}, ...]
    if (output[0]?.xmin !== undefined) return output.map(b => [b.xmin, b.ymin, b.xmax, b.ymax]);
  }
  if (output?.boxes) return output.boxes.map(b => Array.isArray(b) ? b : [b.xmin, b.ymin, b.xmax, b.ymax]);
  return [];
}

function getImageDimensions(filePath) {
  // Read image dimensions from file header without loading full image
  // Supports JPEG and PNG without sharp dependency
  const buf = Buffer.alloc(256);
  const fd = fs.openSync(filePath, 'r');
  fs.readSync(fd, buf, 0, 256, 0);
  fs.closeSync(fd);

  // JPEG
  if (buf[0] === 0xFF && buf[1] === 0xD8) {
    // Scan for SOF marker
    let offset = 2;
    while (offset < buf.length - 8) {
      if (buf[offset] === 0xFF) {
        const marker = buf[offset + 1];
        if (marker >= 0xC0 && marker <= 0xC3) {
          return {
            height: (buf[offset+5] << 8) | buf[offset+6],
            width:  (buf[offset+7] << 8) | buf[offset+8],
          };
        }
        offset += 2 + ((buf[offset+2] << 8) | buf[offset+3]);
      } else offset++;
    }
  }

  // PNG
  if (buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
    return {
      width:  (buf[16]<<24)|(buf[17]<<16)|(buf[18]<<8)|buf[19],
      height: (buf[20]<<24)|(buf[21]<<16)|(buf[22]<<8)|buf[23],
    };
  }

  // Unknown — return 1000x1000 as fallback (won't reject on size)
  return { width: 1000, height: 1000 };
}

function evaluateFaces(boxes, imgW, imgH) {
  if (!boxes || boxes.length === 0) return { pass: false, reason: 'no faces detected' };

  const usableFaces = boxes.filter(box => {
    const [x1, y1, x2, y2] = box;
    const faceW = (x2 - x1) * imgW;
    const faceH = (y2 - y1) * imgH;
    const faceFrac = (y2 - y1); // fraction of image height
    const faceMinPx = Math.min(faceW, faceH);
    // Pass if face height is large enough in pixels (bypasses fraction check for tall images)
    // OR both dimensions >= MIN_FACE_PX and fraction >= MIN_FACE_FRAC
    //return faceH >= 150 || (faceMinPx >= MIN_FACE_PX && faceFrac >= MIN_FACE_FRAC);
    return faceH >= MIN_FACE_PX || (faceMinPx >= MIN_FACE_PX && faceFrac >= MIN_FACE_FRAC);
  });

  if (usableFaces.length === 0) {
    const biggest = boxes.reduce((best, box) => {
      const h = (box[3] - box[1]) * imgH;
      return h > best ? h : best;
    }, 0);
    return { pass: false, reason: `faces too small (biggest: ${Math.round(biggest)}px)` };
  }

  return { pass: true, faces: usableFaces };
}

async function main() {
  fs.mkdirSync(CROPS_DIR, { recursive: true });
  fs.mkdirSync(REJECTED_DIR, { recursive: true });

  // Load metadata from all scraper outputs
  const metadataSources = [
    { file: path.join('./museum-paintings', 'all-metadata.json'), imgDir: null },
    { file: path.join('./met-paintings', 'metadata.json'),        imgDir: './met-paintings/images' },
    { file: path.join('./npm-paintings', 'metadata.json'),        imgDir: './npm-paintings/images' },
    { file: path.join('./wikimedia-paintings', 'metadata.json'),  imgDir: './wikimedia-paintings/images' },
  ];

  let allPaintings = [];
  for (const src of metadataSources) {
    if (fs.existsSync(src.file)) {
      const data = JSON.parse(fs.readFileSync(src.file, 'utf8'));

      // Resolve localFile for entries that don't have it recorded
      const resolved = data.map(p => {
        if (p.localFile && fs.existsSync(p.localFile)) return p;
        // Try to find image by id in the image directory
        if (src.imgDir && fs.existsSync(src.imgDir)) {
          const files = fs.readdirSync(src.imgDir);
          const match = files.find(f => f.startsWith(String(p.id) + '_') || f.startsWith(String(p.id) + '.'));
          if (match) return { ...p, localFile: path.join(src.imgDir, match) };
          // Also try matching by title fragment
          const safeTitle = (p.title || '').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
          const match2 = files.find(f => f.includes(safeTitle) && safeTitle.length > 5);
          if (match2) return { ...p, localFile: path.join(src.imgDir, match2) };
        }
        return p;
      });

      allPaintings = allPaintings.concat(resolved);
      console.log(`  Loaded ${data.length} paintings from ${src.file} (${resolved.filter(p=>p.localFile && fs.existsSync(p.localFile)).length} with images)`);
    } else {
      console.log(`  Skipped (not found): ${src.file}`);
    }
  }

  // Deduplicate by id
  const seen = new Set();
  allPaintings = allPaintings.filter(p => {
    const key = `${p.source}:${p.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`\n🎨 Face Filter — ${allPaintings.length} unique paintings to evaluate`);
  console.log(`   Min face size: ${MIN_FACE_PX}px, min face fraction: ${MIN_FACE_FRAC * 100}% of height\n`);

  // Load previous results if any, re-resolving stale localFile paths by ID
  const imgDirs = metadataSources
    .filter(s => s.imgDir && fs.existsSync(s.imgDir))
    .map(s => s.imgDir);

  function resolveLocalFile(p) {
    if (p.localFile && fs.existsSync(p.localFile)) return p;
    // Stale path — find file by ID prefix in any image directory
    for (const dir of imgDirs) {
      const files = fs.readdirSync(dir);
      const match = files.find(f =>
        f.startsWith(String(p.id) + '_') ||
        f.startsWith(String(p.id) + '.')
      );
      if (match) return { ...p, localFile: path.join(dir, match) };
    }
    return { ...p, localFile: null }; // genuinely missing
  }

  const resultPath = path.join(OUT_DIR, 'filtered-metadata.json');
  const existingResults = fs.existsSync(resultPath)
    ? JSON.parse(fs.readFileSync(resultPath, 'utf8'))
    : { passed: [], rejected: [] };

  // Re-resolve stale paths
  existingResults.passed  = existingResults.passed.map(resolveLocalFile);
  existingResults.rejected = existingResults.rejected.map(resolveLocalFile);

  // Persist fixed paths
  fs.writeFileSync(resultPath, JSON.stringify(existingResults, null, 2));

  const processedIds = new Set([
    ...existingResults.passed.map(p => p.id),
    ...existingResults.rejected.map(p => p.id),
  ]);

  const toProcess = allPaintings.filter(p => {
    if (!p.localFile || !fs.existsSync(p.localFile)) return false;
    if (processedIds.has(p.id)) return false;
    return true;
  });

  // Report how many have no localFile
  const noFile = allPaintings.filter(p => !p.localFile || !fs.existsSync(p.localFile)).length;
  if (noFile > 0) console.log(`   No local image: ${noFile} (run scrape scripts first)`);

  console.log(`   Already processed: ${processedIds.size}`);
  console.log(`   To process: ${toProcess.length}\n`);

  let passed = 0, rejected = 0, errored = 0;

  for (const p of toProcess) {
    process.stdout.write(`  [${passed+rejected+errored+1}/${toProcess.length}] ${p.title.slice(0,45).padEnd(45)} ... `);

    try {
      // Get image dimensions for size threshold
      const dims = getImageDimensions(p.localFile);

      // Run face detection
      const output = await detectFaces(p.localFile);
      const boxes = parseBoxes(output);
      const { pass, reason, faces } = evaluateFaces(boxes, dims.width, dims.height);

      if (pass) {
        console.log(`✅ ${faces.length} usable face(s)`);
        existingResults.passed.push({
          ...p,
          faces: faces.map(b => ({
            x: +b[0].toFixed(3), y: +b[1].toFixed(3),
            w: +(b[2]-b[0]).toFixed(3), h: +(b[3]-b[1]).toFixed(3),
          })),
          imgW: dims.width,
          imgH: dims.height,
        });
        passed++;
      } else {
        console.log(`❌ ${reason}`);
        existingResults.rejected.push({ ...p, rejectReason: reason });
        // Move to rejected dir for review
        const filename = path.basename(p.localFile);
        const rejDest = path.join(REJECTED_DIR, filename);
        if (!fs.existsSync(rejDest)) fs.renameSync(p.localFile, rejDest);
        rejected++;
      }

      // Save progress after every image
      fs.writeFileSync(resultPath, JSON.stringify(existingResults, null, 2));

    } catch (e) {
      console.log(`⚠️  ${e.message}`);
      errored++;
    }

    await sleep(DELAY_MS);
  }

  console.log('\n' + '═'.repeat(55));
  console.log(`✅ Passed:   ${existingResults.passed.length} paintings with usable faces`);
  console.log(`❌ Rejected: ${existingResults.rejected.length} (no faces / too distant)`);
  console.log(`⚠️  Errors:   ${errored}`);
  console.log(`\n📄 Results: ${resultPath}`);
  console.log(`📁 Rejected images moved to: ${REJECTED_DIR}/`);
  console.log(`\nNext: run scripts/crop-faces.mjs to extract face crops for training`);
}

main().catch(console.error);
