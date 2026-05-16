import { isElectron } from '@/utils/nativePlatform';

/**
 * Invisible drag region for Electron frameless windows.
 * Renders a fixed transparent bar at the top center of the viewport
 * (clearing macOS traffic lights) so the window can be dragged naturally.
 */
export function ElectronDragRegion() {
  if (!isElectron()) return null;

  return (
    <div
      className="electron-drag-region"
      aria-hidden="true"
    />
  );
}
