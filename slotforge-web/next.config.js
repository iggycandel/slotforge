/** @type {import('next').NextConfig} */
// fix: set framework preset to Next.js in Vercel
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '4mb',
    },
  },
}

module.exports = nextConfig
