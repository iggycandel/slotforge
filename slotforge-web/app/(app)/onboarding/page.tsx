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
    <main style={{ minHeight: '100vh', background: '#0d0d14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#9090b0', fontFamily: 'sans-serif' }}>Entering Spinative…</p>
    </main>
  )
}
