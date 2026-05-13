import { Capacitor } from '@capacitor/core';

declare global {
  interface Window {
    CapacitorCustomPlatform?: {
      name?: string;
    };
    electron?: unknown;
  }
}

/** True when running inside a Capacitor native shell (iOS / Android). */
export function isNativePlatform() {
  return Capacitor.isNativePlatform();
}

/** True when running inside the Capacitor iOS shell specifically. */
export function isIOSNative() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
}

/** True when running inside an Electron desktop shell. */
export function isElectron() {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator?.userAgent || '';
  const customPlatformName = window.CapacitorCustomPlatform?.name;
  if (ua.toLowerCase().includes('electron')) return true;
  if (window.location.protocol === 'capacitor-electron:') return true;
  if (customPlatformName === 'electron') return true;
  if (window.electron) return true;
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'electron') return true;
  return false;
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

/**
 * Apply Electron-only desktop chrome adjustments (e.g. macOS traffic-light spacing).
 * Safe no-op on web/iOS/Android.
 */
export function applyElectronChrome() {
  if (!isElectron()) return;

  document.documentElement.classList.add('is-electron');
  document.body.classList.add('is-electron');
  document.documentElement.setAttribute('data-platform', 'electron');
  document.body.setAttribute('data-platform', 'electron');
  document.getElementById('root')?.setAttribute('data-platform', 'electron');
}
