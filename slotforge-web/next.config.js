/** @type {import('next').NextConfig} */
const path = require('path')

const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '4mb',
    },
  },
  // webpack is called once per bundle (client, nodejs, edge).
  // We receive the SAME webpack instance Next.js uses — critical for plugins to work.
  webpack: (config, { webpack, nextRuntime }) => {
    if (nextRuntime === 'edge') {
      // Clerk's @clerk/shared package uses Node.js-only subpath imports (#crypto,
      // #safe-node-apis) and a URL helper that Vercel's Edge static checker rejects.
      // Replace them with Edge-compatible stubs before webpack finalises the bundle.
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /^#crypto$/,
          path.resolve(__dirname, './lib/edge-crypto.js')
        ),
        new webpack.NormalModuleReplacementPlugin(
          /^#safe-node-apis$/,
          path.resolve(__dirname, './lib/edge-safe-node-apis.js')
        ),
        new webpack.NormalModuleReplacementPlugin(
          /@clerk\/shared\/buildAccountsBaseUrl/,
          path.resolve(__dirname, './lib/edge-build-accounts-url.js')
        )
      )
    }
    return config
  },
}

module.exports = nextConfig
