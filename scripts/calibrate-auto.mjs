// scripts/calibrate-auto.mjs
//
// Automatically detects face regions in painting thumbnails using
// local Grounding DINO (runs on your RTX 5070, free, no API needed).
//
// Prerequisites:
//   pip install torch torchvision transformers Pillow numpy
//
// Usage:
//   node scripts/calibrate-auto.mjs
//
// Run once when adding new paintings or figures.

import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

// These must match exactly what RuHua.jsx fetches via the Wikipedia/Commons API
// Same wikiTitle/commonsTitle values as in PAINTINGS array in RuHua.jsx
const PAINTINGS = [
  {
    id: 'qingming',
    wikiTitle: 'Along_the_River_During_the_Qingming_Festival',
    figures: ['scholar', 'merchant', 'boatman'],
  },
  {
    id: 'hanxizai',
    wikiTitle: 'The_Night_Revels_of_Han_Xizai',
    figures: ['guest', 'host', 'dancer'],
  },
  {
    id: 'bunianta',
    wikiTitle: 'Emperor_Taizong_Receiving_the_Tibetan_Envoy',
    figures: ['official', 'envoy'],
  },
  {
    id: 'guoguo',
    commonsTitle: '唐 张萱 虢国夫人游春图.jpg',
    figures: ['lady', 'attendant', 'rider'],
  },
  {
    id: 'luoshen',
    wikiTitle: 'Nymph_of_the_Luo_River',
    figures: ['attendant', 'cao'],
  },
  {
    id: 'gongle',
    wikiTitle: 'A_Palace_Concert',
    figures: ['listener', 'musician', 'serving'],
  },
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchThumbnailUrl(painting) {
  if (painting.imageUrl) return painting.imageUrl;
  if (painting.commonsTitle) {
    const encoded = encodeURIComponent(painting.commonsTitle);
    const res = await fetchJson(
      `https://commons.wikimedia.org/w/api.php?action=query&titles=File:${encoded}&prop=imageinfo&iiprop=url&iiurlwidth=3000&format=json&origin=*`
    );
    const pages = res.query?.pages;
    const page = pages && Object.values(pages)[0];
    // Prefer original over thumb for large paintings
    return page?.imageinfo?.[0]?.url || page?.imageinfo?.[0]?.thumburl;
  }
  if (painting.wikiTitle) {
    const res = await fetchJson(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${painting.wikiTitle}`
    );
    // Use originalimage — same as app's setImgs() call
    return res.originalimage?.source || res.thumbnail?.source;
  }
  return null;
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, { headers: { 'User-Agent': 'RuHua/1.0' } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    }).on('error', reject);
  });
}

async function downloadImage(url, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 10000) {
    // Verify it's actually an image not an HTML error page
    const header = Buffer.alloc(4);
    const fd = fs.openSync(dest, 'r');
    fs.readSync(fd, header, 0, 4, 0);
    fs.closeSync(fd);
    const isJpeg = header[0] === 0xFF && header[1] === 0xD8;
    const isPng  = header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47;
    if (isJpeg || isPng) return; // valid cached image
    fs.unlinkSync(dest); // delete corrupt file
  }
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest);
    client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close(); if (fs.existsSync(dest)) fs.unlinkSync(dest);
        downloadImage(res.headers.location, dest).then(resolve).catch(reject); return;
      }
      if (res.statusCode !== 200) {
        file.close(); if (fs.existsSync(dest)) fs.unlinkSync(dest);
        reject(new Error(`HTTP ${res.statusCode}`)); return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', reject);
  });
}

function detectFacesLocal(imagePath) {
  const result = spawnSync('python3', [
    'scripts/detect-faces.py',
    '--image', imagePath,
  ], { encoding: 'utf8', timeout: 60000 });

  if (result.error) throw new Error(`Python error: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`detect-faces.py failed: ${result.stderr}`);

  const data = JSON.parse(result.stdout);
  return data[0]?.boxes || [];
}

function boxesToRegions(boxes) {
  return boxes.map(b => ({
    x: b.x1,
    y: b.y1,
    w: b.w,
    h: b.h,
    angle: 0,
  }));
}

async function calibratePainting(painting) {
  console.log(`\n📍 ${painting.id}`);

  const imageUrl = await fetchThumbnailUrl(painting);
  if (!imageUrl) { console.log('  ❌ Could not fetch thumbnail'); return null; }
  console.log(`  🖼  ${imageUrl.slice(0, 80)}...`);

  const tmpDir = './tmp-calibration';
  const tmpFile = path.join(tmpDir, `${painting.id}.jpg`);

  if (!fs.existsSync(tmpFile)) {
    console.log(`  ❌ Missing: ${tmpFile}`);
    console.log(`     Please manually download the image and save as ${tmpFile}`);
    console.log(`     URL: ${imageUrl}`);
    return null;
  }

  let boxes;
  try {
    boxes = detectFacesLocal(tmpFile);
  } catch (e) {
    console.log(`  ❌ Detection failed: ${e.message}`);
    return null;
  }

  if (boxes.length === 0) {
    console.log('  ⚠️  No faces detected');
    return null;
  }

  // Sort left to right
  boxes.sort((a, b) => a.x1 - b.x1);
  const regions = boxesToRegions(boxes);

  console.log(`  ✅ ${regions.length} faces detected:`);
  regions.forEach((r, i) => {
    console.log(`     [${i}] x:${r.x} y:${r.y} w:${r.w} h:${r.h}`);
  });

  const figureRegions = {};
  painting.figures.forEach((fig, i) => {
    figureRegions[fig] = regions[i] || { x: 0.4, y: 0.2, w: 0.1, h: 0.2, angle: 0 };
    if (!regions[i]) console.log(`  ⚠️  No detection for "${fig}" — using placeholder`);
  });

  return { paintingId: painting.id, figureRegions };
}

async function main() {
  // Check Python + transformers available
  const check = spawnSync('python3', ['-c', 'import transformers, torch; print("ok")'],
    { encoding: 'utf8' });
  if (check.status !== 0) {
    console.error('❌ Missing Python dependencies. Run:');
    console.error('   pip install torch torchvision transformers Pillow numpy');
    process.exit(1);
  }

  console.log('🎨 入画 Auto-Calibration via Grounding DINO (local)\n');

  const results = [];
  for (const painting of PAINTINGS) {
    const result = await calibratePainting(painting);
    if (result) results.push(result);
  }

  if (results.length === 0) {
    console.log('\n❌ No paintings calibrated successfully');
    return;
  }

  console.log('\n\n// ── Paste into composite.js FACE_REGIONS ─────────────────────');
  console.log('const FACE_REGIONS = {');
  for (const { paintingId, figureRegions } of results) {
    console.log(`  ${paintingId}: {`);
    for (const [fig, r] of Object.entries(figureRegions)) {
      console.log(`    ${fig.padEnd(12)}: { x:${r.x}, y:${r.y}, w:${r.w}, h:${r.h}, angle:${r.angle} },`);
    }
    console.log('  },');
  }
  console.log('};');

  console.log('\n\n// ── Paste into RuHua.jsx faceRegion fields ────────────────────');
  for (const { paintingId, figureRegions } of results) {
    console.log(`\n// ${paintingId}`);
    for (const [fig, r] of Object.entries(figureRegions)) {
      console.log(`  faceRegion:{ x:${r.x}, y:${r.y}, w:${r.w}, h:${r.h}, angle:${r.angle} }  // ${fig}`);
    }
  }
}

main().catch(console.error);
