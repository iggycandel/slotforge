/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // Assets are now uploaded to Supabase Storage (URLs only in payload).
      // 4MB covers the remaining JSON payload comfortably on Vercel.
      bodySizeLimit: '4mb',
    },
  },
}

module.exports = nextConfig
