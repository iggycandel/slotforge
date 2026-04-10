/** @type {import('next').NextConfig} */
const path = require('path')
const webpack = require('webpack')

const nextConfig = {
  experimental: {
    serverActions: {
      // Assets are uploaded to Supabase Storage (URLs only in payload).
      // 4MB covers the remaining JSON payload comfortably on Vercel.
      bodySizeLimit: '4mb',
    },
  },
  webpack: (config, { nextRuntime }) => {
    if (nextRuntime === 'edge') {
      // Replace Clerk's Node.js-only subpath imports with Edge-compatible stubs
      // so Vercel's Edge Function static checker doesn't reject the middleware bundle.
      // Web Crypto API (globalThis.crypto) is fully available in Vercel's Edge Runtime.
      config.plugins.push(
        // #crypto — Clerk uses Node's built-in crypto; swap to globalThis.crypto
        new webpack.NormalModuleReplacementPlugin(
          /^#crypto$/,
          path.resolve(__dirname, './lib/edge-crypto.js')
        ),
        // #safe-node-apis — optional Node.js API wrappers; no-op is safe for Edge
        new webpack.NormalModuleReplacementPlugin(
          /^#safe-node-apis$/,
          path.resolve(__dirname, './lib/edge-safe-node-apis.js')
        ),
        // @clerk/shared/buildAccountsBaseUrl — pure URL builder, easy to inline
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
