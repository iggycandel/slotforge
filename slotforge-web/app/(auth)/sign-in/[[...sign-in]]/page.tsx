import { SignIn } from '@clerk/nextjs'
import Link from 'next/link'

export const metadata = { title: 'Sign in · Spinative' }

export default function SignInPage() {
  return (
    <div
      className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden"
      style={{ background: '#07080d' }}
    >
      {/* Grid texture */}
      <div className="absolute inset-0 bg-grid pointer-events-none" />

      {/* Gold glow — top left */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: '-10%', left: '-10%',
          width: '55%', height: '55%',
          background: 'radial-gradient(ellipse, rgba(215,168,79,0.13) 0%, transparent 65%)',
        }}
      />

      {/* Purple glow — bottom right */}
      <div
        className="absolute pointer-events-none"
        style={{
          bottom: '-10%', right: '-10%',
          width: '55%', height: '55%',
          background: 'radial-gradient(ellipse, rgba(123,116,255,0.10) 0%, transparent 65%)',
        }}
      />

      {/* Content */}
      <div className="relative z-10 w-full max-w-md px-4 flex flex-col items-center gap-8">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 group">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/spinative-logo.png"
            alt="Spinative"
            style={{ height: 36, width: 'auto', objectFit: 'contain' }}
          />
        </Link>

        {/* Tagline */}
        <p style={{ color: '#a5afc0', fontSize: 14, textAlign: 'center', marginTop: -16 }}>
          The AI-powered slot game studio
        </p>

        {/* Clerk sign-in card */}
        <div className="w-full">
          <SignIn
            appearance={{
              variables: {
                colorPrimary:       '#d7a84f',
                colorBackground:    'transparent',
                colorInputBackground:'rgba(255,255,255,0.04)',
                colorInputText:     '#f4efe4',
                colorText:          '#f4efe4',
                colorTextSecondary: '#a5afc0',
                borderRadius:       '12px',
                fontFamily:         'Inter, system-ui, sans-serif',
              },
              elements: {
                rootBox:           'w-full',
                card:              'bg-[#0f1118]/90 border border-white/[0.07] rounded-2xl shadow-2xl backdrop-blur-xl',
                headerTitle:       'text-[#f4efe4] font-bold',
                headerSubtitle:    'text-[#a5afc0]',
                formFieldLabel:    'text-[#a5afc0] text-xs font-medium',
                formFieldInput:    'bg-white/[0.04] border-white/10 text-[#f4efe4] rounded-xl focus:border-[#d7a84f]/40',
                formButtonPrimary: 'bg-gradient-to-r from-[#d7a84f] to-[#f0ca79] text-[#07080d] font-bold rounded-xl shadow-lg hover:shadow-[#d7a84f]/30',
                footerActionLink:  'text-[#d7a84f] hover:text-[#f0ca79]',
                dividerLine:       'bg-white/[0.07]',
                dividerText:       'text-[#7d8799]',
                socialButtonsBlockButton: 'bg-white/[0.04] border-white/10 text-[#f4efe4] rounded-xl hover:bg-white/[0.07]',
                identityPreviewText: 'text-[#a5afc0]',
                identityPreviewEditButton: 'text-[#d7a84f]',
              },
            }}
          />
        </div>

        {/* Footer link */}
        <p style={{ color: '#7d8799', fontSize: 12, textAlign: 'center' }}>
          Don&apos;t have an account?{' '}
          <Link href="/sign-up" style={{ color: '#d7a84f', textDecoration: 'none', fontWeight: 500 }}>
            Sign up free
          </Link>
        </p>
      </div>
    </div>
  )
}
