/**
 * Edge Runtime stub for @clerk/shared/buildAccountsBaseUrl.
 * Builds the Clerk accounts portal URL from a frontend API domain.
 */
function buildAccountsBaseUrl(frontendApi) {
  if (!frontendApi) return 'https://accounts.clerk.com'
  // e.g. "clerk.example.com" → "https://accounts.example.com"
  return 'https://accounts.' + frontendApi.replace(/^(clerk\.|accounts\.)/, '')
}

module.exports = buildAccountsBaseUrl
module.exports.buildAccountsBaseUrl = buildAccountsBaseUrl
module.exports.default = buildAccountsBaseUrl
