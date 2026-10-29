import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Receipts, invoices and payment proofs are never public. The API returns each stored path (/uploads/<kind>/<tenant>/
 * <file>) with a short-lived HMAC signature, and only inside a response to an authenticated user of that same store —
 * so a link is only obtainable through a record the user may already read. The file route serves nothing without a
 * valid, unexpired signature. Signatures are stripped from incoming bodies, so only the plain path is ever stored.
 */
const UPLOAD_PATH = /^\/uploads\/(purchase-invoices|warehouse-requests|payment-proofs|salary-receipts|cash-receipts)\/([A-Za-z0-9_-]+)\/([A-Za-z0-9._-]+)$/;
/** Links stay identical within an hour (cache-friendly) and live 1–2 hours */
const HOUR_SECONDS = 3600;

function key(secret: string) {
  return createHmac('sha256', secret).update('upload-url-signing:v1').digest();
}

function signature(secret: string, path: string, exp: number) {
  return createHmac('sha256', key(secret)).update(`${path}\n${exp}`).digest('base64url');
}

/** The stored path without any query string */
export function plainUploadPath(value: string) {
  return value.split('?')[0];
}

/** A signed link for one stored upload path, or null when it is not an upload path of this store */
export function signUploadPath(value: string, tenantId: string | null, secret: string, now = Date.now()): string | null {
  const path = plainUploadPath(value);
  const match = UPLOAD_PATH.exec(path);
  if (!match) return null;
  if (tenantId !== null && match[2] !== tenantId) return null; // another store's file: never signed
  const exp = (Math.floor(now / 1000 / HOUR_SECONDS) + 2) * HOUR_SECONDS;
  return `${path}?exp=${exp}&sig=${signature(secret, path, exp)}`;
}

export function verifyUploadRequest(path: string, exp: unknown, sig: unknown, secret: string, now = Date.now()): boolean {
  if (!UPLOAD_PATH.test(path) || typeof exp !== 'string' || typeof sig !== 'string' || !/^\d+$/.test(exp)) return false;
  if (Number(exp) * 1000 < now) return false;
  const expected = Buffer.from(signature(secret, path, Number(exp)));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Walk a response body and sign every upload path of the caller's store */
export function signUploadRefs(value: unknown, tenantId: string | null, secret: string): unknown {
  if (typeof value === 'string') return value.startsWith('/uploads/') ? (signUploadPath(value, tenantId, secret) ?? value) : value;
  if (Array.isArray(value)) return value.map((v) => signUploadRefs(v, tenantId, secret));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, signUploadRefs(v, tenantId, secret)]));
  }
  return value;
}

/** Incoming bodies: a signed link sent back by the browser is stored as its plain path */
export function stripUploadSignatures(value: unknown): unknown {
  if (typeof value === 'string') return value.startsWith('/uploads/') ? plainUploadPath(value) : value;
  if (Array.isArray(value)) return value.map(stripUploadSignatures);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, stripUploadSignatures(v)]));
  }
  return value;
}

/** Express middleware for /uploads: 404 unless the signature is valid and unexpired */
export function requireSignedUpload(secret: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const path = `/uploads${req.path}`;
    if (!verifyUploadRequest(path, req.query.exp, req.query.sig, secret)) {
      res.status(404).json({ success: false, error: { statusCode: 404, message: 'Not found' } });
      return;
    }
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  };
}
