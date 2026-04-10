/** @type {import('next').NextConfig} */
// trigger fresh Vercel build
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '4mb',
    },
  },
}

module.exports = nextConfig
