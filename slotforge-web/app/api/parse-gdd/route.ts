// ─────────────────────────────────────────────────────────────────────────────
// Spinative — POST /api/parse-gdd
// Accepts a GDD / Art Direction document (PDF, DOCX, TXT, MD) via multipart
// form upload, extracts its text, then asks GPT-4o to parse it into a
// structured JSON object that maps 1-to-1 onto Project Settings field IDs.
//
// Request:  multipart/form-data  { file: File }
// Response: { fields: GDDFields } | { error: string }
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { auth }                      from '@clerk/nextjs/server'

export const maxDuration = 60

// ─── Extracted field shape ───────────────────────────────────────────────────

export interface GDDFields {
  // Game Identity
  gameName?:   string
  theme?:      string   // matches <option value="..."> in theme-sel
  // Theme / Art Direction
  setting?:    string
  story?:      string
  mood?:       string
  bonusNarrative?: string
  artStyle?:   string
  artRef?:     string
  artNotes?:   string
  // Reels
  reelset?:    string   // e.g. "5x3", "6x4"
  // Mechanics
  rtp?:        string   // e.g. "96.1"
  volatility?: string   // "Low" | "Medium" | "High" | "Very High"
  paylines?:   string   // number as string
  // Jackpots
  jackpotMini?:  string
  jackpotMinor?: string
  jackpotMajor?: string
  jackpotGrand?: string
  // Features (array of feature keys that should be enabled)
  features?: string[]
  // Symbols
  symbolHighCount?:    number
  symbolLowCount?:     number
  symbolSpecialCount?: number
  // Per-symbol names (indexed arrays)
  symbolHighNames?:    string[]
  symbolLowNames?:     string[]
  symbolSpecialNames?: string[]
}

// ─── Text extraction ─────────────────────────────────────────────────────────

async function extractText(file: File): Promise<string> {
  const type = file.type
  const buf  = Buffer.from(await file.arrayBuffer())

  // Plain text or Markdown — just decode
  if (type.includes('text') || file.name.endsWith('.md') || file.name.endsWith('.txt')) {
    return buf.toString('utf8').slice(0, 40000)
  }

  // Word document — use mammoth
  if (
    type.includes('wordprocessingml') ||
    type.includes('msword') ||
    file.name.endsWith('.docx') ||
    file.name.endsWith('.doc')
  ) {
    const mammoth = (await import('mammoth')).default
    const result  = await mammoth.extractRawText({ buffer: buf })
    return result.value.slice(0, 40000)
  }

  // PDF — pdf-parse v1 (pdfjs-dist v2, no workers, works in Node.js/serverless)
  // Require the lib directly to avoid pdf-parse's index.js running its own test suite on load
  // (which tries to open ./test/data/05-versions-space.pdf and throws ENOENT in serverless)
  if (type.includes('pdf') || file.name.endsWith('.pdf')) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (buf: Buffer) => Promise<{ text: string }>
    const data = await pdfParse(buf)
    return data.text.slice(0, 40000)
  }

  throw new Error(`Unsupported file type: ${type || file.name}`)
}

// ─── GPT extraction prompt ────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert iGaming Game Design Document (GDD) parser.
Extract structured information from the provided GDD and return a single valid JSON object.

Rules:
- Only include fields you find with reasonable confidence. Omit fields you cannot find.
- "theme" must be one of these exact values (pick the closest match):
  ancient_egypt, vikings, fantasy, western, pirate, oriental, jungle, space,
  halloween, christmas, irish, greek_mythology, roman, aztec, wildlife, gems_jewels,
  fruit_classic, sport, mythology, underwater, steampunk, other
  If none match, use "other".
- "reelset" must be in format "ColumnsxRows" e.g. "5x3", "6x4", "3x3"
- "features" is an array of these exact keys (only include enabled ones):
  freespin, holdnspin, buy_feature, gamble, megaways, expanding_wild, bonus_pick,
  wheel_bonus, ladder_bonus, sticky_wild, walking_wild, stacked_wild, multiplier_wild,
  colossal_wild, ante_bet, bonus_store, cascade, tumble, win_multiplier, cluster_pays, ways
- Symbol counts are numbers (integers). Names are short strings (2-20 chars).
- Special symbol names should be taken directly from the GDD (Wild, Scatter, Bonus, etc.)
- Be concise with text fields (setting, story, mood, etc.) — max 200 chars each.

Return ONLY the raw JSON object, no markdown fences, no extra text.`

const USER_PROMPT = (text: string) =>
  `Parse this GDD and return the structured JSON:\n\n---\n${text}\n---`

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Plan gate — GDD parsing is an AI feature, requires Pro or Studio
  if (orgId) {
    const { getOrgPlan, canUseAI } = await import('@/lib/billing/subscription')
    const plan = await getOrgPlan(orgId)
    if (!canUseAI(plan)) {
      return NextResponse.json(
        { error: 'upgrade_required', plan, message: 'GDD import requires a Pro or Studio plan.' },
        { status: 403 }
      )
    }
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })

  // Parse multipart form
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  // Enforce size limit (10 MB)
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 400 })
  }

  // Extract text from the document
  let text: string
  try {
    text = await extractText(file)
  } catch (err) {
    return NextResponse.json(
      { error: `Could not read file: ${err instanceof Error ? err.message : 'Unknown error'}` },
      { status: 400 }
    )
  }

  if (!text.trim()) {
    return NextResponse.json({ error: 'No text could be extracted from the document' }, { status: 400 })
  }

  // Call GPT-4o
  let raw: string
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:       'gpt-4o',
        temperature: 0,
        max_tokens:  2000,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: USER_PROMPT(text) },
        ],
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(`OpenAI API error ${res.status}: ${(err as { error?: { message?: string } }).error?.message ?? 'unknown'}`)
    }
    const json = await res.json()
    raw = json.choices?.[0]?.message?.content ?? ''
  } catch (err) {
    return NextResponse.json(
      { error: `AI extraction failed: ${err instanceof Error ? err.message : 'Unknown error'}` },
      { status: 500 }
    )
  }

  // Parse the returned JSON
  let fields: GDDFields
  try {
    // Strip markdown fences if GPT wrapped in them despite instructions
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
    fields = JSON.parse(cleaned) as GDDFields
  } catch {
    return NextResponse.json(
      { error: 'Could not parse AI response as JSON', raw: raw.slice(0, 500) },
      { status: 500 }
    )
  }

  return NextResponse.json({ fields })
}
