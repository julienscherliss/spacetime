import { describe, expect, it } from 'vitest';

import { chooseAuthoritativeThemeState, normalizePersistedThemeState, type PersistedThemeState } from '@/store/colorSchemeStore';

function makeState(overrides: Partial<PersistedThemeState> = {}): PersistedThemeState {
  return {
    activeLightSchemeId: 'cobalt',
    activeDarkSchemeId: 'dark-citrus',
    customSchemes: [],
    lastLocalChangeAt: '',
    ...overrides,
  };
}

describe('color scheme persistence conflict resolution', () => {
  it('prefers newer local changes over stale remote defaults', () => {
    const local = makeState({
      activeLightSchemeId: 'custom-1',
      customSchemes: [
        {
          id: 'custom-1',
          name: 'PASTELS',
          preset: false,
          priorities: {
            0: { stroke: '10 10% 90%', fill: '0 0% 100%' },
            1: { stroke: '200 50% 50%', fill: '0 0% 100%' },
            2: { stroke: '200 50% 50%', fill: '200 50% 50%' },
            3: { stroke: '220 30% 20%', fill: '220 30% 20%' },
          },
          accent: '200 50% 50%',
          lockedFill: '220 30% 20%',
          lockedText: '0 0% 100%',
        },
      ],
      lastLocalChangeAt: '2026-04-22T00:10:00.000Z',
    });

    const remote = makeState({
      lastLocalChangeAt: '2026-04-21T23:38:28.909Z',
    });

    const result = chooseAuthoritativeThemeState(local, remote);

    expect(result.source).toBe('local');
    expect(result.state.activeLightSchemeId).toBe('custom-1');
    expect(result.state.customSchemes).toHaveLength(1);
  });

  it('falls back invalid custom active ids to built-in defaults', () => {
    const normalized = normalizePersistedThemeState(
      makeState({
        activeLightSchemeId: 'missing-custom',
        activeDarkSchemeId: 'also-missing',
      })
    );

    expect(normalized.activeLightSchemeId).toBe('cobalt');
    expect(normalized.activeDarkSchemeId).toBe('dark-citrus');
  });
});