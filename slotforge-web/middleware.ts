import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks(.*)',
])

export default clerkMiddleware((auth, req) => {
  const { userId } = auth()

  // If the user is signed in and hitting a public/auth route,
  // bounce them to onboarding which will route to their dashboard.
  if (userId && isPublicRoute(req)) {
    return NextResponse.redirect(new URL('/onboarding', req.url))
  }

  // Protect all non-public routes — unauthenticated users get sent to /sign-in
  if (!isPublicRoute(req)) {
    auth().protect()
  }
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
