// Counts answers to the in-app "How did you find RuHua?" question
// (lib/foundVia.js), which are saved as the `found_via` attribute on each
// RevenueCat customer. RevenueCat Charts can't segment by custom attributes,
// so this tallies them through the REST API v2.
//
// Needs a RevenueCat v2 secret key with read access to customer information
// (the same RC_SECRET_KEY / RC_PROJECT_ID the API routes use; copy them from
// Vercel → Settings → Environment Variables):
//
//   RC_SECRET_KEY=sk_... RC_PROJECT_ID=proj... node scripts/count-found-via.mjs
//
// Read-only: lists customers, then reads each one's attributes.

const KEY = process.env.RC_SECRET_KEY;
const PROJECT = process.env.RC_PROJECT_ID;
if (!KEY || !PROJECT) {
  console.error('Set RC_SECRET_KEY and RC_PROJECT_ID.');
  process.exit(1);
}

const BASE = 'https://api.revenuecat.com/v2';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(path) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(path.startsWith('http') ? path : BASE + path, {
      headers: { Authorization: `Bearer ${KEY}` },
    });
    if (res.status === 429 && attempt < 5) {
      const wait = Number(res.headers.get('retry-after')) || 2 ** attempt;
      await sleep(wait * 1000);
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${path}: ${await res.text()}`);
    return res.json();
  }
}

const counts = {};
let customers = 0;
let next = `/projects/${PROJECT}/customers?limit=1000`;
while (next) {
  const page = await get(next.startsWith('/v2') ? next.slice(3) : next);
  for (const c of page.items || []) {
    customers++;
    const attrs = await get(`/projects/${PROJECT}/customers/${encodeURIComponent(c.id)}/attributes`);
    const found = (attrs.items || []).find(a => a.name === 'found_via');
    const key = found?.value || '(not answered)';
    counts[key] = (counts[key] || 0) + 1;
  }
  next = page.next_page || null;
}

console.log(`${customers} customers`);
for (const [source, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.log(`${String(n).padStart(5)}  ${source}`);
}
