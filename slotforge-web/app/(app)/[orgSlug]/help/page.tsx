'use client'
//
// Spinative — Help & docs page
// ---------------------------------------------------------------------------
// Lives under [orgSlug]/help so it inherits the sidebar layout. The
// sidebar's NavItem links to /${slug}/help — kept simple and link-driven
// (no client state, no fetches) so the page paints instantly and works
// offline-cached.
//
// Content is grouped by user job-to-be-done (Getting started, Workspaces,
// Generation, Marketing, Billing, Shortcuts) and each section ships
// hand-rolled compact copy — no marketing fluff. The studio-grade voice
// matches the design system's tone guide.
//

import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  LayoutDashboard,
  FolderOpen,
  Settings as SettingsIcon,
  Sparkles,
  Layers,
  PlayCircle,
  Zap,
  Image as ImageIcon,
  Workflow,
  CreditCard,
  Keyboard,
  HelpCircle,
  Mail,
  ExternalLink,
} from 'lucide-react'

interface Section {
  id:    string
  icon:  typeof LayoutDashboard
  title: string
  body:  React.ReactNode
}

export default function HelpPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>()

  const sections: Section[] = [
    {
      id:    'getting-started',
      icon:  Sparkles,
      title: 'Getting started',
      body: (
        <ol className="hp-ol">
          <li><b>Create a project</b> from the <Link href={`/${orgSlug}/dashboard`} className="hp-link">Dashboard</Link>. Each project is one slot game.</li>
          <li>In the editor, open <b>Project</b> in the top-bar to set the reels, theme, features, and symbols. Mandatory fields are marked with a gold <span style={{ color: '#d7a84f' }}>*</span>; everything else is optional.</li>
          <li>Switch to <b>Art</b> and click <b>Generate All</b> to produce the bg, character, logo, and symbols. A confirmation dialog shows the credit cost before anything fires.</li>
          <li>Use <b>Flow</b> to compose each screen on the canvas — drag, scale, rotate, flip layers like Photoshop.</li>
          <li>Use <b>Marketing</b> to position character + logo on social/store templates. Render only when you&apos;re ready to export.</li>
        </ol>
      ),
    },
    {
      id:    'workspaces',
      icon:  Layers,
      title: 'Workspaces',
      body: (
        <ul className="hp-ul">
          <li><b>Flow</b> — the canvas editor. Each game screen (base, free spins, win sequence, …) is a tab in the vertical strip. Right-click a layer for transforms and config.</li>
          <li><b>Art</b> — generates and re-rolls every asset from one style brief. Inspect any tile to see its prompt + seed.</li>
          <li><b>Features</b> — toggle bonus rounds, wild mechanics, gambles, etc. Each enabled feature creates a Flow screen group AND adds itself to the GDD.</li>
          <li><b>Logic</b> — node graph of game state transitions. Auto-populated from your features.</li>
          <li><b>Project</b> — top-level configuration: theme, reels, features, symbols. Always your first stop on a new game.</li>
          <li><b>Marketing</b> — composes lobby tiles, social posts, store creatives from your existing assets. No extra generation cost — assets are reused.</li>
        </ul>
      ),
    },
    {
      id:    'generating',
      icon:  ImageIcon,
      title: 'Generating assets',
      body: (
        <>
          <p className="hp-p">
            Spinative generates every asset against the same <b>style brief</b> you set in
            Project → Theme. Re-rolling a single tile (right-click → Generate with AI) leaves
            the rest of the set untouched.
          </p>
          <p className="hp-p">
            Each asset costs <b>1 credit</b>. Credits are only deducted on successful provider
            responses; failures auto-refund. Your remaining balance is shown in the bottom-left
            of every page.
          </p>
          <p className="hp-p">
            <b>Generate All</b> from the Art workspace shows a pre-flight dialog with the count,
            cost, and projected balance after — you can cancel before any credits are spent.
          </p>
        </>
      ),
    },
    {
      id:    'marketing',
      icon:  Workflow,
      title: 'Marketing kit',
      body: (
        <>
          <p className="hp-p">
            The Marketing tab shows ~20 templates (lobby tiles, social posts, store covers,
            press one-pager). Each tile is a <b>preview</b> until you click Render — no credits
            spent up-front.
          </p>
          <p className="hp-p">
            Click any tile to open the customise modal: position character + logo with sliders
            or by dragging the gold rectangles on the preview backdrop. Save persists your
            positions; Render commits them and produces the final PNG / JPG / PDF.
          </p>
          <p className="hp-p">
            <b>Export all kit</b> in the topbar renders every uncached tile in one batch and
            zips the full set.
          </p>
        </>
      ),
    },
    {
      id:    'billing',
      icon:  CreditCard,
      title: 'Plans &amp; credits',
      body: (
        <>
          <p className="hp-p">
            <b>Free</b> — explore the canvas, manage projects. AI generation locked.<br/>
            <b>Freelancer</b> — AI generation, 50 credits/month, exports unlocked.<br/>
            <b>Studio</b> — higher credit ceiling, marketing kit, priority queue.
          </p>
          <p className="hp-p">
            Top-up packs are available from the <Link href={`/${orgSlug}/settings/billing`} className="hp-link">Billing</Link> page —
            50 credits for €10. Refunds for failed generations apply automatically.
          </p>
        </>
      ),
    },
    {
      id:    'shortcuts',
      icon:  Keyboard,
      title: 'Keyboard shortcuts',
      body: (
        <div className="hp-shortcuts">
          {[
            ['⌘ S',         'Save project'],
            ['⌘ Z',         'Undo'],
            ['⌘ ⇧ Z',       'Redo'],
            ['⌘ D',         'Duplicate selected layer'],
            ['⌘ C / V',     'Copy / paste asset'],
            ['⌘ ] / [',     'Layer forward / back'],
            ['⌥ ⌘ ] / [',   'Bring to front / send to back'],
            ['Shift + drag corner', 'Lock aspect ratio while resizing'],
            ['Alt + drag handle',   'Scale from centre'],
            ['Shift + rotate',       'Snap rotation to 15°'],
            ['?',            'Show all shortcuts (in editor)'],
          ].map(([k, v]) => (
            <div className="hp-shortcut-row" key={k}>
              <kbd className="hp-kbd">{k}</kbd>
              <span className="hp-shortcut-desc">{v}</span>
            </div>
          ))}
        </div>
      ),
    },
    {
      id:    'troubleshooting',
      icon:  Zap,
      title: 'Troubleshooting',
      body: (
        <ul className="hp-ul">
          <li><b>413 on typography generate</b> — your screenshots were too large; we now downscale + JPEG-compress before upload.</li>
          <li><b>Editor iframe shows old CSS</b> — hard-reload (⌘⇧R / Ctrl+F5). Every release bumps a cache-buster, but very aggressive proxies can still pin.</li>
          <li><b>Auto-save says &quot;Unsaved&quot; forever</b> — open DevTools, watch the Network tab; failed save? Refresh, then re-save manually.</li>
          <li><b>Generated asset never lands</b> — check your credit balance; the generation may have hit the cap. Top up from <Link href={`/${orgSlug}/settings/billing`} className="hp-link">Billing</Link>.</li>
        </ul>
      ),
    },
    {
      id:    'contact',
      icon:  Mail,
      title: 'Contact &amp; status',
      body: (
        <>
          <p className="hp-p">
            Found a bug or have a feature request? Email <a href="mailto:support@spinative.com" className="hp-link">support@spinative.com</a> with
            your project name and a short description; we usually reply within a working day.
          </p>
          <p className="hp-p">
            Status updates and roadmap: <a href="https://status.spinative.com" target="_blank" rel="noreferrer" className="hp-link">status.spinative.com<ExternalLink size={11} style={{ display: 'inline', verticalAlign: '-1px', marginLeft: 3 }} /></a>
          </p>
        </>
      ),
    },
  ]

  return (
    <div className="hp-shell">
      {/* Page header */}
      <header className="hp-head">
        <div className="hp-eyebrow">Help &amp; docs</div>
        <h1 className="hp-title">Everything you need to ship a slot game.</h1>
        <p className="hp-sub">
          Spinative is a desktop-grade canvas editor paired with an AI generation pipeline.
          The basics fit on one page; deeper guides for individual workflows are linked inline.
        </p>
        <div className="hp-quick-actions">
          <Link href={`/${orgSlug}/dashboard`}     className="hp-quick-btn"><LayoutDashboard size={14} />Dashboard</Link>
          <Link href={`/${orgSlug}/projects`}      className="hp-quick-btn"><FolderOpen      size={14} />Projects</Link>
          <Link href={`/${orgSlug}/settings/general`} className="hp-quick-btn"><SettingsIcon size={14} />Settings</Link>
        </div>
      </header>

      {/* Table of contents */}
      <nav className="hp-toc" aria-label="Help sections">
        {sections.map(s => {
          const I = s.icon
          return (
            <a key={s.id} href={`#${s.id}`} className="hp-toc-link">
              <I size={14} />
              <span dangerouslySetInnerHTML={{ __html: s.title }} />
            </a>
          )
        })}
      </nav>

      {/* Sections */}
      <div className="hp-sections">
        {sections.map(s => {
          const I = s.icon
          return (
            <section id={s.id} className="hp-section" key={s.id}>
              <div className="hp-section-head">
                <span className="hp-section-icon"><I size={16} /></span>
                <h2 className="hp-section-title" dangerouslySetInnerHTML={{ __html: s.title }} />
              </div>
              <div className="hp-section-body">{s.body}</div>
            </section>
          )
        })}
      </div>

      {/* Bottom CTA — always-on contact card */}
      <div className="hp-cta">
        <HelpCircle size={20} style={{ color: '#d7a84f' }} />
        <div>
          <div className="hp-cta-title">Still stuck?</div>
          <div className="hp-cta-sub">
            Drop us a line at <a href="mailto:support@spinative.com" className="hp-link">support@spinative.com</a>.
            Include your project name and what you tried — we&apos;ll reply within one working day.
          </div>
        </div>
      </div>

      {/* Inline styles — single page, no shared component for now. */}
      <style jsx>{`
        .hp-shell {
          max-width: 880px;
          margin: 0 auto;
          padding: 40px 28px 80px;
          color: #f4efe4;
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
        }
        .hp-head { margin-bottom: 28px; }
        .hp-eyebrow {
          font-size: 10px; font-weight: 800; letter-spacing: .18em;
          text-transform: uppercase; color: #f0ca79;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          margin-bottom: 14px;
        }
        .hp-title {
          font-size: clamp(28px, 3.6vw, 42px);
          font-weight: 800; letter-spacing: -.04em; line-height: 1.05;
          margin: 0 0 12px;
        }
        .hp-sub {
          color: #a5afc0; font-size: 14px; line-height: 1.7;
          max-width: 56ch; margin: 0 0 22px;
        }
        .hp-quick-actions { display: flex; flex-wrap: wrap; gap: 8px; }
        .hp-quick-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 7px 12px; border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.025);
          color: #a5afc0; font-size: 12px; font-weight: 600;
          text-decoration: none; transition: all .15s;
        }
        .hp-quick-btn:hover {
          color: #f4efe4; border-color: rgba(215,168,79,0.3);
          background: rgba(215,168,79,0.06);
        }

        .hp-toc {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 6px; padding: 14px;
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 14px;
          background: rgba(15,17,24,0.85);
          margin-bottom: 36px;
        }
        .hp-toc-link {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 7px 10px; border-radius: 8px;
          color: #a5afc0; font-size: 12.5px; font-weight: 500;
          text-decoration: none; transition: all .15s;
        }
        .hp-toc-link:hover { color: #f4efe4; background: rgba(255,255,255,0.04); }

        .hp-sections { display: flex; flex-direction: column; gap: 28px; }
        .hp-section {
          padding: 22px 24px;
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 14px;
          background:
            radial-gradient(120% 60% at 0% 0%, rgba(215,168,79,0.05), transparent 55%),
            linear-gradient(180deg, rgba(22,27,41,0.85), rgba(14,18,29,0.85));
          scroll-margin-top: 24px;
        }
        .hp-section-head {
          display: flex; align-items: center; gap: 10px;
          margin-bottom: 14px; padding-bottom: 12px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .hp-section-icon {
          display: inline-flex; align-items: center; justify-content: center;
          width: 32px; height: 32px; border-radius: 10px;
          background: rgba(215,168,79,0.08);
          border: 1px solid rgba(215,168,79,0.18);
          color: #d7a84f; flex-shrink: 0;
        }
        .hp-section-title {
          font-size: 17px; font-weight: 700; letter-spacing: -.01em;
          margin: 0; color: #f4efe4;
        }
        .hp-section-body { color: #a5afc0; font-size: 14px; line-height: 1.7; }
        .hp-section-body :global(b) { color: #f4efe4; font-weight: 600; }
        .hp-link { color: #f0ca79; text-decoration: underline; text-underline-offset: 2px; }
        .hp-link:hover { color: #d7a84f; }

        .hp-p   { margin: 0 0 12px; }
        .hp-p:last-child { margin-bottom: 0; }
        .hp-ol, .hp-ul {
          margin: 0; padding-left: 20px;
          display: flex; flex-direction: column; gap: 8px;
        }
        .hp-ol li, .hp-ul li { line-height: 1.6; }

        /* Keyboard shortcuts grid */
        .hp-shortcuts {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 8px;
        }
        .hp-shortcut-row {
          display: grid; grid-template-columns: 130px 1fr;
          gap: 12px; align-items: center;
          padding: 7px 10px; border-radius: 8px;
          background: rgba(255,255,255,0.025);
          border: 1px solid rgba(255,255,255,0.06);
        }
        .hp-kbd {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px; color: #f0ca79;
          padding: 3px 8px; border-radius: 5px;
          background: rgba(215,168,79,0.10);
          border: 1px solid rgba(215,168,79,0.22);
          text-align: center; white-space: nowrap;
        }
        .hp-shortcut-desc { font-size: 12.5px; color: #a5afc0; }

        .hp-cta {
          margin-top: 36px; padding: 20px 24px;
          display: flex; align-items: flex-start; gap: 14px;
          border: 1px solid rgba(215,168,79,0.20);
          border-radius: 14px;
          background:
            radial-gradient(140% 60% at 0% 100%, rgba(215,168,79,0.08), transparent 55%),
            linear-gradient(180deg, rgba(22,27,41,0.85), rgba(14,18,29,0.85));
        }
        .hp-cta-title { font-size: 14px; font-weight: 700; color: #f4efe4; margin-bottom: 4px; }
        .hp-cta-sub   { font-size: 13px; color: #a5afc0; line-height: 1.6; }
      `}</style>
    </div>
  )
}
