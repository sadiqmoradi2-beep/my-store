import { apiDocsEnabled, validateRequiredSecrets } from './security';

describe('apiDocsEnabled', () => {
  it('off in production, on elsewhere; ENABLE_API_DOCS overrides either way', () => {
    expect(apiDocsEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(apiDocsEnabled({ NODE_ENV: 'development' })).toBe(true);
    expect(apiDocsEnabled({})).toBe(true);
    expect(apiDocsEnabled({ NODE_ENV: 'production', ENABLE_API_DOCS: 'true' })).toBe(true);
    expect(apiDocsEnabled({ NODE_ENV: 'development', ENABLE_API_DOCS: 'false' })).toBe(false);
    expect(apiDocsEnabled({ NODE_ENV: 'production', ENABLE_API_DOCS: 'yes' })).toBe(false);
  });
});

describe('validateRequiredSecrets', () => {
  const good = { JWT_SECRET: 'a'.repeat(4) + 'Xk29fLq8Zr1Vb7Nw3Hp0Ms5Tc6Dy4Ge', JWT_REFRESH_SECRET: 'Qm7Ws2Er9Ty4Ui1Op6As3Df8Gh5Jk0Lz' };
  const err = (env: Record<string, unknown>) => {
    try {
      validateRequiredSecrets(env);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  };
  it('accepts two different strong secrets', () => {
    expect(err(good)).toBeNull();
  });
  it('refuses missing, placeholder, short, repetitive or identical secrets — without printing them', () => {
    expect(err({ ...good, JWT_SECRET: undefined })).toMatch(/JWT_SECRET is not set/);
    expect(err({ ...good, JWT_REFRESH_SECRET: '' })).toMatch(/JWT_REFRESH_SECRET is not set/);
    expect(err({ ...good, JWT_SECRET: 'dev-secret-change-me' })).toMatch(/placeholder/);
    expect(err({ ...good, JWT_SECRET: 'please-change-me-0123456789abcdefghijkl' })).toMatch(/placeholder/);
    expect(err({ ...good, JWT_SECRET: 'short-secret' })).toMatch(/at least 32/);
    expect(err({ ...good, JWT_SECRET: 'a'.repeat(40) })).toMatch(/repetitive/);
    expect(err({ JWT_SECRET: good.JWT_SECRET, JWT_REFRESH_SECRET: good.JWT_SECRET })).toMatch(/must be different/);
    expect(err({ ...good, JWT_SECRET: 'short-secret' })).not.toContain('short-secret');
  });
});
