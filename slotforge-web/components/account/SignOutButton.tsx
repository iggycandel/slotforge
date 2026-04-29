'use client'
//
// Single-purpose client component used by the Account page footer.
// Wraps Clerk's <SignOutButton> with the design-system pill styling so
// the sign-out CTA matches the rest of the app surface (gold-tinted
// border, subtle hover lift).
//

import { SignOutButton as ClerkSignOutButton } from '@clerk/nextjs'
import { LogOut } from 'lucide-react'

export function SignOutButton() {
  return (
    <ClerkSignOutButton redirectUrl="/sign-in">
      <button
        type="button"
        style={{
          display:        'inline-flex',
          alignItems:     'center',
          gap:            8,
          padding:        '9px 18px',
          borderRadius:   999,
          border:         '1px solid rgba(239,122,122,0.30)',
          background:     'rgba(239,122,122,0.06)',
          color:          '#ef9a9a',
          fontFamily:     'inherit',
          fontSize:       13,
          fontWeight:     600,
          cursor:         'pointer',
          whiteSpace:     'nowrap',
          transition:     'transform .18s, box-shadow .18s, background .18s, border-color .18s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform   = 'translateY(-1px)'
          e.currentTarget.style.borderColor = 'rgba(239,122,122,0.45)'
          e.currentTarget.style.background  = 'rgba(239,122,122,0.10)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform   = 'translateY(0)'
          e.currentTarget.style.borderColor = 'rgba(239,122,122,0.30)'
          e.currentTarget.style.background  = 'rgba(239,122,122,0.06)'
        }}
      >
        <LogOut size={13} /> Sign out
      </button>
    </ClerkSignOutButton>
  )
}
