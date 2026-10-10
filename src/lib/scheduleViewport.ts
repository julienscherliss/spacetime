/** The visible timeline starts below the complete pinned mobile header. */
export function getScheduleTopOffset(desktopFallback = 84): number {
  if (window.innerWidth >= 640) return desktopFallback;
  const header = document.querySelector<HTMLElement>('[data-schedule-header]');
  if (!header) return 36;
  const pinnedTop = Number.parseFloat(getComputedStyle(header).top) || 0;
  return pinnedTop + header.getBoundingClientRect().height;
}

export function getScheduleViewportHeight(topOffset: number): number {
  return Math.max(1, window.innerHeight - topOffset - (window.innerWidth < 640 ? 64 : 0));
}
