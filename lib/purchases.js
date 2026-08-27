// lib/purchases.js
// Thin wrapper around @revenuecat/purchases-capacitor.
//
// Scope of this file: SDK configuration, reading the CREDITS virtual
// currency balance, and triggering a purchase. That's it.
//
// IMPORTANT — this file does NOT deduct credits. Balance here is
// read-only from the client's point of view; RevenueCat itself credits
// the balance automatically on purchase (via the product <-> virtual
// currency link configured in the RevenueCat dashboard), and spending
// must happen server-side via a POST /virtual_currencies/transactions
// call using the secret key, right before a generation runs. A
// client-only check is just UX (avoid showing "generate" as available
// when it obviously isn't) — never the real security boundary, since
// anyone could tamper with client state.
//
// NOTE ON THE DYNAMIC IMPORT BELOW: this page (pages/RuHua.jsx) gets
// server-side rendered by Next.js at build time ("Collecting page data").
// @revenuecat/purchases-capacitor is a browser/native-only SDK — a static
// top-level `import` here pulls its whole module graph into that SSR
// trace, and the package's internal export structure isn't built to
// survive Node's module resolution in that context, breaking the build
// with a "Cannot find module .../dist/esm/definitions" error. Lazy-
// loading it via dynamic import(), only when these functions actually
// run (client-side, inside useEffect/click handlers), avoids that.
//
// A SECOND, subtler gotcha lives here too, worth documenting since it
// already caused a real bug once: Capacitor plugin objects (like the
// `Purchases` export) are JavaScript Proxies where accessing ANY
// property — including `.then` — returns a callable that tries to
// invoke a matching native method. If that Proxy object is ever
// `return`ed from an async function (or otherwise passed through
// Promise resolution), JS's spec-mandated "is this thenable?" check
// sees a callable `.then` and calls it, which the native bridge
// interprets as "call the real method named `then`" — which doesn't
// exist, producing an "is not implemented" error. This bit us with the
// original getPurchases() helper below (fixed — see ensureModuleLoaded).
// RULE: never let the Purchases object itself be the resolved value of
// a Promise; only ever await the *results of calling methods on it*.

const REVENUECAT_API_KEY = process.env.NEXT_PUBLIC_REVENUECAT_API_KEY;
const CREDITS_CURRENCY_CODE = 'CREDITS';

// Keep this in sync with the products created in App Store Connect /
// linked in the RevenueCat dashboard. credits value here is only used as
// a display fallback if RevenueCat's product metadata hasn't loaded yet.
export const CREDIT_PRODUCTS = [
  { id: 'com.ruhua.app.credits.5',  credits: 5  },
  { id: 'com.ruhua.app.credits.20', credits: 20 },
  { id: 'com.ruhua.app.credits.60', credits: 60 },
];

let configured = false;
// Cache the whole MODULE (a plain ES namespace object, not a Proxy) --
// safe to await/assign. We access `.Purchases` synchronously off of it
// at each call site, so the Proxy itself never passes through `await`
// or a `return` statement.
let purchasesModule = null;

async function ensureModuleLoaded() {
  if (!purchasesModule) {
    purchasesModule = await import('@revenuecat/purchases-capacitor');
  }
  // Deliberately returns nothing -- callers just `await` this for the
  // side effect of purchasesModule being populated, then access
  // purchasesModule.Purchases synchronously afterward.
}

export function isPurchasesConfigured() {
  return configured;
}

export async function configurePurchases() {
  if (configured) return true;
  if (typeof window === 'undefined') return false;
  if (!REVENUECAT_API_KEY) {
    console.warn('[purchases] NEXT_PUBLIC_REVENUECAT_API_KEY not set — purchases disabled');
    return false;
  }
  try {
    await ensureModuleLoaded();
    await purchasesModule.Purchases.configure({ apiKey: REVENUECAT_API_KEY });
    configured = true;
    return true;
  } catch (e) {
    console.warn('[purchases] configure() failed:', e);
    return false;
  }
}

// Returns the current CREDITS balance, or 0 if unavailable (not configured,
// offline, brand-new user, etc.) — callers should treat 0 as "unknown or
// none," not necessarily "confirmed zero."
export async function getCreditsBalance() {
  if (!configured) return 0;
  try {
    await ensureModuleLoaded();
    const { virtualCurrencies } = await purchasesModule.Purchases.getVirtualCurrencies();
    // CONFIRMED from real device logs: the native bridge returns
    // { all: { CREDITS: { balance, ... } } } — there's an "all" wrapper
    // the npm type signature doesn't make obvious. Reading
    // virtualCurrencies[CODE] directly (no .all) was always undefined,
    // silently falling back to 0 via ?? 0 below — this was the actual
    // root cause of the balance always showing 0, independent of the
    // caching/identity/credential issues chased earlier (those were all
    // real, valid things to rule out, just not this bug). Falling back
    // to the flatter shape too in case this ever changes.
    return virtualCurrencies?.all?.[CREDITS_CURRENCY_CODE]?.balance
      ?? virtualCurrencies?.[CREDITS_CURRENCY_CODE]?.balance
      ?? 0;
  } catch (e) {
    console.warn('[purchases] getCreditsBalance failed:', e);
    return 0;
  }
}

// Fetches real product info (localized price, display name) from
// StoreKit via RevenueCat, merged with our known credit amounts. Falls
// back to CREDIT_PRODUCTS (no price) if the fetch fails, so the paywall
// can still render something rather than nothing.
export async function getCreditProducts() {
  if (!configured) return CREDIT_PRODUCTS;
  try {
    await ensureModuleLoaded();
    const productIds = CREDIT_PRODUCTS.map(p => p.id);
    const { products } = await purchasesModule.Purchases.getProducts({ productIdentifiers: productIds });
    return CREDIT_PRODUCTS.map(cp => {
      const match = products.find(p => p.identifier === cp.id);
      return match ? { ...cp, ...match } : cp;
    });
  } catch (e) {
    console.warn('[purchases] getCreditProducts failed:', e);
    return CREDIT_PRODUCTS;
  }
}

// product must be a full product object as returned by getCreditProducts()
// / the underlying SDK — not just an id string.
export async function purchaseCredits(product) {
  await ensureModuleLoaded();
  const result = await purchasesModule.Purchases.purchaseStoreProduct({ product });
  // Balance updates on RevenueCat's side happen automatically, but the
  // SDK's local cache doesn't know that yet — invalidate so the next
  // getCreditsBalance() call reflects the purchase instead of stale data.
  await purchasesModule.Purchases.invalidateVirtualCurrenciesCache();
  return result;
}

export async function restorePurchases() {
  await ensureModuleLoaded();
  const result = await purchasesModule.Purchases.restorePurchases();
  await purchasesModule.Purchases.invalidateVirtualCurrenciesCache();
  return result;
}

// Exposed separately from purchase/restore so callers (e.g. app launch)
// can force a fresh balance read without needing a purchase/restore event
// to trigger it. Useful defensively: if a purchase completed during an
// earlier broken session (before some now-fixed bug), the internal
// invalidate call at the end of purchaseCredits()/restorePurchases() may
// never have actually run for that transaction, leaving the device's
// local SDK cache stuck on a stale value indefinitely since nothing else
// proactively refreshes it.
export async function invalidateCreditsCache() {
  if (!configured) return;
  try {
    await ensureModuleLoaded();
    await purchasesModule.Purchases.invalidateVirtualCurrenciesCache();
  } catch (e) {
    console.warn('[purchases] invalidateCreditsCache failed:', e);
  }
}

// Needed server-side to identify which RevenueCat customer to deduct
// credits from (see pages/api/composite.js). Since Purchases.configure()
// is called without an explicit appUserID, this is RevenueCat's
// auto-generated anonymous ID for this device/install.
export async function getAppUserID() {
  if (!configured) return null;
  try {
    await ensureModuleLoaded();
    const { appUserID } = await purchasesModule.Purchases.getAppUserID();
    return appUserID;
  } catch (e) {
    console.warn('[purchases] getAppUserID failed:', e);
    return null;
  }
}
