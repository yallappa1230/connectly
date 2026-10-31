import { redirect } from 'next/navigation'
import { ConnectlyShell } from '@/components/connectly-shell'
import { createClient } from '@/lib/supabase/server'

export default async function HomePage() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()

  if (error || !data.user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, full_name, avatar_url, created_at')
    .eq('id', data.user.id)
    .maybeSingle()

  return (
    <ConnectlyShell
      userId={data.user.id}
      email={data.user.email ?? ''}
      initialProfile={profile ?? {
        id: data.user.id,
        username: `user_${data.user.id.replaceAll('-', '').slice(0, 12)}`,
        full_name: '',
        avatar_url: null,
        created_at: new Date().toISOString(),
      }}
    />
  )
}
