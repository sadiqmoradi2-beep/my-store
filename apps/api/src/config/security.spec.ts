import { apiDocsEnabled } from './security';

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
