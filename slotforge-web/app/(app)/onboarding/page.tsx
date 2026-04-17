'use client'
import { useUser } from '@clerk/nextjs'
import { useEffect } from 'react'

export default function OnboardingPage() {
  const { user, isLoaded } = useUser()

  useEffect(() => {
    if (isLoaded && user) {
      window.location.href = '/' + user.id + '/dashboard'
    } else if (isLoaded && !user) {
      window.location.href = '/sign-in'
    }
  }, [isLoaded, user])

  return (
    <main style={{
      minHeight: '100vh', background: '#07080d',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 16,
    }}>
      {/* Spinner */}
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        border: '3px solid rgba(215,168,79,0.15)',
        borderTopColor: '#d7a84f',
        animation: 'spin 0.8s linear infinite',
      }} />
      <p style={{ color: '#7d8799', fontSize: 14, fontFamily: 'Inter, sans-serif' }}>
        Entering Spinative…
      </p>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </main>
  )
}
