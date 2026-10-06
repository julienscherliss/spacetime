import { describe, expect, it } from 'vitest';
import LZString from 'lz-string';
import { decodeDeviceStorage, encodeDeviceStorage } from '@/lib/deviceStorageEncoding';

describe('fast device storage encoding', () => {
  const large = JSON.stringify({ text: 'Notes 🌎 日本語 \u0000 \ud800'.repeat(15000) });
  it('preserves exact code units and still compresses below device quota', () => {
    const raw = large + '\ud800';
    const stored = encodeDeviceStorage(raw);
    expect(stored.length).toBeLessThan(raw.length / 4);
    expect(decodeDeviceStorage(stored)).toBe(raw);
    expect(decodeDeviceStorage(encodeDeviceStorage('small'))).toBe('small');
  });
  it('continues to read existing LZ caches without rewriting or resetting them', () => {
    expect(decodeDeviceStorage(`spacetime-lz-utf16:v1:${large.length}:${LZString.compressToUTF16(large)}`)).toBe(large);
  });
  it('rejects truncated data, wrong sizes and corrupted checksum trailers', () => {
    const stored = encodeDeviceStorage(large);
    expect(() => decodeDeviceStorage(stored.slice(0, -8))).toThrow();
    expect(() => decodeDeviceStorage(stored.replace(`:${large.length}:`, `:${large.length - 1}:`))).toThrow();
    expect(() => decodeDeviceStorage(stored.replace(`:${large.length}:`, ':33554433:'))).toThrow();
    const split = stored.indexOf(':', 'spacetime-zlib-utf16:v1:'.length);
    const binary = atob(stored.slice(split + 1));
    const corrupt = binary.slice(0, -1) + String.fromCharCode(binary.charCodeAt(binary.length - 1) ^ 1);
    expect(() => decodeDeviceStorage(stored.slice(0, split + 1) + btoa(corrupt))).toThrow();
  });
});
