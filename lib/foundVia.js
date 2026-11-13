// lib/foundVia.js
// One optional "How did you find RuHua?" question, asked once, a moment
// after the user's first successful portrait (never after an error). App
// Store Connect campaign links show "not enough data" at RuHua's volume and
// YouTube Shorts links aren't clickable, so asking is the only way to learn
// which channel brought someone in.
//
// The answer goes to RevenueCat (lib/purchases.js setFoundViaAttribute), on
// the app's anonymous purchase ID. Not Vercel Web Analytics: custom events
// need Vercel Pro, and the project is on Hobby.
//
// Native iOS only: on the website there is no RevenueCat customer to attach
// the answer to, so the question never shows there. For testing on the web,
// localStorage.setItem('ruhua_debug','true') shows it anyway and only logs.
//
// Kept apart from the App Store rating prompt (lib/reviewPrompt.js, 2nd
// success): if the rating prompt could fire on this success, we wait for a
// later one instead.

import { mayPromptReviewOn } from './reviewPrompt';
import { setFoundViaAttribute } from './purchases';

const ASKED_KEY = 'ruhua_found_via_asked_v1';

// Fixed values stored in RevenueCat. Order = button order. en is shown
// under zh only when the two differ.
export const FOUND_VIA_OPTIONS = [
  { source: 'youtube',          zh: 'YouTube',    en: 'YouTube' },
  { source: 'tiktok',           zh: 'TikTok',     en: 'TikTok' },
  { source: 'instagram',        zh: 'Instagram',  en: 'Instagram' },
  { source: 'x',                zh: 'X',          en: 'X (Twitter)' },
  { source: 'app_store_search', zh: 'App Store 搜索', en: 'App Store search' },
  { source: 'chatgpt_ai',       zh: 'ChatGPT / AI', en: 'ChatGPT / AI' },
  { source: 'product_hunt',     zh: 'Product Hunt', en: 'Product Hunt' },
  { source: 'friend',           zh: '朋友推荐',     en: 'A friend' },
  { source: 'other',            zh: '其他',         en: 'Other' },
];

function isDebug() {
  try { return localStorage.getItem('ruhua_debug') === 'true'; } catch { return false; }
}

function alreadyAsked() {
  try { return localStorage.getItem(ASKED_KEY) !== null; } catch { return true; }
}

// successNumber: which successful portrait this is (1 = first). Call
// BEFORE recordSuccessAndMaybePromptReview() in the same tick.
export async function shouldAskFoundVia(successNumber) {
  if (typeof window === 'undefined') return false;
  if (alreadyAsked()) return false;
  // Must run before any await here (see mayPromptReviewOn).
  const reviewMayFire = mayPromptReviewOn(successNumber);
  if (isDebug()) return true;
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return false;
  } catch {
    return false;
  }
  return !(await reviewMayFire);
}

// Call when the sheet appears, so a reload or crash never asks twice.
export function markFoundViaAsked() {
  try { localStorage.setItem(ASKED_KEY, 'shown'); } catch {}
}

// source: one of FOUND_VIA_OPTIONS[].source, or 'dismissed'.
export async function recordFoundVia(source) {
  try { localStorage.setItem(ASKED_KEY, source); } catch {}
  const ok = await setFoundViaAttribute(source);
  if (isDebug()) console.log('[foundVia] recorded', source, ok ? '(RevenueCat)' : '(RevenueCat not configured, local only)');
}
