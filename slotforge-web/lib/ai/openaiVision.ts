// ─────────────────────────────────────────────────────────────────────────────
// Spinative — OpenAI Vision (chat/completions with images)
// https://platform.openai.com/docs/guides/vision
// https://platform.openai.com/docs/api-reference/chat/create
//
// Used by /api/typography/generate to let GPT-4o analyse game screenshots
// and emit a structured typography spec. Kept deliberately thin — the route
// owns the prompt and JSON parsing; this module only deals with the API
// transport so we don't grow a "vision framework" prematurely.
//
// Why not the `openai` npm package? The rest of lib/ai/ uses raw fetch
// (see openai.ts) to keep deps minimal and the request shape visible.
// Sticking to that convention here.
// ─────────────────────────────────────────────────────────────────────────────

export interface VisionImage {
  /** Either a full https:// URL (project assets) or a data URL
   *  ("data:image/png;base64,…") from a fresh browser upload. OpenAI
   *  accepts both in the same `image_url` field. */
  url:    string
  /** Detail hint — 'low' downsamples to 512 px which is plenty for
   *  aesthetic analysis and roughly halves the vision cost. Use 'high'
   *  only if we later need to read small text out of the screenshot. */
  detail?: 'low' | 'high' | 'auto'
}

export interface OpenAIVisionOptions {
  /** Defaults to gpt-4o-mini — cheaper and fast enough for this task. Bump
   *  to 'gpt-4o' if we observe accuracy regressions on stylised art. */
  model?:       'gpt-4o' | 'gpt-4o-mini'
  /** System role message — use for the persona ("you are a typography
   *  director for slot games, …"). Kept separate from the user turn so
   *  JSON mode guarantees apply cleanly to the last user message. */
  system?:      string
  /** The main user instruction. Sent AFTER the images in content[] so
   *  GPT considers them in context rather than answering in the abstract. */
  prompt:       string
  /** One or more images to include in the user turn. Must be non-empty
   *  — callers that have no image should use a plain chat completion
   *  instead of this wrapper. */
  images:       VisionImage[]
  /** Cap output. 3000 is generous for the typography spec which is
   *  ~1.5 KB of JSON on average. */
  maxTokens?:   number
  /** When true (default), request JSON mode — the response is
   *  guaranteed to be a parseable JSON object. GPT-4o returns { ... }
   *  as plain text in .choices[0].message.content; no regex stripping
   *  of code fences needed. */
  jsonMode?:    boolean
}

export interface OpenAIVisionResult {
  /** Raw text content from GPT (already the JSON string in json mode). */
  text:    string
  /** Full usage report for cost tracking. */
  usage?:  {
    prompt_tokens?:     number
    completion_tokens?: number
    total_tokens?:      number
  }
  /** The model that actually served the request — useful for logs in
   *  case OpenAI routes to a different snapshot than we asked for. */
  model?:  string
}

/** Core client. Throws on network errors and non-2xx with a readable
 *  message — callers should let the error bubble so the route can
 *  convert it to a JSON 500 with a concise message. */
export async function callOpenAIVision(
  opts: OpenAIVisionOptions
): Promise<OpenAIVisionResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('[openai-vision] OPENAI_API_KEY is not set')

  if (!opts.images?.length) {
    throw new Error('[openai-vision] at least one image is required')
  }

  const {
    model     = 'gpt-4o-mini',
    system,
    prompt,
    images,
    maxTokens = 3000,
    jsonMode  = true,
  } = opts

  // Build the user-turn content: all images first, then the text prompt.
  // Putting images before the text matches OpenAI's own vision cookbook
  // — the model reasons over the images while reading the instructions.
  type ContentBlock =
    | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } }
    | { type: 'text';      text: string }

  const userContent: ContentBlock[] = [
    ...images.map(img => ({
      type: 'image_url' as const,
      image_url: { url: img.url, detail: img.detail ?? 'low' },
    })),
    { type: 'text' as const, text: prompt },
  ]

  type Message =
    | { role: 'system'; content: string }
    | { role: 'user';   content: ContentBlock[] }

  const messages: Message[] = []
  if (system) messages.push({ role: 'system', content: system })
  messages.push({ role: 'user', content: userContent })

  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: maxTokens,
    // Slight temperature so the rationale reads like prose, not
    // boilerplate. Lower than default 1.0 because we still want the
    // JSON structure to be predictable.
    temperature: 0.4,
  }
  if (jsonMode) body.response_format = { type: 'json_object' }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
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
      `[openai-vision] API error ${res.status}: ` +
      ((err as { error?: { message?: string } }).error?.message ?? 'unknown')
    )
  }

  const data = await res.json() as {
    choices: Array<{ message?: { content?: string } }>
    usage?:  OpenAIVisionResult['usage']
    model?:  string
  }
  const text = data.choices?.[0]?.message?.content
  if (!text) throw new Error('[openai-vision] empty response from OpenAI')

  return { text, usage: data.usage, model: data.model }
}
