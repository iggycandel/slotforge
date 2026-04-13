'use client'
// ─────────────────────────────────────────────────────────────────────────────
// SlotForge — AI Asset Generator Page
// /[orgSlug]/projects/[projectId]/generate
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef }   from 'react'
import { Sparkles }            from 'lucide-react'
import { GenerateForm }        from '@/components/generate/GenerateForm'
import { GenerationProgress }  from '@/components/generate/GenerationProgress'
import { AssetGrid }           from '@/components/generate/AssetGrid'
import { ExportPanel }         from '@/components/generate/ExportPanel'
import type { AssetType, GeneratedAsset, GenerationResult } from '@/types/assets'
import type { GenerationStatus } from '@/components/generate/GenerationProgress'

// ─── SSE message types ───────────────────────────────────────────────────────

interface SSEStart    { total: number; theme: string }
interface SSEProgress { completed: number; total: number; lastType: AssetType }
interface SSEComplete {
  success: boolean
  result?: GenerationResult
  partial: Partial<GenerationResult>
  failed:  Array<{ type: AssetType; error: string }>
}
interface SSEError { message: string }

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  params: { orgSlug: string; projectId: string }
}

export default function GeneratePage({ params }: Props) {
  const { projectId } = params

  // Generation state
  const [isLoading,    setIsLoading]    = useState(false)
  const [theme,        setTheme]        = useState('')
  const [status,       setStatus]       = useState<GenerationStatus>({
    completed: 0, total: 15, done: false,
  })
  const [completedSet, setCompletedSet] = useState<Set<AssetType>>(new Set())
  const [failedSet,    setFailedSet]    = useState<Set<AssetType>>(new Set())
  const [assets,       setAssets]       = useState<Partial<Record<AssetType, GeneratedAsset>>>({})
  const [currentTheme, setCurrentTheme] = useState('')

  const abortRef = useRef<AbortController | null>(null)

  // ─── Start generation ──────────────────────────────────────────────────────

  async function handleGenerate(userTheme: string, provider: string) {
    // Cancel any in-flight request
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setIsLoading(true)
    setTheme(userTheme)
    setCurrentTheme(userTheme)
    setStatus({ completed: 0, total: 15, done: false })
    setCompletedSet(new Set())
    setFailedSet(new Set())
    setAssets({})

    try {
      const res = await fetch('/api/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ theme: userTheme, project_id: projectId, provider }),
        signal:  ctrl.signal,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }))
        setStatus(s => ({ ...s, done: true, error: err.error }))
        return
      }

      // Parse SSE stream
      const reader = res.body!.getReader()
      const dec    = new TextDecoder()
      let buffer   = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += dec.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() ?? ''

        for (const chunk of lines) {
          const eventMatch = chunk.match(/^event: (\w+)/m)
          const dataMatch  = chunk.match(/^data: ([\s\S]+)/m)
          if (!eventMatch || !dataMatch) continue

          const event  = eventMatch[1]
          const data   = JSON.parse(dataMatch[1])

          switch (event) {
            case 'start': {
              const d = data as SSEStart
              setStatus(s => ({ ...s, total: d.total }))
              break
            }
            case 'progress': {
              const d = data as SSEProgress
              setStatus(s => ({
                ...s,
                completed: d.completed,
                total:     d.total,
                current:   d.lastType,
              }))
              setCompletedSet(prev => { const n = new Set(Array.from(prev)); n.add(d.lastType); return n })
              break
            }
            case 'complete': {
              const d = data as SSEComplete

              // Flatten partial result into assets map
              const newAssets: Partial<Record<AssetType, GeneratedAsset>> = {}

              if (d.partial.backgrounds) {
                newAssets.background_base  = d.partial.backgrounds.base
                newAssets.background_bonus = d.partial.backgrounds.bonus
              }
              if (d.partial.symbols) {
                d.partial.symbols.high.forEach((a, i) => {
                  newAssets[`symbol_high_${i+1}` as AssetType] = a
                })
                d.partial.symbols.low.forEach((a, i) => {
                  newAssets[`symbol_low_${i+1}` as AssetType] = a
                })
                newAssets.symbol_wild    = d.partial.symbols.wild
                newAssets.symbol_scatter = d.partial.symbols.scatter
              }
              if (d.partial.logo) {
                newAssets.logo = d.partial.logo
              }

              setAssets(newAssets)

              const failTypes = new Set(d.failed.map(f => f.type))
              setFailedSet(failTypes)
              setStatus(s => ({
                ...s,
                done:    true,
                current: undefined,
                error:   d.failed.length > 0
                  ? `${d.failed.length} asset(s) failed to generate`
                  : undefined,
              }))
              break
            }
            case 'error': {
              const d = data as SSEError
              setStatus(s => ({ ...s, done: true, error: d.message }))
              break
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setStatus(s => ({
          ...s,
          done:  true,
          error: err instanceof Error ? err.message : 'Generation failed',
        }))
      }
    } finally {
      setIsLoading(false)
    }
  }

  const assetCount = Object.keys(assets).length

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2.5 mb-1">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <h1 className="text-xl font-bold tracking-tight">AI Asset Generator</h1>
          </div>
          <p className="text-sm text-zinc-500">
            Enter a theme and generate all 15 slot game assets — backgrounds, symbols, wild, scatter, and logo.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">

          {/* ── Left panel: form + progress ─────────────────────────────── */}
          <div className="space-y-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <GenerateForm onGenerate={handleGenerate} isLoading={isLoading} />
            </div>

            {(isLoading || status.done) && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                <GenerationProgress
                  status={status}
                  completedSet={completedSet}
                  failedSet={failedSet}
                />
              </div>
            )}

            {assetCount > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                <ExportPanel assets={assets} theme={currentTheme} />
              </div>
            )}
          </div>

          {/* ── Right panel: asset grid ──────────────────────────────────── */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 min-h-[400px]">
            {assetCount === 0 && !isLoading && (
              <div className="h-full flex flex-col items-center justify-center text-center py-20">
                <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center mb-4">
                  <Sparkles className="w-7 h-7 text-zinc-600" />
                </div>
                <p className="text-sm font-medium text-zinc-500">
                  Your generated assets will appear here
                </p>
                <p className="text-xs text-zinc-600 mt-1">
                  15 assets · 2 backgrounds · 10 symbols · wild · scatter · logo
                </p>
              </div>
            )}

            {isLoading && assetCount === 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {Array.from({ length: 15 }).map((_, i) => (
                  <div
                    key={i}
                    className="aspect-square rounded-xl bg-zinc-800 animate-pulse"
                    style={{ animationDelay: `${i * 50}ms` }}
                  />
                ))}
              </div>
            )}

            {assetCount > 0 && (
              <>
                {currentTheme && (
                  <div className="flex items-center gap-2 mb-5">
                    <span className="text-xs text-zinc-500">Theme:</span>
                    <span className="px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400 font-medium">
                      {currentTheme}
                    </span>
                    <span className="text-xs text-zinc-600 ml-auto">{assetCount} / 15 assets</span>
                  </div>
                )}
                <AssetGrid assets={assets} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
