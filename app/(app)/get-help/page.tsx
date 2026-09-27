import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function GetHelpPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: contacts }, { data: team }] = await Promise.all([
    supabase
      .from('emergency_contacts')
      .select('id,name,relationship,phone')
      .eq('active', true)
      .order('name'),
    supabase.from('care_team').select('id,role,name,phone').order('name'),
  ])

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-3xl font-bold text-text-primary">Get Help</h1>
      <p className="mt-2 text-lg text-text-secondary">
        If this is an emergency, call your local emergency number right away.
      </p>

      <a
        href="tel:911"
        className="mt-6 block rounded-2xl bg-danger px-6 py-5 text-center text-2xl font-bold text-white"
      >
        Call 911 Now
      </a>
      <p className="mt-3 text-text-secondary">
        Chest pain, trouble breathing, sudden numbness or weakness, trouble
        speaking, vision changes, or fainting — do not wait. Call now.
      </p>

      <h2 className="mt-10 text-xl font-bold text-text-primary">
        My emergency contacts
      </h2>
      {!contacts?.length ? (
        <p className="mt-2 text-text-secondary">
          No emergency contacts yet. Add them in{' '}
          <Link href="/settings" className="underline">
            Settings
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {contacts.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between rounded-xl bg-surface p-4"
            >
              <div>
                <div className="font-semibold text-text-primary">{c.name}</div>
                {c.relationship && (
                  <div className="text-sm text-text-secondary">{c.relationship}</div>
                )}
              </div>
              <a
                href={`tel:${c.phone}`}
                className="rounded-xl bg-primary px-5 py-3 font-semibold text-white"
              >
                Call
              </a>
            </li>
          ))}
        </ul>
      )}

      {!!team?.length && (
        <>
          <h2 className="mt-10 text-xl font-bold text-text-primary">My care team</h2>
          <ul className="mt-3 space-y-3">
            {team.map((m) => (
              <li key={m.id} className="rounded-xl bg-surface p-4">
                <div className="font-semibold text-text-primary">{m.name}</div>
                <div className="text-sm text-text-secondary">{m.role}</div>
                {m.phone && (
                  <a href={`tel:${m.phone}`} className="mt-1 inline-block font-semibold text-primary underline">
                    {m.phone}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  )
}
