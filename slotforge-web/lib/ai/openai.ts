// ─────────────────────────────────────────────────────────────────────────────
// SlotForge — OpenAI Images API Client (gpt-image-1 / dall-e-3)
// https://platform.openai.com/docs/api-reference/images
// ─────────────────────────────────────────────────────────────────────────────

export interface OpenAIGenerateOptions {
  prompt:      string
  size?:       '1024x1024' | '1792x1024' | '1024x1792'
  quality?:    'standard' | 'hd'
  model?:      'dall-e-3' | 'gpt-image-1'
}

export interface OpenAIResult {
  url:      string   // data:image/png;base64,... — ready to upload directly, no CDN fetch needed
  provider: 'openai'
}

export async function generateWithOpenAI(
  opts: OpenAIGenerateOptions
): Promise<OpenAIResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('[openai] OPENAI_API_KEY is not set')

  const {
    prompt,
    size    = '1024x1024',
    quality = 'standard',  // 'hd' costs 2× — use standard by default
    model   = 'dall-e-3',
  } = opts

  // OpenAI truncates prompts >4000 chars — trim safely
  const safePrompt = prompt.slice(0, 3900)

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt:          safePrompt,
      n:               1,
      size,
      quality,
      response_format: 'b64_json',   // get bytes directly — avoids CDN auth issues
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }))
    throw new Error(
      `[openai] API error ${res.status}: ${(err as { error?: { message?: string } }).error?.message ?? 'unknown'}`
    )
  }

  const data = await res.json() as { data: Array<{ b64_json: string }> }
  const b64  = data.data?.[0]?.b64_json
  if (!b64) throw new Error('[openai] No image data in response')

  // Return as data URL so the storage layer can decode it directly
  return { url: `data:image/png;base64,${b64}`, provider: 'openai' }
}
