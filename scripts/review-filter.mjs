// review-filter.mjs
// Shows results from filter-faces.mjs in a readable format.
// Usage: node scripts/review-filter.mjs

import fs from 'fs';

const RESULT_FILE = './museum-paintings/filtered-metadata.json';

if (!fs.existsSync(RESULT_FILE)) {
  console.log('No filtered-metadata.json found. Run filter-faces.mjs first.');
  process.exit(1);
}

const { passed, rejected } = JSON.parse(fs.readFileSync(RESULT_FILE, 'utf8'));

console.log(`\n${'═'.repeat(60)}`);
console.log(`✅ PASSED (${passed.length} paintings with usable faces)`);
console.log('═'.repeat(60));
passed.forEach((p, i) => {
  const faces = p.faces?.length || 0;
  console.log(`  [${String(i+1).padStart(3)}] ${p.title.slice(0, 55).padEnd(55)} ${faces} face(s)`);
});

console.log(`\n${'═'.repeat(60)}`);
console.log(`❌ REJECTED (${rejected.length} paintings)`);
console.log('═'.repeat(60));
rejected.forEach((p, i) => {
  console.log(`  [${String(i+1).padStart(3)}] ${p.title.slice(0, 55).padEnd(55)} — ${p.rejectReason}`);
});

console.log(`\nTotal processed: ${passed.length + rejected.length}`);
console.log(`Pass rate: ${(passed.length / (passed.length + rejected.length) * 100).toFixed(1)}%`);
