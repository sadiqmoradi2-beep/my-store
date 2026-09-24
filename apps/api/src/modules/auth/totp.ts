/** TOTP (RFC 6238) with HMAC-SHA1 — no external dependency */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PERIOD_SECONDS = 30;
const DIGITS = 6;

export function generateTotpSecret(): string {
  const bytes = randomBytes(20);
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(secret: string): Buffer {
  const clean = secret.toUpperCase().replace(/=+$/, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function hotp(secret: string, counter: number): string {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', base32Decode(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  return String(code % 10 ** DIGITS).padStart(DIGITS, '0');
}

/** Accept the code for the current window and ±1 for clock drift */
export function verifyTotp(secret: string, code: string, now = Date.now()): boolean {
  const normalized = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(normalized)) return false;
  const counter = Math.floor(now / 1000 / PERIOD_SECONDS);
  const given = Buffer.from(normalized);
  for (const window of [0, -1, 1]) {
    const expected = Buffer.from(hotp(secret, counter + window));
    if (expected.length === given.length && timingSafeEqual(expected, given)) return true;
  }
  return false;
}

export function otpauthUrl(secret: string, accountName: string): string {
  const issuer = encodeURIComponent('MY STORE');
  return `otpauth://totp/${issuer}:${encodeURIComponent(accountName)}?secret=${secret}&issuer=${issuer}&period=${PERIOD_SECONDS}&digits=${DIGITS}`;
}
