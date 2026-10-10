import { afterEach, expect, it, vi } from 'vitest';
import { getScheduleTopOffset, getScheduleViewportHeight } from '@/lib/scheduleViewport';
afterEach(() => { document.body.innerHTML=''; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('frames mobile tasks below the full header and above the bottom navigation', () => {
  vi.stubGlobal('innerWidth',390); vi.stubGlobal('innerHeight',844);
  const header=document.createElement('div');header.dataset.scheduleHeader='';header.style.top='47px';document.body.append(header);
  vi.spyOn(header,'getBoundingClientRect').mockReturnValue({height:220} as DOMRect);
  expect(getScheduleTopOffset()).toBe(267);
  expect(getScheduleViewportHeight(getScheduleTopOffset())).toBe(513);
});
it('preserves desktop offsets and supports views without a schedule header', () => {
  vi.stubGlobal('innerWidth',1280);vi.stubGlobal('innerHeight',900);
  expect(getScheduleTopOffset()).toBe(84);
  expect(getScheduleTopOffset(96)).toBe(96);
  expect(getScheduleViewportHeight(84)).toBe(816);
  vi.stubGlobal('innerWidth',390);
  expect(getScheduleTopOffset()).toBe(36);
});
