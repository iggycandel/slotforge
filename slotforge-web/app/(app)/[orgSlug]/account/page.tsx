//
// Spinative — Account page
// ---------------------------------------------------------------------------
// First-class /account page. Replaces the Clerk-popup-only experience the
// sidebar avatar provided. Server component so the user / workspace / plan
// / credit / project-count info paints on first response — no client-side
// fetch dance for read-only data.
//
// Live edits (profile name, email, password, MFA) still route through Clerk's
// hosted account portal — link buttons open it in a new tab so we don't
// rebuild profile management ourselves.
//

import { auth, clerkClient }       from '@clerk/nextjs/server'
import { redirect }                from 'next/navigation'
import Link                        from 'next/link'
import {
  User      as UserIcon,
  Mail,
  Building2,
  Sparkles,
  CreditCard,
  ShieldCheck,
  ExternalLink,
  Calendar,
  ArrowRight,
  FolderOpen,
}                                  from 'lucide-react'
import { createAdminClient }       from '@/lib/supabase/admin'
import { getOrgPlan,
         getOrgCreditStatus }      from '@/lib/billing/subscription'
import { PLANS }                   from '@/lib/billing/plans'
import { SignOutButton }           from '@/components/account/SignOutButton'

interface Props { params: Promise<{ orgSlug: string }> }

export const metadata = { title: 'Account · Spinative' }
export const dynamic  = 'force-dynamic'

export default async function AccountPage({ params }: Props) {
  const { orgSlug } = await params
  const { userId, orgId } = await auth()
  if (!userId) redirect('/sign-in')

  // ── User profile from Clerk ─────────────────────────────────────────────
  const client = await clerkClient()
  const user   = await client.users.getUser(userId)
  const email  = user.emailAddresses[0]?.emailAddress ?? ''
  const name   = [user.firstName, user.lastName].filter(Boolean).join(' ') || email.split('@')[0]
  const initials = (user.firstName?.[0] ?? email[0] ?? '?').toUpperCase()
  const avatar = user.imageUrl
  const lastSignIn = user.lastSignInAt
    ? new Date(user.lastSignInAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
    : null
  const memberSince = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-GB', { dateStyle: 'medium' })
    : null

  // ── Workspace + plan + credits ──────────────────────────────────────────
  const effectiveId = orgId ?? userId
  const supabase    = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const [{ data: ws }, plan, credits, { count: projectCount }] = await Promise.all([
    sb.from('workspaces').select('name, slug').eq('clerk_org_id', userId).maybeSingle(),
    getOrgPlan(effectiveId),
    getOrgCreditStatus(effectiveId),
    sb.from('projects').select('id', { count: 'exact', head: true })
      .eq('user_id', userId),
  ])

  const planInfo = PLANS[plan]

  return (
    <div style={{
      maxWidth: 920,
      margin:   '0 auto',
      padding:  '40px 28px 80px',
      color:    '#f4efe4',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    }}>
      {/* ── Header — avatar + name + email ────────────────────────────────── */}
      <header style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.18em', textTransform: 'uppercase', color: '#f0ca79', fontFamily: 'JetBrains Mono, ui-monospace, monospace', marginBottom: 14 }}>
          Account
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            border: '1px solid rgba(215,168,79,0.32)',
            background:
              'linear-gradient(135deg, rgba(215,168,79,0.18), rgba(240,202,121,0.10))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 26, fontWeight: 800, color: '#f0ca79',
            overflow: 'hidden', flexShrink: 0,
          }}>
            {avatar
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : initials}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.025em', margin: 0, color: '#f4efe4' }}>{name}</h1>
            <div style={{ fontSize: 13, color: '#a5afc0', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Mail size={12} /> {email}
            </div>
          </div>
        </div>
      </header>

      {/* ── Stat strip — quick at-a-glance ────────────────────────────────── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 12, marginBottom: 32,
      }}>
        <Stat label="Plan"           value={planInfo.name} hint={planInfo.price + (planInfo.period || '')} />
        <Stat label="Credits"        value={credits.included > 0 ? `${Math.max(0, credits.included - credits.used)} / ${credits.included}` : '—'} hint={credits.included > 0 ? 'remaining this month' : 'no plan'} />
        <Stat label="Projects"       value={String(projectCount ?? 0)} hint="in this workspace" />
        <Stat label="Workspace"      value={ws?.name ?? orgSlug} hint={`/${orgSlug}`} />
      </div>

      {/* ── Profile card — Clerk-managed ──────────────────────────────────── */}
      <Card icon={<UserIcon size={16} />} title="Profile" action={
        <ExternalLinkBtn href="https://accounts.spinative.com/user" label="Manage in Clerk" />
      }>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Name"  value={name} />
          <Field label="Email" value={email} />
          {memberSince && <Field label="Member since" value={memberSince} icon={<Calendar size={11} />} />}
          {lastSignIn  && <Field label="Last sign-in" value={lastSignIn}  icon={<ShieldCheck size={11} />} />}
        </div>
      </Card>

      {/* ── Workspace card ────────────────────────────────────────────────── */}
      <Card icon={<Building2 size={16} />} title="Workspace" action={
        <Link href={`/${orgSlug}/settings/general`} style={btnStyle}>
          Workspace settings <ArrowRight size={12} />
        </Link>
      }>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Name" value={ws?.name ?? orgSlug} />
          <Field label="Slug" value={`/${orgSlug}`} mono />
        </div>
        <p style={{ fontSize: 12, color: '#a5afc0', lineHeight: 1.6, margin: '14px 0 0' }}>
          Switching workspaces moves you between separate billing + project sets. Each workspace
          has its own AI credits and member roster.
        </p>
      </Card>

      {/* ── Plan + credits card ───────────────────────────────────────────── */}
      <Card icon={<Sparkles size={16} />} title="Plan &amp; credits" action={
        <Link href={`/${orgSlug}/settings/billing`} style={btnStyle}>
          Manage billing <ArrowRight size={12} />
        </Link>
      }>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', padding: '5px 12px',
            borderRadius: 999, fontSize: 11, fontWeight: 800,
            letterSpacing: '.10em', textTransform: 'uppercase',
            background: plan === 'free'      ? 'rgba(255,255,255,0.04)' :
                       plan === 'freelancer' ? 'rgba(215,168,79,0.10)' :
                                                'rgba(123,116,255,0.10)',
            color: plan === 'free'      ? '#a5afc0' :
                   plan === 'freelancer' ? '#f0ca79' :
                                            '#a59cff',
            border: `1px solid ${
              plan === 'free'      ? 'rgba(255,255,255,0.10)' :
              plan === 'freelancer' ? 'rgba(215,168,79,0.30)' :
                                      'rgba(123,116,255,0.30)'
            }`,
          }}>
            {planInfo.name}
          </span>
          <span style={{ fontSize: 14, color: '#a5afc0' }}>
            {planInfo.price}{planInfo.period}
          </span>
        </div>

        {credits.included > 0 ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#a5afc0', marginBottom: 6 }}>
              <span>AI credits used this month</span>
              <span style={{ color: credits.used / credits.included >= 0.8 ? '#ef7a7a' : '#f4efe4', fontWeight: 600 }}>
                {credits.used} / {credits.included}
              </span>
            </div>
            <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${Math.min(100, (credits.used / credits.included) * 100)}%`,
                background: credits.used / credits.included >= 0.8
                  ? 'linear-gradient(90deg, #ef7a7a, #ff9a9a)'
                  : 'linear-gradient(90deg, #d7a84f, #f0ca79)',
                transition: 'width .3s',
              }} />
            </div>
          </>
        ) : (
          <p style={{ fontSize: 12, color: '#a5afc0', margin: 0 }}>
            Upgrade to unlock AI generation, marketing kit, and exports.
          </p>
        )}
      </Card>

      {/* ── Quick links card ──────────────────────────────────────────────── */}
      <Card icon={<FolderOpen size={16} />} title="Quick links">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <QuickLink href={`/${orgSlug}/dashboard`}        label="Dashboard"        sub="Your projects + new" />
          <QuickLink href={`/${orgSlug}/projects`}         label="All projects"     sub="Search + sort" />
          <QuickLink href={`/${orgSlug}/settings/general`} label="Workspace"        sub="Name, members" />
          <QuickLink href={`/${orgSlug}/settings/billing`} label="Billing"          sub="Plan, top-ups" icon={<CreditCard size={13} />} />
          <QuickLink href={`/${orgSlug}/help`}             label="Help &amp; docs"  sub="Shortcuts, FAQs" />
          <QuickLink href="https://accounts.spinative.com" label="Security"         sub="Password, 2FA" external icon={<ShieldCheck size={13} />} />
        </div>
      </Card>

      {/* ── Sign out ──────────────────────────────────────────────────────── */}
      <div style={{
        marginTop: 28, padding: '18px 22px',
        border: '1px solid rgba(239,122,122,0.20)',
        borderRadius: 14,
        background: 'linear-gradient(180deg, rgba(22,27,41,0.85), rgba(14,18,29,0.85))',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14,
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f4efe4', marginBottom: 2 }}>Sign out of Spinative</div>
          <div style={{ fontSize: 12, color: '#a5afc0', lineHeight: 1.55 }}>
            You&apos;ll be redirected to the sign-in page. Your work is autosaved.
          </div>
        </div>
        <SignOutButton />
      </div>
    </div>
  )
}

// ─── Reusable bits ─────────────────────────────────────────────────────────
//
// Inline styles via plain objects — server component can't use styled-jsx
// in the same straightforward way as the help page. Each helper is small
// enough that a shared design-system primitive isn't worth it yet.

const btnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '7px 12px', borderRadius: 999,
  border: '1px solid rgba(215,168,79,0.30)',
  background: 'rgba(215,168,79,0.06)',
  color: '#f0ca79', fontSize: 12, fontWeight: 600,
  textDecoration: 'none', whiteSpace: 'nowrap',
  fontFamily: 'inherit',
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={{
      padding: '14px 16px',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 12,
      background: 'linear-gradient(180deg, rgba(22,27,41,0.85), rgba(14,18,29,0.85))',
    }}>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.16em', textTransform: 'uppercase', color: '#7d8799', fontFamily: 'JetBrains Mono, ui-monospace, monospace', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.01em', color: '#f4efe4' }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: '#a5afc0', marginTop: 4 }}>{hint}</div>}
    </div>
  )
}

function Card({
  icon, title, action, children,
}: {
  icon:    React.ReactNode
  title:   string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section style={{
      marginBottom: 18,
      padding: '20px 22px',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 14,
      background:
        'radial-gradient(120% 60% at 0% 0%, rgba(215,168,79,0.04), transparent 55%), ' +
        'linear-gradient(180deg, rgba(22,27,41,0.85), rgba(14,18,29,0.85))',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 30, height: 30, borderRadius: 10,
          background: 'rgba(215,168,79,0.08)',
          border: '1px solid rgba(215,168,79,0.18)',
          color: '#d7a84f',
        }}>{icon}</span>
        <h2 style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.01em', margin: 0, color: '#f4efe4', flex: 1 }} dangerouslySetInnerHTML={{ __html: title }} />
        {action}
      </div>
      <div>{children}</div>
    </section>
  )
}

function Field({ label, value, mono, icon }: { label: string; value: string; mono?: boolean; icon?: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: '#7d8799', fontFamily: 'JetBrains Mono, ui-monospace, monospace', marginBottom: 6 }}>{label}</div>
      <div style={{
        fontSize: 13, color: '#f4efe4',
        fontFamily: mono ? 'JetBrains Mono, ui-monospace, monospace' : 'inherit',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        {icon && <span style={{ color: '#a5afc0' }}>{icon}</span>}
        <span>{value}</span>
      </div>
    </div>
  )
}

function QuickLink({
  href, label, sub, external, icon,
}: { href: string; label: string; sub: string; external?: boolean; icon?: React.ReactNode }) {
  const linkProps = external
    ? { href, target: '_blank' as const, rel: 'noreferrer' as const }
    : { href }
  const Tag = external ? 'a' : Link
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <Tag {...(linkProps as any)} style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '12px 14px', borderRadius: 10,
      border: '1px solid rgba(255,255,255,0.06)',
      background: 'rgba(255,255,255,0.025)',
      color: '#f4efe4', fontSize: 13, fontWeight: 600,
      textDecoration: 'none', minWidth: 0,
    }}>
      {icon && <span style={{ color: '#a5afc0', flexShrink: 0 }}>{icon}</span>}
      <span style={{ flex: 1, minWidth: 0 }}>
        <div dangerouslySetInnerHTML={{ __html: label }} />
        <div style={{ fontSize: 11, color: '#a5afc0', fontWeight: 400, marginTop: 1 }}>{sub}</div>
      </span>
      {external
        ? <ExternalLink size={12} style={{ color: '#a5afc0', flexShrink: 0 }} />
        : <ArrowRight   size={12} style={{ color: '#a5afc0', flexShrink: 0 }} />
      }
    </Tag>
  )
}

function ExternalLinkBtn({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" style={btnStyle}>
      {label} <ExternalLink size={12} />
    </a>
  )
}
