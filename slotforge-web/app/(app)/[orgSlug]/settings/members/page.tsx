import { OrganizationProfile } from '@clerk/nextjs'

export const metadata = { title: 'Members · Settings' }

/**
 * Clerk's built-in OrganizationProfile component handles:
 * - invite by email
 * - role assignment (admin / member)
 * - pending invitations
 * - member removal
 *
 * Styled to match Spinative's dark theme via appearance props.
 */
export default function MembersPage() {
  return (
    <div className="max-w-3xl">
      <OrganizationProfile
        appearance={{
          elements: {
            rootBox:                    'w-full',
            card:                       'bg-transparent border-0 shadow-none p-0',
            navbar:                     'hidden',
            pageScrollBox:              'p-0',
            profilePage__members:       'p-0',
            formButtonPrimary:          'bg-sf-gold text-[#1a1200] font-semibold hover:opacity-90',
            formFieldInput:             'bg-sf-bg border-sf-border text-sf-text',
            tableHead:                  'text-sf-muted text-xs uppercase tracking-wider',
            membersPageInviteButton:    'bg-sf-gold text-[#1a1200] font-semibold',
          },
        }}
      />
    </div>
  )
}
