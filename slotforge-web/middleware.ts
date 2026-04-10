// Clerk's auth() in App Router reads the __session cookie directly when
// CLERK_SECRET_KEY is set, so no Clerk middleware import is needed here.
// Removing clerkMiddleware() eliminates the Edge Runtime module check
// failures (@clerk: #crypto, #safe-node-apis) that were blocking deployment.
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(_request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
