import LZString from 'lz-string';
import { zlibSync, unzlibSync } from 'fflate';

const LEGACY_PREFIX = 'spacetime-lz-utf16:v1:';
const PREFIX = 'spacetime-zlib-utf16:v1:';
const COMPRESS_AFTER = 128 * 1024;
const MAX_CHARS = 32 * 1024 * 1024;

// Preserve exact JavaScript code units, including lone surrogates.
function bytesOf(raw: string) {
  const bytes = new Uint8Array(raw.length * 2);
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    bytes[i * 2] = code; bytes[i * 2 + 1] = code >>> 8;
  }
  return bytes;
}

function stringOf(bytes: Uint8Array) {
  const parts: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 16384) {
    const codes: number[] = [];
    for (let i = offset; i < Math.min(offset + 16384, bytes.length); i += 2) {
      codes.push(bytes[i] | (bytes[i + 1] << 8));
    }
    parts.push(String.fromCharCode(...codes));
  }
  return parts.join('');
}

// fflate's inflater does not verify the zlib trailer; check it ourselves.
function adler32(bytes: Uint8Array) {
  let a = 1, b = 0;
  for (let i = 0; i < bytes.length;) {
    const end = Math.min(i + 2655, bytes.length);
    for (; i < end; i++) { a += bytes[i]; b += a; }
    a %= 65521; b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** Lossless synchronous encoding keeps large account caches within device quota. */
export function encodeDeviceStorage(raw: string): string {
  if (raw.length < COMPRESS_AFTER) return raw;
  if (raw.length > MAX_CHARS) throw new Error('Invalid device cache size.');
  const compressed = zlibSync(bytesOf(raw), { level: 1 });
  let binary = '';
  for (let i = 0; i < compressed.length; i += 16384) {
    binary += String.fromCharCode(...compressed.subarray(i, i + 16384));
  }
  const encoded = `${PREFIX}${raw.length}:${btoa(binary)}`;
  if (encoded.length >= raw.length) return raw;
  if (decodeDeviceStorage(encoded) !== raw) throw new Error('Device cache encoding failed.');
  return encoded;
}

export function decodeDeviceStorage(stored: string): string {
  const prefix = stored.startsWith(PREFIX) ? PREFIX : stored.startsWith(LEGACY_PREFIX) ? LEGACY_PREFIX : null;
  if (!prefix) return stored;
  const separator = stored.indexOf(':', prefix.length);
  const length = stored.slice(prefix.length, separator);
  if (separator < 0 || !/^[1-9][0-9]*$/.test(length)) throw new Error('Invalid device cache encoding.');
  const expected = Number(length);
  if (!Number.isSafeInteger(expected) || expected > MAX_CHARS) throw new Error('Invalid device cache size.');
  if (prefix === PREFIX) {
    const payload = stored.slice(separator + 1);
    if (payload.length > MAX_CHARS * 4 || payload.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(payload)) throw new Error('Invalid device cache encoding.');
    const binary = atob(payload);
    if (btoa(binary) !== payload) throw new Error('Invalid device cache encoding.');
    const compressed = Uint8Array.from(binary, char => char.charCodeAt(0));
    if (compressed.length < 6) throw new Error('Incomplete device cache.');
    // One extra byte detects oversized output; allocation stays bounded.
    const bytes = unzlibSync(compressed, { out: new Uint8Array(expected * 2 + 1) });
    const checksum = new DataView(compressed.buffer).getUint32(compressed.length - 4);
    if (bytes.length !== expected * 2 || adler32(bytes) !== checksum) throw new Error('Incomplete device cache.');
    return stringOf(bytes);
  }
  const raw = LZString.decompressFromUTF16(stored.slice(separator + 1));
  if (raw === null || raw.length !== expected) throw new Error('Incomplete device cache.');
  return raw;
}
