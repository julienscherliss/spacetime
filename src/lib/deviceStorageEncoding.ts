import LZString from 'lz-string';

const PREFIX = 'spacetime-lz-utf16:v1:';
const COMPRESS_AFTER = 128 * 1024;

/** Lossless synchronous encoding keeps large account caches within device quota. */
export function encodeDeviceStorage(raw: string): string {
  if (raw.length < COMPRESS_AFTER) return raw;
  const encoded = `${PREFIX}${raw.length}:${LZString.compressToUTF16(raw)}`;
  if (encoded.length >= raw.length) return raw;
  if (decodeDeviceStorage(encoded) !== raw) throw new Error('Device cache encoding failed.');
  return encoded;
}

export function decodeDeviceStorage(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored;
  const separator = stored.indexOf(':', PREFIX.length);
  const length = stored.slice(PREFIX.length, separator);
  if (separator < 0 || !/^[1-9][0-9]*$/.test(length)) throw new Error('Invalid device cache encoding.');
  const expected = Number(length);
  if (!Number.isSafeInteger(expected) || expected > 32 * 1024 * 1024) throw new Error('Invalid device cache size.');
  const raw = LZString.decompressFromUTF16(stored.slice(separator + 1));
  if (raw === null || raw.length !== expected) throw new Error('Incomplete device cache.');
  return raw;
}
