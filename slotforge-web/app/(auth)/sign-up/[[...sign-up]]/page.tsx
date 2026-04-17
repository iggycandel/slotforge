import { SignUp } from '@clerk/nextjs'
import Link from 'next/link'

export const metadata = { title: 'Create account · Spinative' }

export default function SignUpPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#07080d',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Grid texture */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.013) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.013) 1px,transparent 1px)',
        backgroundSize: '40px 40px',
      }} />

      {/* Gold glow — top left */}
      <div style={{
        position: 'absolute', top: '-10%', left: '-10%',
        width: '55%', height: '55%', pointerEvents: 'none',
        background: 'radial-gradient(ellipse,rgba(215,168,79,0.13) 0%,transparent 65%)',
      }} />

      {/* Purple glow — bottom right */}
      <div style={{
        position: 'absolute', bottom: '-10%', right: '-10%',
        width: '55%', height: '55%', pointerEvents: 'none',
        background: 'radial-gradient(ellipse,rgba(123,116,255,0.10) 0%,transparent 65%)',
      }} />

      {/* Content column */}
      <div style={{
        position: 'relative', zIndex: 10,
        width: '100%', maxWidth: 420,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 20,
      }}>
        {/* Logo */}
        <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/spinative-logo.png"
            alt="Spinative"
            style={{ height: 32, width: 'auto', objectFit: 'contain' }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none'
            }}
          />
        </Link>

        <p style={{ color: '#a5afc0', fontSize: 13, textAlign: 'center', margin: 0 }}>
          Start building slot games with AI
        </p>

        {/* Clerk sign-up card */}
        <div style={{ width: '100%' }}>
          <SignUp
            appearance={{
              variables: {
                colorPrimary:        '#d7a84f',
                colorBackground:     '#0f1118',
                colorInputBackground: 'rgba(255,255,255,0.04)',
                colorInputText:      '#f4efe4',
                colorText:           '#f4efe4',
                colorTextSecondary:  '#a5afc0',
                borderRadius:        '12px',
                fontFamily:          'Inter, system-ui, sans-serif',
              },
              elements: {
                rootBox:     'w-full',
                card:        'shadow-2xl',
                formButtonPrimary: 'font-bold',
                footerActionLink: 'text-[#d7a84f]',
              },
            }}
          />
        </div>

        {/* Footer link */}
        <p style={{ color: '#7d8799', fontSize: 12, textAlign: 'center', margin: 0 }}>
          Already have an account?{' '}
          <Link href="/sign-in" style={{ color: '#d7a84f', textDecoration: 'none', fontWeight: 500 }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
