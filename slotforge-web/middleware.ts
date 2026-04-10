import { clerkMiddleware } from '@clerk/nextjs/server'

// clerkMiddleware() with no arguments sets up Clerk auth context on every
// request so that auth() works in API routes and Server Components.
// Individual routes/API handlers enforce their own auth as needed.
export default clerkMiddleware()

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
