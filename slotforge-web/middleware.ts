import { clerkMiddleware } from '@clerk/nextjs/server'

export default clerkMiddleware()

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
  // Tell Vercel's Edge Function static checker to allow dynamic imports
  // from Clerk packages (they use #crypto and #safe-node-apis subpath
  // imports that the checker flags but the runtime handles fine).
  unstable_allowDynamic: [
    '**/node_modules/@clerk/**',
  ],
}
