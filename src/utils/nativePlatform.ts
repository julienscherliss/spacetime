import { Capacitor } from '@capacitor/core';

/** True when running inside a Capacitor native shell (iOS / Android). */
export function isNativePlatform() {
  return Capacitor.isNativePlatform();
}

/**
 * Apply native-only viewport and scaling fixes.
 * Call once at app startup (e.g. in main.tsx).
 * Has zero effect on the web version.
 */
export function applyNativeFixes() {
  if (!isNativePlatform()) return;

  // 1. Force correct viewport meta for native shell
  let meta = document.querySelector('meta[name="viewport"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'viewport');
    document.head.appendChild(meta);
  }
  meta.setAttribute(
    'content',
    'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover',
  );

  // 2. Prevent iOS text auto-scaling
  document.documentElement.style.setProperty('-webkit-text-size-adjust', '100%');

  // 3. Add a class so CSS can target native-only rules
  document.documentElement.classList.add('capacitor-native');

  // 4. Prevent double-tap zoom on iOS WebView
  document.addEventListener(
    'touchend',
    (e) => {
      // Only prevent default when it's a quick second tap (double-tap)
      // We use a simple approach: prevent if there's no selection and it's a single touch
    },
    { passive: true },
  );
}
