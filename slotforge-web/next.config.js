/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Linting is enforced in CI — skip during Vercel production builds
    // to avoid false-positive failures on <img> in AI asset previews.
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '4mb',
    },
  },
}

module.exports = nextConfig
