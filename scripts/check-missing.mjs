#!/usr/bin/env node
// scripts/check-missing.mjs
// Lists all passed paintings whose image file cannot be found on disk.
// Run: node scripts/check-missing.mjs

import fs from 'fs';
import path from 'path';

const FILTERED_META = './museum-paintings/filtered-metadata.json';
const IMG_DIRS = [
  './wikimedia-paintings/images',
  './met-paintings/images',
  './museum-paintings/cleveland/images',
  './museum-paintings/smithsonian/images',
];

function resolveById(id) {
  const sid = String(id);
  for (const dir of IMG_DIRS) {
    if (!fs.existsSync(dir)) continue;
    const match = fs.readdirSync(dir).find(f =>
      f.startsWith(sid + '_') || f.startsWith(sid + '.')
    );
    if (match) return path.join(dir, match);
  }
  return null;
}

const data = JSON.parse(fs.readFileSync(FILTERED_META, 'utf8'));
const passed = data.passed || [];

const missing = [];
const found = [];

for (const p of passed) {
  const resolved = resolveById(p.id) ||
    (p.localFile && fs.existsSync(p.localFile) ? p.localFile : null);

  if (resolved) {
    found.push({ ...p, resolvedFile: resolved });
  } else {
    missing.push(p);
  }
}

console.log(`\n✅ Found:   ${found.length} paintings`);
console.log(`❌ Missing: ${missing.length} paintings\n`);

if (missing.length > 0) {
  console.log('Missing paintings:');
  console.log('─'.repeat(80));
  missing.forEach((p, i) => {
    console.log(`[${String(i+1).padStart(3)}] #${p.id}`);
    console.log(`      Title:     ${p.title}`);
    console.log(`      Source:    ${p.source}`);
    console.log(`      localFile: ${p.localFile || '(none)'}`);
    console.log(`      Search:    ls */images/ | grep "^${p.id}_"`);
    console.log();
  });

  console.log('─'.repeat(80));
  console.log('\nTo check all at once:');
  const ids = missing.map(p => `"^${p.id}_"`).join('|');
  console.log(`ls wikimedia-paintings/images/ met-paintings/images/ | grep -E '${ids}'`);
}
