/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // Assets are now uploaded to Supabase Storage (URLs only in payload).
      // 4MB covers the remaining JSON payload comfortably on Vercel.
      bodySizeLimit: '4mb',
    },
  },
  webpack: (config, { nextRuntime }) => {
    if (nextRuntime === 'edge') {
      // Prefer edge-compatible exports for all packages (fixes Clerk #crypto,
      // #safe-node-apis, and @clerk/shared/buildAccountsBaseUrl on Vercel Edge)
      config.resolve.conditionNames = [
        'edge-light',
        'workerd',
        'worker',
        'browser',
        'module',
        'import',
        'require',
      ]
    }
    return config
  },
}

module.exports = nextConfig
