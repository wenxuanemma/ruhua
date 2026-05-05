// scrape-npm.mjs
// Scrapes Chinese figure paintings from Taiwan National Palace Museum (國立故宮博物院)
// Uses NPM's collection search API — no key needed, CC BY 4.0 license.
//
// Usage: node scripts/scrape-npm.mjs
// License: CC BY 4.0 — attribute "National Palace Museum, Taiwan"

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

const DELAY_MS = 800;
const OUT_DIR = './npm-paintings';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RuHua-Research/1.0)',
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://digitalarchive.npm.gov.tw/',
      }
    }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        fetchJson(res.headers.location).then(resolve).catch(reject); return;
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON error for ${url.slice(0, 80)}: ${data.slice(0, 50)}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(dest) && fs.statSync(dest).size > 5000) { resolve('exists'); return; }
    const client = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest);
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RuHua-Research/1.0)',
        'Referer': 'https://digitalarchive.npm.gov.tw/',
      }
    }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close(); if (fs.existsSync(dest)) fs.unlinkSync(dest);
        downloadFile(res.headers.location, dest).then(resolve).catch(reject); return;
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

// Figure painting keywords in Chinese and English
const FIGURE_KEYWORDS = ['仕女', '人物', '宮廷', '士女', '仙人', '帝王', '列女',
  'figure', 'court ladies', 'palace', 'portrait', 'ladies'];

const ERA_KEYWORDS = ['唐', '五代', '宋', '遼', '金', '元',
  'tang', 'five dynasties', 'song', 'liao', 'jin', 'yuan'];

async function searchNPM(keyword, page = 1) {
  // NPM Digital Archive search endpoint
  const url = `https://digitalarchive.npm.gov.tw/Painting/Query?` +
    `QueryType=key&Keyword=${encodeURIComponent(keyword)}&Lang=en&` +
    `PageSize=50&Page=${page}&Dep=P`;
  try {
    return await fetchJson(url);
  } catch (e) {
    // Try alternative endpoint
    const url2 = `https://digitalarchive.npm.gov.tw/api/Painting/Search?` +
      `keyword=${encodeURIComponent(keyword)}&page=${page}&pageSize=50&lang=en`;
    try { return await fetchJson(url2); } catch { return null; }
  }
}

async function getImageUrl(pid, imageName) {
  // NPM IIIF image URL — medium resolution (CC BY 4.0)
  // Format: /iiif/{imageName}/full/2000,/0/default.jpg
  if (imageName) {
    const encoded = encodeURIComponent(imageName);
    return `https://digitalarchive.npm.gov.tw/iiif/${encoded}/full/2000,/0/default.jpg`;
  }
  // Fallback: try to get image info from detail page
  try {
    const info = await fetchJson(
      `https://digitalarchive.npm.gov.tw/Painting/Content?pid=${pid}&Dept=P&lang=en`
    );
    const imgName = info?.ImageName || info?.imageName;
    if (imgName) {
      return `https://digitalarchive.npm.gov.tw/iiif/${encodeURIComponent(imgName)}/full/2000,/0/default.jpg`;
    }
  } catch {}
  return null;
}

async function main() {
  fs.mkdirSync(path.join(OUT_DIR, 'images'), { recursive: true });

  console.log('🎨 Taiwan National Palace Museum Scraper');
  console.log('   國立故宮博物院 — No API key needed, CC BY 4.0\n');

  const allItems = new Map();

  // Search with figure painting keywords
  for (const kw of FIGURE_KEYWORDS) {
    process.stdout.write(`  Searching "${kw}" ... `);
    try {
      const data = await searchNPM(kw);
      if (!data) { console.log('❌ no response'); await sleep(DELAY_MS); continue; }

      // Handle different response shapes
      const items = data.Items || data.items || data.results ||
        data.data || data.Result || [];

      let added = 0;
      for (const item of items) {
        const pid = item.PID || item.pid || item.Id || item.id;
        if (pid && !allItems.has(String(pid))) {
          allItems.set(String(pid), item);
          added++;
        }
      }
      const total = data.TotalCount || data.total || data.Total || items.length;
      console.log(`${items.length} results (total: ${total}, +${added} new)`);
    } catch (e) {
      console.log(`❌ ${e.message}`);
    }
    await sleep(DELAY_MS);
  }

  if (allItems.size === 0) {
    console.log('\n⚠️  No results from search API.');
    console.log('The NPM Digital Archive may have changed their API structure.');
    console.log('\nManual alternative:');
    console.log('1. Browse https://digitalarchive.npm.gov.tw');
    console.log('2. Search for 仕女 (court ladies) or 人物 (figure)');
    console.log('3. Download images directly from the browser');
    console.log('4. Place them in ./npm-paintings/images/');
    console.log('5. Create metadata.json manually with title, dynasty fields');
    return;
  }

  console.log(`\n  📋 ${allItems.size} unique objects found\n`);

  // Filter for figure paintings in right era
  const paintings = [];
  for (const [pid, item] of allItems) {
    const text = JSON.stringify(item).toLowerCase();
    const hasEra = ERA_KEYWORDS.some(k => text.includes(k.toLowerCase()));
    if (hasEra) {
      paintings.push({
        source: 'npm',
        id: pid,
        title: item.Title || item.title || item.ArticleSubject || 'Unknown',
        dynasty: item.Dynasty || item.dynasty || item.Slogan || '',
        imageName: item.ImageName || item.imageName || null,
        detailUrl: `https://digitalarchive.npm.gov.tw/Painting/Content?pid=${pid}`,
      });
    }
  }

  console.log(`  ✅ ${paintings.length} figure paintings in target era\n`);

  // Download
  const successful = [];
  let dl = 0, skip = 0, fail = 0;

  for (const p of paintings) {
    const dest = path.join(OUT_DIR, 'images', `${safeName(p.id, 20)}_${safeName(p.title)}.jpg`);
    process.stdout.write(`  [${dl+skip+fail+1}/${paintings.length}] ${p.title.slice(0,45).padEnd(45)} ... `);

    const imgUrl = await getImageUrl(p.id, p.imageName);
    if (!imgUrl) { console.log('❌ no image URL'); fail++; continue; }

    try {
      const r = await downloadFile(imgUrl, dest);
      if (r === 'exists') {
        console.log(`⏭  (${(fs.statSync(dest).size/1024/1024).toFixed(1)}MB)`);
        skip++;
      } else {
        const size = fs.statSync(dest).size;
        if (size < 10000) {
          fs.unlinkSync(dest);
          console.log('❌ too small (404?)');
          fail++; continue;
        }
        console.log(`✅ (${(size/1024/1024).toFixed(1)}MB)`);
        dl++;
      }
      successful.push({ ...p, imageUrl: imgUrl, localFile: dest });
    } catch (e) {
      console.log(`❌ ${e.message}`);
      fail++;
    }
    await sleep(DELAY_MS);
  }

  fs.writeFileSync(path.join(OUT_DIR, 'metadata.json'), JSON.stringify(successful, null, 2));

  console.log('\n' + '═'.repeat(50));
  console.log(`✅ Downloaded: ${dl}`);
  console.log(`⏭  Skipped:   ${skip}`);
  console.log(`❌ Failed:     ${fail}`);
  console.log(`\n📁 Images: ${OUT_DIR}/images/`);
  console.log(`📄 Metadata: ${OUT_DIR}/metadata.json`);
}

main().catch(console.error);
