// lib/deviceStorage.js
// Keychain-backed persistence for the free-credits grant flag, so it
// survives app deletion + reinstall on the same device -- localStorage
// and UserDefaults both get wiped on delete, Keychain does not.
//
// Pattern adapted directly from how VetKeeper/WarrantyKeeper solved the
// same problem (UsageTracker.swift there): store a durable flag in the
// Keychain, not in the app's normal sandboxed storage. RuHua's version is
// simpler than that one -- a single one-time boolean, not an incrementing
// per-item counter, since the free grant here is one lump sum, not
// tracked per action.
//
// Uses @aparajita/capacitor-secure-storage, which wraps iOS Keychain /
// Android Keystore. Its own README confirms the iOS behavior this whole
// feature depends on: "iOS will not delete an app's keychain data when
// the app is deleted."
//
// SAME SSR NOTE AS lib/purchases.js: pages/RuHua.jsx gets server-rendered
// by Next.js at build time. This plugin is browser/native-only, so it's
// lazy-loaded via dynamic import(), never a static top-level import --
// a static import here would break the build the same way it did for
// @revenuecat/purchases-capacitor before that was fixed.
//
// HONEST GAP: the exact exported singleton name (assumed SecureStorage
// below, following standard Capacitor plugin convention) was not
// confirmed against the package's actual compiled output the way
// RevenueCat's response shapes eventually were confirmed via real device
// logs -- only the method signatures (get/set) were confirmed from the
// published definitions.ts. Worth a quick console.log of the imported
// module's keys on first real test, in case the actual export name
// differs.
//
// SCOPE, same honesty as pages/api/grant-free-credits.js: this closes the
// "reinstall on the SAME device" gap. It does NOT create any cross-device
// identity -- a different device starts fresh, same as VetKeeper/
// WarrantyKeeper's documented behavior, since Keychain sync to iCloud is
// off by default and deliberately not enabled here.

const FREE_CREDITS_KEY = 'ruhua_free_credits_claimed';

let storageModule = null;

async function ensureModuleLoaded() {
  if (!storageModule) {
    storageModule = await import('@aparajita/capacitor-secure-storage');
  }
}

export async function hasClaimedFreeCredits() {
  if (typeof window === 'undefined') return true; // SSR: pretend already claimed, never grant server-side
  try {
    await ensureModuleLoaded();
    const value = await storageModule.SecureStorage.getItem(FREE_CREDITS_KEY);
    return value === 'true';
  } catch (e) {
    // If Keychain access fails for any reason, fail toward NOT granting
    // repeatedly -- better to occasionally deny a legitimate first-time
    // grant (rare, retried next launch via the same check) than to sit
    // silently broken and never actually gate anything.
    console.warn('[deviceStorage] hasClaimedFreeCredits failed:', e);
    return true;
  }
}

export async function markFreeCreditsClaimed() {
  if (typeof window === 'undefined') return;
  try {
    await ensureModuleLoaded();
    await storageModule.SecureStorage.setItem(FREE_CREDITS_KEY, 'true');
  } catch (e) {
    console.warn('[deviceStorage] markFreeCreditsClaimed failed:', e);
  }
}

// TESTING ONLY -- clears the Keychain flag so the free-credits grant can
// be re-triggered on the next launch, without needing to actually wipe
// the device or find another way around Keychain's reinstall-persistence
// (which is the whole point of using it, so there's no "just delete the
// app" shortcut for this the way there was with the old localStorage
// version). Exposed on window in pages/RuHua.jsx's launch effect --
// call window.__resetFreeCredits() from Safari Web Inspector's console,
// then relaunch the app (or reload) to see the grant fire again.
// Harmless to ship -- does nothing unless explicitly called from the
// console, no UI surface, no effect on real users.
export async function resetFreeCreditsFlag() {
  if (typeof window === 'undefined') return false;
  try {
    await ensureModuleLoaded();
    await storageModule.SecureStorage.removeItem(FREE_CREDITS_KEY);
    return true;
  } catch (e) {
    console.warn('[deviceStorage] resetFreeCreditsFlag failed:', e);
    return false;
  }
}
