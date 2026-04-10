/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // Default is 1MB — raised to 10MB for large project payloads
      // (user-uploaded backgrounds, symbol images stored as base64, etc.)
      bodySizeLimit: '100mb',
    },
  },
}

module.exports = nextConfig
