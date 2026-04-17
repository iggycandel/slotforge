import { readFileSync } from 'fs'
import { join } from 'path'
import { NextResponse } from 'next/server'

/**
 * Serves the standalone landing page HTML at the root URL.
 * The file lives in public/landing.html so it's included in the build output.
 */
export async function GET() {
  try {
    const html = readFileSync(join(process.cwd(), 'public', 'landing.html'), 'utf-8')
    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch {
    // Fallback if file not found during build
    return new NextResponse(
      `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Spinative</title></head>
       <body style="background:#07080d;color:#f4efe4;font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
         <div style="text-align:center">
           <h1 style="color:#d7a84f">Spinative</h1>
           <p><a href="/sign-in" style="color:#d7a84f">Sign in</a> · <a href="/sign-up" style="color:#d7a84f">Sign up</a></p>
         </div>
       </body></html>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    )
  }
}
