import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

/**
 * Hosted setup: set API_INTERNAL_URL (e.g. https://my-store-api.onrender.com) and NEXT_PUBLIC_API_URL=/api/v1.
 * The browser then talks only to this site, which forwards /api/v1 and /uploads to the API — this keeps
 * the login cookie first-party (no cross-site cookie issues) and avoids CORS.
 */
const apiInternalUrl = process.env.API_INTERNAL_URL?.replace(/\/$/, '');

/**
 * Security headers for every page. The API is reached same-origin through the rewrites below, or directly when
 * NEXT_PUBLIC_API_URL is an absolute URL — that origin is allowed for fetch and receipt images. Fonts are self-hosted
 * by next/font, so nothing else is loaded from third parties. Next.js hydration needs inline scripts, hence
 * 'unsafe-inline' for scripts (no eval in production); framing is forbidden entirely.
 */
const isDev = process.env.NODE_ENV !== 'production';
const apiOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL ?? '').origin;
  } catch {
    return '';
  }
})();
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${apiOrigin}`.trim(),
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigin}${isDev ? ' ws: wss:' : ''}`.trim(),
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');
const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  async redirects() {
    // Old Cash / Debts / Orders routes
    return [
      { source: '/:locale/finance', destination: '/:locale/income', permanent: false },
      { source: '/:locale/finance/cash', destination: '/:locale/income', permanent: false },
      { source: '/:locale/finance/debts/:path*', destination: '/:locale/loans/:path*', permanent: false },
      { source: '/:locale/orders', destination: '/:locale/income', permanent: false },
      { source: '/:locale/work-seasons', destination: '/:locale/sessions', permanent: false },
    ];
  },
  async rewrites() {
    if (!apiInternalUrl) return [];
    return [
      { source: '/api/v1/:path*', destination: `${apiInternalUrl}/api/v1/:path*` },
      { source: '/uploads/:path*', destination: `${apiInternalUrl}/uploads/:path*` },
    ];
  },
};

export default withNextIntl(nextConfig);
