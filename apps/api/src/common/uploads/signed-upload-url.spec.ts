import { signUploadPath, signUploadRefs, stripUploadSignatures, verifyUploadRequest } from './signed-upload-url';

const SECRET = 'unit-test-secret-0123456789abcdef0123456789';
const PATH = '/uploads/cash-receipts/tenantA/0b6f.jpg';
const parse = (url: string) => Object.fromEntries(new URL(url, 'http://x').searchParams);

describe('signed upload links', () => {
  it('signs only upload paths of the caller’s store, and verifies them', () => {
    const signed = signUploadPath(PATH, 'tenantA', SECRET)!;
    const { exp, sig } = parse(signed);
    expect(verifyUploadRequest(PATH, exp, sig, SECRET)).toBe(true);
    expect(signUploadPath(PATH, 'tenantB', SECRET)).toBeNull(); // another store's file is never signed
    expect(signUploadPath('/uploads/../etc/passwd', 'tenantA', SECRET)).toBeNull();
    expect(signUploadPath('/uploads/cash-receipts/tenantA/../../x', 'tenantA', SECRET)).toBeNull();
  });

  it('rejects missing, tampered, wrong-file, wrong-secret and expired signatures', () => {
    const { exp, sig } = parse(signUploadPath(PATH, 'tenantA', SECRET)!);
    expect(verifyUploadRequest(PATH, undefined, undefined, SECRET)).toBe(false);
    expect(verifyUploadRequest(PATH, exp, sig.slice(0, -2) + 'AA', SECRET)).toBe(false);
    expect(verifyUploadRequest('/uploads/cash-receipts/tenantA/other.jpg', exp, sig, SECRET)).toBe(false);
    expect(verifyUploadRequest(PATH, String(Number(exp) + 3600), sig, SECRET)).toBe(false);
    expect(verifyUploadRequest(PATH, exp, sig, 'another-secret-0123456789abcdef01234567')).toBe(false);
    expect(verifyUploadRequest(PATH, exp, sig, SECRET, (Number(exp) + 1) * 1000)).toBe(false);
  });

  it('links live at least one hour and stay identical within the hour', () => {
    const t = Date.UTC(2026, 9, 30, 10, 0, 5);
    const a = parse(signUploadPath(PATH, 'tenantA', SECRET, t)!);
    const b = parse(signUploadPath(PATH, 'tenantA', SECRET, t + 50 * 60_000)!);
    expect(a.exp).toBe(b.exp);
    expect(Number(a.exp) * 1000 - (t + 50 * 60_000)).toBeGreaterThanOrEqual(3600_000);
  });

  it('responses are signed deeply; bodies sent back are stored as plain paths', () => {
    const out = signUploadRefs({ items: [{ receiptUrl: PATH, note: 'x', other: '/uploads/cash-receipts/tenantB/1.png' }] }, 'tenantA', SECRET) as {
      items: { receiptUrl: string; other: string }[];
    };
    expect(out.items[0].receiptUrl).toMatch(/\?exp=\d+&sig=/);
    expect(out.items[0].other).toBe('/uploads/cash-receipts/tenantB/1.png');
    expect(stripUploadSignatures({ receiptUrl: out.items[0].receiptUrl, n: 1 })).toEqual({ receiptUrl: PATH, n: 1 });
  });
});
