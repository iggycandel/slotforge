// GET /api/ai-test — confirms OpenAI key is live and measures generation time
// Remove this file once image generation is confirmed working.
import { NextResponse } from 'next/server'

export const maxDuration = 60

export async function GET() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: 'OPENAI_API_KEY not set' }, { status: 500 })
  }

  const t0 = Date.now()

  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:           'dall-e-3',
        prompt:          'A simple golden coin on a black background, game art style',
        n:               1,
        size:            '1024x1024',
        quality:         'standard',
        response_format: 'url',
      }),
    })

    const elapsed = Date.now() - t0

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json({
        ok:      false,
        status:  res.status,
        elapsed: elapsed,
        error:   (err as { error?: { message?: string } }).error?.message ?? res.statusText,
      })
    }

    const data = await res.json() as { data: Array<{ url: string }> }
    const url  = data.data?.[0]?.url ?? null

    return NextResponse.json({ ok: true, elapsed, url })
  } catch (err) {
    return NextResponse.json({
      ok:      false,
      elapsed: Date.now() - t0,
      error:   err instanceof Error ? err.message : String(err),
    })
  }
}
