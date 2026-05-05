// scrape-wikimedia.mjs
// Scrapes Chinese figure paintings from Wikimedia Commons
// Uses the MediaWiki API — no key needed, free, fast
// Most images are PD-Art (public domain)
//
// Usage: node scripts/scrape-wikimedia.mjs
// Output: ./wikimedia-paintings/images/ + metadata.json

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

const DELAY_MS = 5000; // 5s between downloads — Wikimedia enforces strict rate limits
const OUT_DIR = './wikimedia-paintings';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      headers: { 'User-Agent': 'RuHua-Research/1.0 (ruhua.vercel.app)' }, timeout: 30000,
      timeout: 30000,
    }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        fetchJson(res.headers.location).then(resolve).catch(reject); return;
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON error: ${e.message.slice(0,60)}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function downloadFile(url, dest, retries = 4) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 5000) return 'exists';

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      const wait = attempt * 60000; // 60s, 120s, 180s, 240s
      process.stdout.write(`⏳ wait ${wait/1000}s... `);
      await sleep(wait);
    }

    try {
      await new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        const file = fs.createWriteStream(dest);
        const req = client.get(url, {
          headers: { 'User-Agent': 'RuHua-Research/1.0 (ruhua.vercel.app)' }, timeout: 30000
        }, res => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            file.close(); if (fs.existsSync(dest)) fs.unlinkSync(dest);
            // follow redirect — update url for next attempt
            url = res.headers.location;
            resolve('redirect');
            return;
          }
          if (res.statusCode === 429) {
            file.close(); if (fs.existsSync(dest)) fs.unlinkSync(dest);
            reject(new Error('429'));
            return;
          }
          if (res.statusCode !== 200) {
            file.close(); if (fs.existsSync(dest)) fs.unlinkSync(dest);
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }
          res.pipe(file);
          file.on('finish', () => { file.close(); resolve('downloaded'); });
        });
        req.on('error', err => {
          file.close(); if (fs.existsSync(dest)) fs.unlinkSync(dest);
          reject(err);
        });
        req.on('timeout', () => {
          req.destroy();
          file.close(); if (fs.existsSync(dest)) fs.unlinkSync(dest);
          reject(new Error('Timeout'));
        });
      });
      return 'downloaded'; // success
    } catch (e) {
      if (e.message !== '429' || attempt === retries) throw e;
      // 429 — will retry with longer wait
    }
  }
}

function safeName(str, max = 60) {
  return (str || 'untitled')
    .replace(/[^a-zA-Z0-9]/g, '_')  // strip ALL non-ASCII including Chinese chars
    .replace(/_+/g, '_')             // collapse multiple underscores
    .slice(0, max);
}

// Wikimedia Commons categories for Chinese figure paintings
// These are manually curated — each category contains relevant paintings
const CATEGORIES = [
  'Paintings_of_the_Tang_Dynasty',
  'Paintings_of_the_Song_Dynasty',
  'Paintings_of_the_Five_Dynasties_and_Ten_Kingdoms_period',
  'Paintings_of_the_Song_Dynasty_in_the_National_Palace_Museum',
  'Paintings_of_the_Tang_Dynasty_in_the_National_Palace_Museum',
  'Chinese_figure_paintings',
  'Paintings_by_Zhou_Fang',
  'Paintings_by_Zhang_Xuan',
  'Paintings_by_Gu_Hongzhong',
  'Court_ladies_in_Chinese_art',
  'Liao_dynasty_paintings',
  'Jin_dynasty_(1115-1234)_paintings',
  'Yuan_dynasty_paintings',
  'Chinese_paintings_of_women',
  'Paintings_of_court_ladies',
];

// Keywords that indicate figure paintings with faces
const FIGURE_KEYWORDS = [
  'court', 'ladies', 'figure', 'portrait', 'woman', 'women',
  'palace', 'imperial', 'beauty', 'banquet', 'procession',
  'immortal', 'celestial', 'scholar', 'official', '仕女', '人物',
  '宮廷', '仙', '帝', '貴', '夫人',
];

// Keywords to exclude
const EXCLUDE_KEYWORDS = [
  'landscape', 'bamboo', 'flower', 'bird', 'horse', 'cat',
  'calligraphy', 'sutra', 'map', 'mountain', 'river', 'lake',
];

async function getCategoryMembers(category, continueToken = null) {
  let url = `https://commons.wikimedia.org/w/api.php?` +
    `action=query&list=categorymembers&cmtitle=Category:${encodeURIComponent(category)}` +
    `&cmtype=file&cmlimit=100&format=json&origin=*`;
  if (continueToken) url += `&cmcontinue=${encodeURIComponent(continueToken)}`;
  return fetchJson(url);
}

async function getImageInfo(titles) {
  // Fetch image URLs and metadata for up to 50 files at once
  const titleStr = titles.join('|');
  const url = `https://commons.wikimedia.org/w/api.php?` +
    `action=query&titles=${encodeURIComponent(titleStr)}` +
    `&prop=imageinfo|categories&iiprop=url|size|extmetadata` +
    `&iiurlwidth=2000&format=json&origin=*`;
  return fetchJson(url);
}

function isFigurePainting(title, metadata) {
  const titleLower = title.toLowerCase();
  const metaText = JSON.stringify(metadata || {}).toLowerCase();

  // Already filtered by dynasty category — most of these ARE paintings.
  // Just exclude obvious non-figure content by title.
  const EXCLUDE = [
    'landscape', 'bamboo', 'orchid', 'plum', 'chrysanthemum',
    'bird', 'fish', 'insect', 'flower', 'rock', 'stone',
    'calligraphy', 'sutra', 'scripture', 'text', 'poem',
    'map', 'diagram', 'horse only', 'dragon', 'tiger',
    'cat', 'dog', 'ox', 'deer',
  ];
  if (EXCLUDE.some(k => titleLower.includes(k))) return false;

  // Must be an image file
  if (!/\.(jpg|jpeg|png|tif|tiff)$/i.test(title)) return false;

  return true; // Accept by default — face detection will filter further
}

async function scrapeCategory(category) {
  const members = [];
  let continueToken = null;

  do {
    try {
      const data = await getCategoryMembers(category, continueToken);
      const items = data.query?.categorymembers || [];
      members.push(...items);
      continueToken = data.continue?.cmcontinue || null;
    } catch (e) {
      break;
    }
    await sleep(DELAY_MS);
  } while (continueToken && members.length < 500);

  return members;
}

async function main() {
  fs.mkdirSync(path.join(OUT_DIR, 'images'), { recursive: true });

  console.log('🎨 Wikimedia Commons — Chinese Figure Paintings\n');

  // Collect all file titles from all categories
  const allFiles = new Map();

  for (const cat of CATEGORIES) {
    process.stdout.write(`  Category: ${cat} ... `);
    try {
      const members = await scrapeCategory(cat);
      const before = allFiles.size;
      for (const m of members) {
        if (!allFiles.has(m.title)) allFiles.set(m.title, { title: m.title, category: cat });
      }
      console.log(`${members.length} files (+${allFiles.size - before} new)`);
    } catch (e) {
      console.log(`❌ ${e.message}`);
    }
    await sleep(DELAY_MS);
  }

  console.log(`\n  📋 ${allFiles.size} unique files — fetching image info...\n`);

  // Fetch image info in batches of 50
  const allTitles = [...allFiles.keys()];
  const paintings = [];

  for (let i = 0; i < allTitles.length; i += 50) {
    const batch = allTitles.slice(i, i + 50);
    try {
      const data = await getImageInfo(batch);
      const pages = data.query?.pages || {};
      for (const page of Object.values(pages)) {
        if (!page.imageinfo?.[0]) continue;
        const info = page.imageinfo[0];
        const title = page.title || '';
        const meta = info.extmetadata || {};

        if (!isFigurePainting(title, meta)) continue;

        // Only include images at least 600px on the longer side
        if (info.width < 600 && info.height < 600) continue;

        const artist = meta.Artist?.value?.replace(/<[^>]+>/g, '') || 'Unknown';
        const date = meta.DateTimeOriginal?.value || meta.Date?.value || '';
        const description = meta.ImageDescription?.value?.replace(/<[^>]+>/g, '') || '';
        const license = meta.LicenseShortName?.value || 'PD-Art';

        paintings.push({
          source: 'wikimedia',
          id: page.pageid?.toString() || safeName(title, 20),
          title: title.replace('File:', ''),
          artist,
          date,
          description,
          license,
          width: info.width,
          height: info.height,
          imageUrl: info.thumburl || info.url,
          pageUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`,
          category: allFiles.get(title)?.category,
          localFile: null,
        });
      }
    } catch (e) {
      // skip batch
    }
    await sleep(DELAY_MS);
  }

  console.log(`  ✅ ${paintings.length} figure paintings (≥1000px)\n`);

  if (paintings.length === 0) {
    console.log('No paintings found. Check category names or network connection.');
    return;
  }

  // Download
  let dl = 0, skip = 0, fail = 0;
  const successful = [];

  for (const p of paintings) {
    const ext = p.imageUrl.split('?')[0].split('.').pop() || 'jpg';
    const safeExt = ['jpg','jpeg','png','tif','tiff'].includes(ext.toLowerCase()) ? ext : 'jpg';
    const filename = `${p.id}_${safeName(p.title, 50)}.${safeExt}`;
    const dest = path.join(OUT_DIR, 'images', filename);

    process.stdout.write(`  [${dl+skip+fail+1}/${paintings.length}] ${p.title.slice(0,50).padEnd(50)} ... `);

    try {
      const r = await downloadFile(p.imageUrl, dest);
      if (r === 'exists') {
        console.log(`⏭  (${(fs.statSync(dest).size/1024/1024).toFixed(1)}MB)`);
        skip++;
      } else {
        const size = fs.statSync(dest).size;
        if (size < 10000) { fs.unlinkSync(dest); console.log('❌ too small'); fail++; continue; }
        console.log(`✅ (${(size/1024/1024).toFixed(1)}MB)`);
        dl++;
      }
      successful.push({ ...p, localFile: dest });
    } catch (e) {
      console.log(`❌ ${e.message}`);
      fail++;
    }
    await sleep(DELAY_MS);
  }

  fs.writeFileSync(path.join(OUT_DIR, 'metadata.json'), JSON.stringify(successful, null, 2));

  console.log('\n' + '═'.repeat(55));
  console.log(`✅ Downloaded: ${dl}`);
  console.log(`⏭  Skipped:   ${skip}`);
  console.log(`❌ Failed:     ${fail}`);
  console.log(`\n📁 Images: ${OUT_DIR}/images/`);
  console.log(`📄 Metadata: ${OUT_DIR}/metadata.json`);
  console.log('\nNext: run scripts/filter-faces.mjs to detect usable faces');
}

main().catch(console.error);
