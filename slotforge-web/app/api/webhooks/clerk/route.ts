import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Clerk webhook handler — syncs org and user events into Supabase.
 *
 * Configured in Clerk Dashboard → Webhooks → Add endpoint
 * Events to subscribe: organization.created, organization.updated,
 *                      organization.deleted, organizationMembership.*
 *
 * Requires: npm install svix
 */
export async function POST(request: Request) {
  const headerPayload = await headers()
  const svixId        = headerPayload.get('svix-id')
  const svixTimestamp = headerPayload.get('svix-timestamp')
  const svixSignature = headerPayload.get('svix-signature')

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing svix headers' }, { status: 400 })
  }

  const body = await request.text()
  const secret = process.env.CLERK_WEBHOOK_SECRET

  if (!secret) {
    console.error('CLERK_WEBHOOK_SECRET is not set')
    return NextResponse.json({ error: 'Webhook secret missing' }, { status: 500 })
  }

  let event: { type: string; data: Record<string, unknown> }
  try {
    const wh = new Webhook(secret)
    event = wh.verify(body, {
      'svix-id':        svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as typeof event
  } catch (err) {
    console.error('[clerk webhook] verification failed', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = createAdminClient()

  switch (event.type) {
    case 'organization.created': {
      const org = event.data as {
        id: string; name: string; slug: string
      }
      await supabase.from('workspaces').upsert({
        clerk_org_id: org.id,
        name:         org.name,
        slug:         org.slug,
        plan:         'free',
      }, { onConflict: 'clerk_org_id' })
      break
    }

    case 'organization.updated': {
      const org = event.data as {
        id: string; name: string; slug: string
      }
      await supabase
        .from('workspaces')
        .update({ name: org.name, slug: org.slug })
        .eq('clerk_org_id', org.id)
      break
    }

    case 'organization.deleted': {
      const org = event.data as { id: string }
      // Cascade deletes projects/assets via FK constraints
      await supabase
        .from('workspaces')
        .delete()
        .eq('clerk_org_id', org.id)
      break
    }

    // Membership events — currently just logged
    // Extend here to maintain a local workspace_members cache if needed
    case 'organizationMembership.created':
    case 'organizationMembership.deleted':
    case 'organizationMembership.updated':
      console.info(`[clerk webhook] ${event.type}`, event.data)
      break

    default:
      console.info(`[clerk webhook] unhandled event: ${event.type}`)
  }

  return NextResponse.json({ received: true })
}
