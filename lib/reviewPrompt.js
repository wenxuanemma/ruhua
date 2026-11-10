// lib/reviewPrompt.js
// Native App Store rating prompt (SKStoreReviewController / AppStore.requestReview
// via @capacitor-community/in-app-review).
//
// Rule: ask once, right after the user's 2nd successful portrait (not the
// first, never after an error), at most once per native app version, and only
// inside the iOS shell. Apple further rate-limits the real prompt in
// production (max 3 per 365 days, and the user can turn it off), so calling
// this does not guarantee a dialog appears.
//
// Same SSR note as lib/purchases.js / lib/deviceStorage.js: Capacitor modules
// are only loaded via dynamic import() at call time, never statically.
//
// REMOTE-WEB NOTE: the iOS app loads https://ruhua.vercel.app, so this code
// also runs inside older binaries that were built before the plugin was
// added. isPluginAvailable() keeps those a silent no-op instead of throwing.

const SUCCESS_COUNT_KEY = 'ruhua_success_count_v1';
const PROMPTED_VERSION_KEY = 'ruhua_review_prompted_version_v1';
const PROMPT_ON_SUCCESS_NUMBER = 2;
// Let the result screen render before the system sheet slides up.
const PROMPT_DELAY_MS = 1500;

function readInt(key) {
  try { return parseInt(localStorage.getItem(key) || '0', 10) || 0; } catch { return 0; }
}

// Call once each time a portrait result is successfully shown.
export async function recordSuccessAndMaybePromptReview() {
  if (typeof window === 'undefined') return;
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') return;
    if (!Capacitor.isPluginAvailable('InAppReview') || !Capacitor.isPluginAvailable('App')) return;

    const count = readInt(SUCCESS_COUNT_KEY) + 1;
    try { localStorage.setItem(SUCCESS_COUNT_KEY, String(count)); } catch {}
    if (count < PROMPT_ON_SUCCESS_NUMBER) return;

    const { App } = await import('@capacitor/app');
    // Marketing version (CFBundleShortVersionString), e.g. "1.2" -- a new
    // build number of the same version does not re-ask.
    const { version: appVersion } = await App.getInfo();
    let promptedVersion = null;
    try { promptedVersion = localStorage.getItem(PROMPTED_VERSION_KEY); } catch {}
    if (promptedVersion === appVersion) return;

    // Mark before asking so a crash/reload can't make us ask twice.
    try { localStorage.setItem(PROMPTED_VERSION_KEY, appVersion); } catch {}
    await new Promise((r) => setTimeout(r, PROMPT_DELAY_MS));
    const { InAppReview } = await import('@capacitor-community/in-app-review');
    await InAppReview.requestReview();
  } catch (e) {
    console.warn('[review] prompt skipped:', e);
  }
}
