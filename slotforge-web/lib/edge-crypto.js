/**
 * Edge Runtime-compatible crypto shim for @clerk/shared's #crypto subpath import.
 * Web Crypto API is available in Vercel's Edge Runtime (V8 isolate).
 */
module.exports = globalThis.crypto
