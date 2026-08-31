// pages/api/migrate-credits.js
// Manually moves a CREDITS balance from an old RevenueCat App User ID to a
// new one, working around a real, documented limitation: RevenueCat's
// Virtual Currency balances are NOT transferable via their own restore
// mechanism when using anonymous App User IDs (confirmed directly from
// RevenueCat's own staff on their community forum -- "we do not save the
// Apple ID when a purchase is made... the virtual currency balance is
// lost... I can't provide a workaround right now"). Entitlements transfer
// automatically on restore; Virtual Currencies structurally do not.
//
// Called from the client when a fresh launch detects the App User ID
// changed from what Keychain remembered on this device (see
// lib/deviceStorage.js) -- the signal that a same-device reinstall just
// happened and the old balance is about to become permanently orphaned.
//
// Uses the same GET .../virtual_currencies (read) and POST
// .../virtual_currencies/transactions (write) endpoints already verified
// and used elsewhere in this app (pages/api/generate.js's
// hasEnoughCredits, pages/api/composite.js's deductCredit).
const RC_SECRET_KEY = process.env.RC_SECRET_KEY;
const RC_PROJECT_ID = process.env.RC_PROJECT_ID;
const CREDITS_CURRENCY_CODE = 'CREDITS';

async function getBalance(appUserID) {
  const url = `https://api.revenuecat.com/v2/projects/${RC_PROJECT_ID}/customers/${encodeURIComponent(appUserID)}/virtual_currencies?include_empty_balances=true`;
  const r = await fetch(url, {
    headers: { 'Authorization': `Bearer ${RC_SECRET_KEY}` },
  });
  if (!r.ok) return null;
  const data = await r.json();
  const entry = (data.items || []).find(i => i.currency_code === CREDITS_CURRENCY_CODE);
  return entry?.balance ?? 0;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Confirmed real failure mode via production logs: granting to a brand
// new anonymous App User ID can 404 with "Customer could not be found"
// (RevenueCat error type resource_missing) if the server hasn't finished
// registering that customer yet. The client now waits for a successful
// balance read before calling this endpoint at all (see pages/RuHua.jsx),
// which should mean the customer already exists by the time we get here
// -- this retry is defense-in-depth for any residual propagation delay
// beyond that, not the primary fix.
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
      console.warn(`[migrate-credits] customer not found yet (attempt ${attempt}/${maxAttempts}), retrying...`);
      await sleep(attempt * 500); // 500ms, then 1000ms
      continue;
    }
    return { ok: false, status: r.status, body };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { oldAppUserID, newAppUserID } = req.body;

  if (!RC_SECRET_KEY || !RC_PROJECT_ID) {
    console.warn('[migrate-credits] RC_SECRET_KEY/RC_PROJECT_ID not set -- skipping');
    return res.status(200).json({ ok: true, skipped: true });
  }
  if (!oldAppUserID || !newAppUserID || oldAppUserID === newAppUserID) {
    return res.status(400).json({ error: 'oldAppUserID and newAppUserID (distinct) are required' });
  }

  try {
    const oldBalance = await getBalance(oldAppUserID);
    if (!oldBalance || oldBalance <= 0) {
      // Nothing to migrate -- not an error, just means the old ID had no
      // remaining balance (already spent, or never had any).
      return res.status(200).json({ ok: true, migrated: 0 });
    }

    // Deterministic idempotency key covering BOTH IDs, so retrying this
    // exact migration (same old->new pair) can never double-grant, same
    // reasoning as the free-credits grant's per-customer key.
    const idempotencyKey = `migrate-credits-${oldAppUserID}-${newAppUserID}`;
    const grantResult = await grantWithRetry(newAppUserID, oldBalance, idempotencyKey);
    if (!grantResult.ok) {
      console.warn(`[migrate-credits] grant to new ID failed: ${grantResult.status} ${grantResult.body}`);
      return res.status(502).json({ error: 'migration_failed', status: grantResult.status });
    }

    // Zero out the old ID's balance so it can't later be independently
    // claimed too (e.g. if this migration somehow ran more than once with
    // a stale oldAppUserID reference). Best-effort -- if this specific
    // step fails, the migration to the new ID has already succeeded, so
    // we still report success; the old ID being left with a residual
    // balance it can never actually reach again (nothing points to it
    // anymore) is a cleanliness issue, not a correctness one.
    try {
      const zeroKey = `migrate-credits-zero-${oldAppUserID}-${newAppUserID}`;
      const zeroUrl = `https://api.revenuecat.com/v2/projects/${RC_PROJECT_ID}/customers/${encodeURIComponent(oldAppUserID)}/virtual_currencies/transactions`;
      await fetch(zeroUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RC_SECRET_KEY}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': zeroKey,
        },
        body: JSON.stringify({
          adjustments: { CREDITS: -oldBalance },
        }),
      });
    } catch (e) {
      console.warn('[migrate-credits] zeroing old balance failed (non-fatal):', e);
    }

    return res.status(200).json({ ok: true, migrated: oldBalance });
  } catch (e) {
    console.error('[migrate-credits] request failed:', e);
    return res.status(500).json({ error: e.message });
  }
}
