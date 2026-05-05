// scrape-met.mjs
// Downloads high-resolution Chinese figure paintings from The Met Open Access API
// Usage: node scrape-met.mjs
// Output: ./met-paintings/ directory with images + metadata JSON

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

const OUT_DIR = './met-paintings';
const META_FILE = './met-paintings/metadata.json';
const DELAY_MS = 300; // be polite to the API

// Search terms targeting Tang/Song/Five Dynasties figure paintings
const SEARCHES = [
  'chinese figure painting tang dynasty',
  'chinese figure painting song dynasty',
  'chinese figure painting five dynasties',
  'chinese court ladies painting',
  'chinese court figure silk',
  'gongbi figure painting',
  'chinese palace painting figures',
  'tang dynasty court painting',
  'han xizai',
  'zhou fang',
  'zhang xuan',
  'gu hongzhong',
  'chinese ladies silk painting',
  'chinese figure handscroll',
];

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, { headers: { 'User-Agent': 'RuHua-Research/1.0' } }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse error for ${url}: ${e.message}`)); }
      });
    }).on('error', reject);
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(dest)) { resolve('exists'); return; }
    const client = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest);
    client.get(url, { headers: { 'User-Agent': 'RuHua-Research/1.0' } }, res => {
      // Follow redirects
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlinkSync(dest);
        downloadFile(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve('downloaded'); });
    }).on('error', err => {
      file.close();
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      reject(err);
    });
  });
}

async function searchObjects(query) {
  const encoded = encodeURIComponent(query);
  const url = `https://collectionapi.metmuseum.org/public/collection/v1/search?q=${encoded}&medium=Paintings&hasImages=true&isPublicDomain=true`;
  try {
    const data = await fetchJson(url);
    return data.objectIDs || [];
  } catch (e) {
    console.warn(`  Search failed for "${query}": ${e.message}`);
    return [];
  }
}

async function getObject(id) {
  const url = `https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`;
  try {
    return await fetchJson(url);
  } catch (e) {
    return null;
  }
}

function isFigurePainting(obj) {
  if (!obj) return false;

  const text = [
    obj.title || '',
    obj.objectName || '',
    obj.medium || '',
    obj.classification || '',
    obj.tags?.map(t => t.term).join(' ') || '',
    obj.artistDisplayName || '',
  ].join(' ').toLowerCase();

  // Must be a painting on silk/paper (not ceramics, sculpture etc)
  const isPainting = obj.classification === 'Paintings' ||
    text.includes('painting') || text.includes('handscroll') ||
    text.includes('album') || text.includes('scroll');

  // Must be Chinese
  const isChinese = obj.culture?.toLowerCase().includes('china') ||
    obj.artistNationality?.toLowerCase().includes('chinese') ||
    obj.department === 'Asian Art';

  // Must be Tang/Song/Five Dynasties/Jin/Yuan era (figure painting era)
  const dynasties = ['tang', 'song', 'five dynasties', 'liao', 'jin', 'yuan', 'han'];
  const isRightEra = dynasties.some(d => text.includes(d)) ||
    (obj.objectBeginDate >= 600 && obj.objectEndDate <= 1400);

  // Must likely contain figures (not pure landscape/calligraphy)
  const figureKeywords = [
    'figure', 'court', 'lady', 'ladies', 'woman', 'women', 'portrait',
    'palace', 'emperor', 'official', 'monk', 'scholar', 'person',
    'people', 'human', 'banquet', 'procession', 'narrative',
    '仕女', '人物', '宫', '帝', '妇', '仙'
  ];
  const hasFigure = figureKeywords.some(k => text.includes(k));

  // Has a usable high-res image
  const hasImage = obj.primaryImageSmall || obj.primaryImage;

  return isPainting && isChinese && isRightEra && hasFigure && hasImage;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(path.join(OUT_DIR, 'images'), { recursive: true });

  console.log('🎨 Met Open Access — Chinese Figure Painting Scraper\n');
  console.log(`Output: ${OUT_DIR}/`);
  console.log(`Searches: ${SEARCHES.length} queries\n`);

  // Collect all unique object IDs
  const allIds = new Set();
  for (const query of SEARCHES) {
    process.stdout.write(`  Searching: "${query}" ... `);
    const ids = await searchObjects(query);
    const before = allIds.size;
    ids.forEach(id => allIds.add(id));
    console.log(`${ids.length} results (+${allIds.size - before} new, total ${allIds.size})`);
    await sleep(DELAY_MS);
  }

  console.log(`\n📋 ${allIds.size} unique objects to evaluate\n`);

  // Fetch metadata and filter for figure paintings
  const figurePaintings = [];
  let checked = 0;
  for (const id of allIds) {
    checked++;
    if (checked % 50 === 0) {
      console.log(`  Checked ${checked}/${allIds.size} — ${figurePaintings.length} figure paintings found`);
    }
    const obj = await getObject(id);
    if (isFigurePainting(obj)) {
      figurePaintings.push({
        id: obj.objectID,
        title: obj.title,
        artist: obj.artistDisplayName,
        date: obj.objectDate,
        period: obj.period,
        culture: obj.culture,
        medium: obj.medium,
        dimensions: obj.dimensions,
        imageSmall: obj.primaryImageSmall,
        imageLarge: obj.primaryImage,
        metUrl: obj.objectURL,
        tags: obj.tags?.map(t => t.term) || [],
      });
    }
    await sleep(DELAY_MS);
  }

  console.log(`\n✅ Found ${figurePaintings.length} Chinese figure paintings\n`);

  if (figurePaintings.length === 0) {
    console.log('No paintings found. Try running with broader search terms.');
    return;
  }

  // Save metadata
  fs.writeFileSync(META_FILE, JSON.stringify(figurePaintings, null, 2));
  console.log(`📄 Metadata saved to ${META_FILE}\n`);

  // Download images
  console.log('⬇️  Downloading images...\n');
  let downloaded = 0, skipped = 0, failed = 0;

  for (const p of figurePaintings) {
    const imageUrl = p.imageLarge || p.imageSmall;
    if (!imageUrl) { skipped++; continue; }

    const ext = imageUrl.split('.').pop().split('?')[0] || 'jpg';
    const filename = `${p.id}_${p.title.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40)}.${ext}`;
    const dest = path.join(OUT_DIR, 'images', filename);

    process.stdout.write(`  [${downloaded + failed + 1}/${figurePaintings.length}] ${p.title.slice(0, 50)} ... `);

    try {
      const result = await downloadFile(imageUrl, dest);
      if (result === 'exists') {
        console.log('⏭  already exists');
        skipped++;
      } else {
        const stats = fs.statSync(dest);
        const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
        console.log(`✅ ${sizeMB}MB`);
        downloaded++;
      }
    } catch (e) {
      console.log(`❌ ${e.message}`);
      failed++;
    }

    await sleep(DELAY_MS);
  }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`✅ Downloaded:  ${downloaded}`);
  console.log(`⏭  Skipped:    ${skipped}`);
  console.log(`❌ Failed:      ${failed}`);
  console.log(`\n📁 Images in: ${OUT_DIR}/images/`);
  console.log(`📄 Metadata:   ${META_FILE}`);
  console.log(`\nNext step: run scripts/calibrate-auto.mjs on each image`);
  console.log(`to automatically detect face bounding boxes for cropping.`);
}

main().catch(console.error);
