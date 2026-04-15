// ─────────────────────────────────────────────────────────────────────────────
// SlotForge — OpenAI Images API Client (gpt-image-1 / dall-e-3)
// https://platform.openai.com/docs/api-reference/images
// ─────────────────────────────────────────────────────────────────────────────

export interface OpenAIGenerateOptions {
  prompt:        string
  size?:         '1024x1024' | '1792x1024' | '1024x1792' | '1536x1024'
  quality?:      'standard' | 'hd' | 'low' | 'medium' | 'high' | 'auto'
  model?:        'dall-e-3' | 'gpt-image-1'
  /** gpt-image-1 only — set to 'transparent' for cutout assets (symbols, UI elements) */
  background?:   'transparent' | 'opaque' | 'auto'
  outputFormat?: 'png' | 'jpeg' | 'webp'
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
    size         = '1024x1024',
    model        = 'dall-e-3',
    background   = 'opaque',
    outputFormat = 'png',
  } = opts

  const isGptImage = model === 'gpt-image-1'

  // Normalise quality per model:
  //   dall-e-3    → 'standard' | 'hd'
  //   gpt-image-1 → 'low' | 'medium' | 'high' | 'auto'
  const rawQuality = opts.quality ?? (isGptImage ? 'high' : 'standard')
  const quality = isGptImage
    ? (['low', 'medium', 'high', 'auto'].includes(rawQuality) ? rawQuality : 'high')
    : (['standard', 'hd'].includes(rawQuality)                ? rawQuality : 'standard')

  // OpenAI truncates prompts >4000 chars — trim safely
  const safePrompt = prompt.slice(0, 3900)

  // Build request body — parameter schemas differ between models
  const body: Record<string, unknown> = {
    model,
    prompt: safePrompt,
    n:      1,
    size,
    quality,
  }

  if (isGptImage) {
    // gpt-image-1: native transparency support, returns b64 without explicit response_format
    body.background    = background
    body.output_format = outputFormat
  } else {
    // dall-e-3: request base64 to avoid ephemeral CDN URL issues
    body.response_format = 'b64_json'
  }

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }))
    throw new Error(
      `[openai] API error ${res.status}: ${(err as { error?: { message?: string } }).error?.message ?? 'unknown'}`
    )
  }

  const data = await res.json() as { data: Array<{ b64_json?: string }> }
  const b64  = data.data?.[0]?.b64_json
  if (!b64) throw new Error('[openai] No image data in response')

  // Return as data URL so the storage layer can decode it directly
  const mime = outputFormat === 'webp' ? 'image/webp' : outputFormat === 'jpeg' ? 'image/jpeg' : 'image/png'
  return { url: `data:${mime};base64,${b64}`, provider: 'openai' }
}
