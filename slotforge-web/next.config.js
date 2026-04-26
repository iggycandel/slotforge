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
    // Native modules used by the marketing composition pipeline. Webpack
    // refuses to bundle .node binaries; this list tells Next.js to leave
    // them as runtime requires that load the platform-specific binary
    // off node_modules at execution time.
    serverComponentsExternalPackages: ['sharp', '@napi-rs/canvas'],
  },

  // Security headers (audit M1, v120). Conservative baseline applied to
  // every response. Each header exists for a specific attack class:
  //
  //   X-Frame-Options: SAMEORIGIN
  //     Stops the editor being framed by a THIRD-PARTY origin
  //     (clickjacking — an attacker frames the canvas, overlays a
  //     transparent button, tricks the user into clicking Generate /
  //     Save / Delete on their own project). v122 fix-up: was DENY,
  //     which blocked the editor's own iframe from loading
  //     `/editor/spinative.html` even though both URLs are same-origin.
  //     SAMEORIGIN closes the cross-origin clickjacking surface while
  //     letting our own editor frame load.
  //
  //   X-Content-Type-Options: nosniff
  //     Forces the browser to honour the Content-Type header. Without
  //     it, an HTML response served as image/* could be rendered as
  //     HTML — relevant once we host user-supplied assets, especially
  //     once C1 lands and uploads can come from any user.
  //
  //   Referrer-Policy: strict-origin-when-cross-origin
  //     Stops UUID project-ids leaking via the Referer header to
  //     third-party CDNs (Stripe, Google Fonts, OpenAI, Supabase).
  //     Default Next behaviour is more permissive.
  //
  //   Permissions-Policy: camera=(), microphone=(), geolocation=()
  //     Hard-disable the three "high-risk" device APIs we don't use.
  //     Defence in depth — if a script ever asks for them, the
  //     browser blocks at policy level.
  //
  //   Strict-Transport-Security: 1y + preload
  //     Forces HTTPS for any spinative.com visit for one year + opts
  //     in to the browser preload list. Removes the downgrade attack
  //     window on first-time visitors over hostile networks.
  //
  // CSP intentionally omitted here — needs a careful pass over
  // editor.js (innerHTML + eval-shaped surface area) plus the explicit
  // allowlist of all third-party origins (Clerk, Supabase, Stripe,
  // OpenAI, Google Fonts). Doing it half-right breaks the editor;
  // tracked as separate work.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options',           value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options',    value: 'nosniff' },
          { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
