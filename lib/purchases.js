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
let PurchasesRef = null;

async function getPurchases() {
  if (!PurchasesRef) {
    const mod = await import('@revenuecat/purchases-capacitor');
    PurchasesRef = mod.Purchases;
  }
  return PurchasesRef;
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
    const Purchases = await getPurchases();
    await Purchases.configure({ apiKey: REVENUECAT_API_KEY });
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
    const Purchases = await getPurchases();
    const { virtualCurrencies } = await Purchases.getVirtualCurrencies();
    return virtualCurrencies?.[CREDITS_CURRENCY_CODE]?.balance ?? 0;
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
    const Purchases = await getPurchases();
    const productIds = CREDIT_PRODUCTS.map(p => p.id);
    const { products } = await Purchases.getProducts({ productIdentifiers: productIds });
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
  const Purchases = await getPurchases();
  const result = await Purchases.purchaseStoreProduct({ product });
  // Balance updates on RevenueCat's side happen automatically, but the
  // SDK's local cache doesn't know that yet — invalidate so the next
  // getCreditsBalance() call reflects the purchase instead of stale data.
  await Purchases.invalidateVirtualCurrenciesCache();
  return result;
}

export async function restorePurchases() {
  const Purchases = await getPurchases();
  const result = await Purchases.restorePurchases();
  await Purchases.invalidateVirtualCurrenciesCache();
  return result;
}

