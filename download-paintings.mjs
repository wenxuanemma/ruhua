// download-paintings.mjs
// Downloads painting thumbnails for local composite testing.
// Usage: node download-paintings.mjs

import fs from 'fs';
import https from 'https';
import path from 'path';

const PAINTINGS = [
  {
    id: 'hanxizai',
    url: 'https://upload.wikimedia.org/wikipedia/commons/e/e5/Gu_Hongzhong%27s_Night_Revels%2C_first_scene.jpg',
  },
  {
    id: 'qingming',
    url: 'https://upload.wikimedia.org/wikipedia/commons/8/8c/Along_the_River_During_the_Qingming_Festival_%28detail%29.jpg',
  },
  {
    id: 'bunianta',
    url: 'https://upload.wikimedia.org/wikipedia/commons/3/37/Buniatu.jpg',
  },
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    function get(url) {
      https.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 ruhua-test/1.0 (https://ruhua.vercel.app)',
        }
      }, res => {
        // Follow redirects
        if (res.statusCode === 301 || res.statusCode === 302) {
          return get(res.headers.location);
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
      }).on('error', reject);
    }
    get(url);
  });
}

for (const p of PAINTINGS) {
  const dest = `${p.id}.jpg`;
  process.stdout.write(`Downloading ${p.id}... `);
  try {
    await download(p.url, dest);
    const size = fs.statSync(dest).size;
    console.log(`✓ ${dest} (${Math.round(size/1024)}KB)`);
  } catch (err) {
    console.log(`✗ ${err.message}`);
  }
}

console.log('\nDone. Now run:');
console.log('  node test-composite.mjs ../IMG_2545.JPG hanxizai.jpg hanxizai host');
