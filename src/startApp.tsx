import { createRoot } from 'react-dom/client';
import App from './App';
import { applyNativeFixes, applyElectronChrome } from './utils/nativePlatform';
import { initColorScheme } from './store/colorSchemeStore';
import { DeviceRecoveryBoundary } from './DeviceRecoveryBoundary';

export function startApp() {
  applyNativeFixes();
  applyElectronChrome();
  initColorScheme();
  createRoot(document.getElementById('root')!).render(<DeviceRecoveryBoundary><App /></DeviceRecoveryBoundary>);
}
