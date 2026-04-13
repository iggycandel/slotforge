// ─────────────────────────────────────────────────────────────────────────────
// SlotForge — Runway Gen-4 Image Turbo API Client
// https://docs.runwayml.com
// ─────────────────────────────────────────────────────────────────────────────

export interface RunwayGenerateOptions {
  prompt:          string
  negativePrompt?: string
  width?:          number   // default 1024
  height?:         number   // default 1024
  numOutputs?:     number   // default 1
}

export interface RunwayResult {
  url:      string
  provider: 'runway'
}

// Runway task polling config
const POLL_INTERVAL_MS = 2_000
const POLL_TIMEOUT_MS  = 120_000

export async function generateWithRunway(
  opts: RunwayGenerateOptions
): Promise<RunwayResult> {
  const apiKey = process.env.RUNWAY_API_KEY
  if (!apiKey) throw new Error('[runway] RUNWAY_API_KEY is not set')

  const { prompt, negativePrompt, width = 1024, height = 1024 } = opts

  // ── 1. Submit generation task ────────────────────────────────────────────
  const submitRes = await fetch('https://api.runwayml.com/v1/image_to_image', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'X-Runway-Version': '2024-11-06',
    },
    body: JSON.stringify({
      model:           'gen4_image_turbo',
      prompt_text:     prompt,
      negative_prompt: negativePrompt,
      ratio:           `${width}:${height}`,
      output_format:   'png',
    }),
  })

  if (!submitRes.ok) {
    const err = await submitRes.text()
    throw new Error(`[runway] Submit failed ${submitRes.status}: ${err}`)
  }

  const task = await submitRes.json() as { id: string }

  // ── 2. Poll until complete ───────────────────────────────────────────────
  const deadline = Date.now() + POLL_TIMEOUT_MS

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS)

    const pollRes = await fetch(`https://api.runwayml.com/v1/tasks/${task.id}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'X-Runway-Version': '2024-11-06',
      },
    })

    if (!pollRes.ok) {
      throw new Error(`[runway] Poll failed ${pollRes.status}`)
    }

    const status = await pollRes.json() as {
      status:  'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'
      output?: string[]
      failure?: string
    }

    if (status.status === 'SUCCEEDED' && status.output?.[0]) {
      return { url: status.output[0], provider: 'runway' }
    }

    if (status.status === 'FAILED' || status.status === 'CANCELLED') {
      throw new Error(`[runway] Task ${status.status}: ${status.failure ?? 'unknown'}`)
    }

    // PENDING or RUNNING — keep polling
  }

  throw new Error('[runway] Generation timed out after 2 minutes')
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
