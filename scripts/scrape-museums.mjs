// scrape-museums.mjs
// Scrapes Chinese figure paintings from:
//   - Cleveland Museum of Art (openaccess-api.clevelandart.org)
//   - Smithsonian / Freer-Sackler (api.si.edu)
//
// Usage:
//   SMITHSONIAN_API_KEY=your_key node scrape-museums.mjs
//
// Get a free Smithsonian API key at: https://api.si.edu/
// Cleveland API needs no key.
//
// Output: ./museum-paintings/{cleveland,smithsonian}/images/ + metadata.json

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

const SMITHSONIAN_KEY = process.env.SMITHSONIAN_API_KEY || '';
const DELAY_MS = 400;
const OUT_DIR = './museum-paintings';

// ── Utilities ──────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { headers: { 'User-Agent': 'RuHua-Research/1.0' } }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        fetchJson(res.headers.location).then(resolve).catch(reject);
        return;
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse error for ${url.slice(0,80)}: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(dest)) { resolve('exists'); return; }
    const client = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest);
    const req = client.get(url, { headers: { 'User-Agent': 'RuHua-Research/1.0' } }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close(); fs.unlinkSync(dest);
        downloadFile(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.close(); if (fs.existsSync(dest)) fs.unlinkSync(dest);
        reject(new Error(`HTTP ${res.statusCode}`)); return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve('downloaded'); });
    });
    req.on('error', err => { file.close(); if (fs.existsSync(dest)) fs.unlinkSync(dest); reject(err); });
  });
}

function safeName(str, max = 50) {
  return (str || 'untitled').replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_').slice(0, max);
}

// ── Cleveland Museum of Art ──────────────────────────────────────────────

const CMA_FIGURE_KEYWORDS = [
  'figure', 'court lady', 'court ladies', 'palace lady', 'palace ladies',
  'portrait', 'beauty', 'woman weaving', 'women weaving',
  'emperor', 'imperial', 'procession', 'banquet', 'narrative',
  'immortal', 'celestial being', 'bodhisattva with attendants',
];

// Keywords that indicate NOT a figure painting despite matching above
const CMA_EXCLUDE_KEYWORDS = [
  'sutra', 'scripture', 'calligraphy', 'landscape', 'bamboo',
  'bird', 'flower', 'fish', 'insect', 'horse', 'cat', 'dog',
  'rock', 'mountain', 'river', 'map', 'architectural',
];

const CMA_SEARCHES = [
  'chinese figure painting',
  'chinese court painting',
  'chinese ladies painting silk',
  'tang dynasty painting figures',
  'song dynasty figure painting',
  'five dynasties painting',
  'chinese narrative painting',
  'zhou fang',
  'zhang xuan',
  'gongbi painting',
  'palace ladies china',
  'chinese handscroll figures',
];

async function scrapeCleveland() {
  console.log('\n🏛️  Cleveland Museum of Art\n');
  const outDir = path.join(OUT_DIR, 'cleveland', 'images');
  fs.mkdirSync(outDir, { recursive: true });

  const allIds = new Set();

  for (const q of CMA_SEARCHES) {
    const url = `https://openaccess-api.clevelandart.org/api/artworks/?q=${encodeURIComponent(q)}&type=Painting&has_image=1&cc0=1&limit=100&skip=0`;
    process.stdout.write(`  "${q}" ... `);
    try {
      const data = await fetchJson(url);
      const items = data.data || [];
      const before = allIds.size;
      items.forEach(item => allIds.add(item.id));
      console.log(`${items.length} results (+${allIds.size - before} new)`);
    } catch (e) {
      console.log(`❌ ${e.message}`);
    }
    await sleep(DELAY_MS);
  }

  console.log(`\n  📋 ${allIds.size} unique objects — fetching full metadata...\n`);

  const paintings = [];
  for (const id of allIds) {
    try {
      const url = `https://openaccess-api.clevelandart.org/api/artworks/${id}`;
      const data = await fetchJson(url);
      const obj = data.data;
      if (!obj) continue;

      const text = [obj.title, obj.description, obj.technique,
        ...(obj.creators?.map(c => c.description) || [])].join(' ').toLowerCase();

      // Filter: Chinese + right era + has figures + has image
      const isChinese = obj.culture?.some(c => c.toLowerCase().includes('china') || c.toLowerCase().includes('chinese'));
      const isRightEra = (obj.creation_date_earliest >= 600 && obj.creation_date_latest <= 1400);
      const hasFigure = CMA_FIGURE_KEYWORDS.some(k => text.includes(k));
      const isExcluded = CMA_EXCLUDE_KEYWORDS.some(k => text.includes(k));

      // Use 'print' size (~2000px, ~2MB JPEG) — perfect for LoRA training.
      // 'full' is archival TIFF (1GB+), 'web' is too small (800px).
      const imageUrl = obj.images?.print?.url || obj.images?.web?.url;

      if (isChinese && isRightEra && hasFigure && !isExcluded && imageUrl) {
        paintings.push({
          source: 'cleveland',
          id: obj.id,
          accession: obj.accession_number,
          title: obj.title,
          artist: obj.creators?.[0]?.description || 'Unknown',
          date: obj.creation_date,
          culture: obj.culture?.join(', '),
          technique: obj.technique,
          imageUrl: obj.images?.print?.url || obj.images?.web?.url,
          url: obj.url,
        });
      }
    } catch (e) { /* skip */ }
    await sleep(DELAY_MS);
  }

  console.log(`  ✅ ${paintings.length} Chinese figure paintings (600–1400 CE)\n`);

  // Download
  let dl = 0, skip = 0, fail = 0;
  for (const p of paintings) {
    const imgUrl = p.imageUrl;
    const ext = imgUrl.split('.').pop().split('?')[0] || 'jpg';
    const dest = path.join(outDir, `${p.id}_${safeName(p.title)}.${ext}`);
    process.stdout.write(`  [${dl+skip+fail+1}/${paintings.length}] ${p.title.slice(0,50)} ... `);
    try {
      const r = await downloadFile(imgUrl, dest);
      if (r === 'exists') { console.log('⏭'); skip++; }
      else { console.log(`✅ ${(fs.statSync(dest).size/1024/1024).toFixed(1)}MB`); dl++; }
    } catch (e) { console.log(`❌ ${e.message}`); fail++; }
    await sleep(DELAY_MS);
  }

  fs.writeFileSync(path.join(OUT_DIR, 'cleveland', 'metadata.json'), JSON.stringify(paintings, null, 2));
  console.log(`\n  Downloaded:${dl} Skipped:${skip} Failed:${fail}`);
  return paintings;
}

// ── Smithsonian / Freer-Sackler ──────────────────────────────────────────

const SI_SEARCHES = [
  'chinese figure painting Tang dynasty',
  'chinese court painting Song dynasty',
  'chinese palace ladies painting',
  'chinese narrative painting scroll',
  'five dynasties painting figures China',
  'gongbi figure China',
  'Zhou Fang painting',
  'chinese handscroll court figures',
];

async function scrapeSmithsonian() {
  console.log('\n🏛️  Smithsonian / Freer-Sackler Gallery\n');

  if (!SMITHSONIAN_KEY) {
    console.log('  ⚠️  No SMITHSONIAN_API_KEY set — skipping.');
    console.log('  Get a free key at: https://api.data.gov/signup');
    console.log('  (Takes 30 seconds — just an email address)\n');
    return [];
  }

  const outDir = path.join(OUT_DIR, 'smithsonian', 'images');
  fs.mkdirSync(outDir, { recursive: true });

  const allItems = new Map();

  for (const q of SI_SEARCHES) {
    // Correct Smithsonian API endpoint — hosted on api.data.gov
    const url = `https://api.si.edu/openaccess/api/v1.0/search?q=${encodeURIComponent(q)}&api_key=${SMITHSONIAN_KEY}&rows=100&start=0&unit_code=FSG&online_media_type=Images&cc0=true`;
    process.stdout.write(`  "${q}" ... `);
    try {
      const data = await fetchJson(url);
      const rows = data.response?.rows || [];
      let added = 0;
      for (const row of rows) {
        if (!allItems.has(row.id)) { allItems.set(row.id, row); added++; }
      }
      console.log(`${rows.length} results (+${added} new)`);
    } catch (e) {
      console.log(`❌ ${e.message}`);
    }
    await sleep(DELAY_MS);
  }

  console.log(`\n  📋 ${allItems.size} unique objects — filtering...\n`);

  const SI_EXCLUDE = [
    'tomb figure', 'sculpture', 'ceramic', 'bronze', 'jade', 'vessel',
    'bowl', 'vase', 'jar', 'cup', 'flask', 'ewer', 'dish', 'plate',
    'textile', 'embroidery', 'lacquer', 'furniture', 'coin', 'seal',
    'calligraphy', 'sutra', 'scripture', 'fan', 'album leaf with poem',
  ];

  const paintings = [];
  for (const [id, row] of allItems) {
    const content = row.content || {};
    const freetext = content.freetext || {};
    const text = JSON.stringify(content).toLowerCase();
    const title = (content.descriptiveNonRepeating?.title?.content || '').toLowerCase();

    const isChinese = text.includes('china') || text.includes('chinese');
    // Must explicitly say painting/handscroll/scroll — check title AND medium fields
    const medium = JSON.stringify(freetext.physicalDescription || freetext.medium || '').toLowerCase();
    const isPainting = title.includes('painting') || title.includes('handscroll') ||
      title.includes('scroll') || medium.includes('ink on silk') ||
      medium.includes('ink and color') || medium.includes('color on silk') ||
      medium.includes('color on paper') || text.includes('ink on silk') ||
      text.includes('ink and color on silk') || text.includes('handscroll');    const isRightEra = text.includes('tang') || text.includes('song dynasty') ||
      text.includes('five dynasties') || text.includes('jin dynasty') ||
      text.includes('liao') || text.includes('yuan');
    const hasFigure = CMA_FIGURE_KEYWORDS.some(k => text.includes(k));
    const isExcluded = SI_EXCLUDE.some(k => title.includes(k) || text.includes(k));

    // Get image URL from media
    const media = content.descriptiveNonRepeating?.online_media?.media || [];
    const image = media.find(m => m.type === 'Images' || m.thumbnail);
    const imageUrl = image?.content || image?.thumbnail;

    if (isChinese && isPainting && isRightEra && hasFigure && !isExcluded && imageUrl) {
      paintings.push({
        source: 'smithsonian',
        id,
        title: content.descriptiveNonRepeating?.title?.content || 'Unknown',
        artist: freetext.name?.[0]?.content || 'Unknown',
        date: freetext.date?.[0]?.content || '',
        culture: freetext.place?.[0]?.content || 'China',
        imageUrl,
        url: content.descriptiveNonRepeating?.record_link,
      });
    }
    await sleep(50);
  }

  console.log(`  ✅ ${paintings.length} Chinese figure paintings\n`);

  // Download — derive filename from id only to avoid URL path segments in filename
  let dl = 0, skip = 0, fail = 0;
  for (const p of paintings) {
    // Extract extension from URL safely — avoid treating URL path segments as extension
    const urlPath = p.imageUrl.split('?')[0];
    const lastSegment = urlPath.split('/').pop();
    const ext = lastSegment.includes('.') ? lastSegment.split('.').pop() : 'jpg';
    const safeExt = ['jpg','jpeg','png','tif','tiff'].includes(ext) ? ext : 'jpg';
    const filename = `${safeName(p.id, 40)}_${safeName(p.title, 40)}.${safeExt}`;
    const dest = path.join(outDir, filename);
    process.stdout.write(`  [${dl+skip+fail+1}/${paintings.length}] ${p.title.slice(0,50)} ... `);
    try {
      const r = await downloadFile(p.imageUrl, dest);
      if (r === 'exists') { console.log('⏭'); skip++; }
      else { console.log(`✅ ${(fs.statSync(dest).size/1024/1024).toFixed(1)}MB`); dl++; }
    } catch (e) { console.log(`❌ ${e.message}`); fail++; }
    await sleep(DELAY_MS);
  }

  fs.writeFileSync(path.join(OUT_DIR, 'smithsonian', 'metadata.json'), JSON.stringify(paintings, null, 2));
  console.log(`\n  Downloaded:${dl} Skipped:${skip} Failed:${fail}`);
  return paintings;
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log('🎨 Multi-Museum Chinese Figure Painting Scraper');
  console.log('   Cleveland Museum of Art + Smithsonian Freer/Sackler\n');

  const cleveland = await scrapeCleveland();
  const smithsonian = await scrapeSmithsonian();

  // Merge with any existing metadata from previous runs (don't overwrite)
  const allMetaPath = path.join(OUT_DIR, 'all-metadata.json');
  let existing = [];
  if (fs.existsSync(allMetaPath)) {
    try { existing = JSON.parse(fs.readFileSync(allMetaPath, 'utf8')); } catch {}
  }
  const all = [...cleveland, ...smithsonian];
  const existingIds = new Set(existing.map(p => `${p.source}:${p.id}`));
  const newEntries = all.filter(p => !existingIds.has(`${p.source}:${p.id}`));
  const merged = [...existing, ...newEntries];
  fs.writeFileSync(allMetaPath, JSON.stringify(merged, null, 2));

  console.log('\n' + '═'.repeat(50));
  console.log(`✅ Total paintings in all-metadata.json: ${merged.length}`);
  console.log(`   This run — Cleveland:    ${cleveland.length}`);
  console.log(`   This run — Smithsonian:  ${smithsonian.length}`);
  console.log(`   Previously saved:        ${existing.length}`);
  console.log(`\n📁 Images: ${OUT_DIR}/cleveland/images/`);
  console.log(`           ${OUT_DIR}/smithsonian/images/`);
  console.log(`📄 All metadata: ${OUT_DIR}/all-metadata.json`);
  console.log(`\nNext: run scripts/calibrate-auto.mjs to detect face bounding boxes`);
}

main().catch(console.error);
