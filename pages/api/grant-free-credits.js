// pages/api/grant-free-credits.js
// Grants a one-time free credit allowance to a new user, so the very first
// thing someone sees isn't a paywall with nothing to try first.
//
// Uses the same RevenueCat virtual currency transaction endpoint as
// deductCredit() in composite.js, just with a positive adjustment instead
// of negative -- same infrastructure, same auth, same idempotency pattern.
//
// SCOPE OF THE "ONE-TIME" GUARANTEE, honestly stated:
// - The idempotency key here is derived deterministically from appUserID
//   itself, so RevenueCat guarantees this exact customer can never receive
//   this grant twice, no matter how many times this endpoint is called for
//   them (race conditions on rapid app launches, retries, etc.) -- this
//   part is a real, robust guarantee.
// - What this does NOT protect against: RuHua has no accounts or persistent
//   user identity at all (by design, consistent with the rest of the app).
//   RevenueCat's anonymous App User ID is scoped to the device/install, not
//   to an Apple ID or any other durable identity. A user who deletes and
//   reinstalls the app gets a brand new anonymous ID, and would be eligible
//   for a fresh grant. This is a deliberate, low-stakes tradeoff (3 credits
//   x ~$0.04/generation cost is a small exposure, and reinstalling is real
//   friction most users won't bother with) rather than an oversight -- the
//   alternative would require adding real accounts, which is a much bigger
//   change than this feature warrants right now.
const RC_SECRET_KEY = process.env.RC_SECRET_KEY;
const RC_PROJECT_ID = process.env.RC_PROJECT_ID;
const FREE_CREDITS_AMOUNT = 3;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Confirmed real failure mode (via production logs on the near-identical
// migrate-credits.js endpoint): granting to a brand new anonymous App
// User ID can 404 with "Customer could not be found" (RevenueCat error
// type resource_missing) if the server hasn't finished registering that
// customer yet. The client now waits for a successful balance read
// before calling this endpoint at all (see pages/RuHua.jsx's launch
// effect -- this same reordering fix was applied here after being found
// first in the migration code), which should mean the customer already
// exists by the time we get here -- this retry is defense-in-depth for
// any residual propagation delay beyond that, not the primary fix.
async function grantWithRetry(appUserID, amount, idempotencyKey, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const url = `https://api.revenuecat.com/v2/projects/${RC_PROJECT_ID}/customers/${encodeURIComponent(appUserID)}/virtual_currencies/transactions`;
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RC_SECRET_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({ adjustments: { CREDITS: amount } }),
    });
    if (r.ok) return { ok: true };

    const body = await r.text().catch(() => '');
    let isCustomerMissing = false;
    try { isCustomerMissing = JSON.parse(body)?.type === 'resource_missing'; } catch {}

    if (isCustomerMissing && attempt < maxAttempts) {
      console.warn(`[grant-free-credits] customer not found yet (attempt ${attempt}/${maxAttempts}), retrying...`);
      await sleep(attempt * 500); // 500ms, then 1000ms
      continue;
    }
    return { ok: false, status: r.status, body };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { appUserID } = req.body;

  if (!RC_SECRET_KEY || !RC_PROJECT_ID) {
    console.warn('[grant-free-credits] RC_SECRET_KEY/RC_PROJECT_ID not set -- skipping');
    return res.status(200).json({ ok: true, skipped: true });
  }
  if (!appUserID) {
    return res.status(400).json({ error: 'appUserID required' });
  }

  try {
    // Deterministic per-customer key -- guarantees this specific appUserID
    // can only ever receive this particular grant once, regardless of how
    // many times this endpoint gets hit for them.
    const idempotencyKey = `free-credits-grant-${appUserID}`;
    const result = await grantWithRetry(appUserID, FREE_CREDITS_AMOUNT, idempotencyKey);
    if (!result.ok) {
      console.warn(`[grant-free-credits] RevenueCat rejected grant for ${appUserID}: ${result.status} ${result.body}`);
      return res.status(502).json({ error: 'grant_failed', status: result.status });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[grant-free-credits] request failed:', e);
    return res.status(500).json({ error: e.message });
  }
}
