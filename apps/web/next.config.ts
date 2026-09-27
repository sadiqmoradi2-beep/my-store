import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

/**
 * Hosted setup: set API_INTERNAL_URL (e.g. https://my-store-api.onrender.com) and NEXT_PUBLIC_API_URL=/api/v1.
 * The browser then talks only to this site, which forwards /api/v1 and /uploads to the API — this keeps
 * the login cookie first-party (no cross-site cookie issues) and avoids CORS.
 */
const apiInternalUrl = process.env.API_INTERNAL_URL?.replace(/\/$/, '');

const nextConfig: NextConfig = {
  output: 'standalone',
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
