'use client'

import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Profile = { id: string; username: string; full_name: string | null; avatar_url: string | null; created_at?: string }
type RequestRow = { id: string; sender_id: string; receiver_id: string; status: 'pending'|'accepted'|'declined'|'cancelled'; created_at: string; person?: Profile }
type FriendRow = { requestId: string; person: Profile }
type BlockRow = { blocker_id: string; blocked_id: string; created_at: string; person?: Profile }
type Tab = 'discover'|'friends'|'requests'|'profile'

const emptyProfile: Profile = { id: '', username: '', full_name: '', avatar_url: null }
const nameOf = (p?: Profile | null) => p?.full_name?.trim() || (p?.username ? `@${p.username}` : 'Connectly member')
const initialOf = (p?: Profile | null) => nameOf(p).replace(/^@/, '').slice(0, 1).toUpperCase() || 'C'

export function ConnectlyShell({ userId, email, initialProfile }: { userId: string; email: string; initialProfile: Profile }) {
  const supabase = useMemo(() => createClient(), [])
  const [tab, setTab] = useState<Tab>('discover')
  const [profile, setProfile] = useState<Profile>(initialProfile ?? emptyProfile)
  const [incoming, setIncoming] = useState<RequestRow[]>([])
  const [outgoing, setOutgoing] = useState<RequestRow[]>([])
  const [friends, setFriends] = useState<FriendRow[]>([])
  const [blocks, setBlocks] = useState<BlockRow[]>([])
  const [results, setResults] = useState<Profile[]>([])
  const [query, setQuery] = useState('')
  const [fullName, setFullName] = useState(initialProfile?.full_name ?? '')
  const [username, setUsername] = useState(initialProfile?.username ?? '')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    const [p, i, o, a, b] = await Promise.all([
      supabase.from('profiles').select('id,username,full_name,avatar_url,created_at').eq('id', userId).maybeSingle(),
      supabase.from('friend_requests').select('id,sender_id,receiver_id,status,created_at').eq('receiver_id', userId).eq('status', 'pending').order('created_at', { ascending: false }),
      supabase.from('friend_requests').select('id,sender_id,receiver_id,status,created_at').eq('sender_id', userId).eq('status', 'pending').order('created_at', { ascending: false }),
      supabase.from('friend_requests').select('id,sender_id,receiver_id,status,created_at').eq('status', 'accepted').or(`sender_id.eq.${userId},receiver_id.eq.${userId}`),
      supabase.from('user_blocks').select('blocker_id,blocked_id,created_at').or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`),
    ])
    if (p.data) { setProfile(p.data as Profile); setFullName(p.data.full_name ?? ''); setUsername(p.data.username ?? '') }
    const incomingRows = (i.data ?? []) as RequestRow[]
    const outgoingRows = (o.data ?? []) as RequestRow[]
    const acceptedRows = (a.data ?? []) as RequestRow[]
    const blockRows = (b.data ?? []) as BlockRow[]
    const ownBlocks = blockRows.filter((row) => row.blocker_id === userId)
    const blockedIds = new Set(blockRows.map((row) => row.blocker_id === userId ? row.blocked_id : row.blocker_id))
    const ids = [...new Set([
      ...incomingRows.map((row) => row.sender_id),
      ...outgoingRows.map((row) => row.receiver_id),
      ...acceptedRows.map((row) => row.sender_id === userId ? row.receiver_id : row.sender_id),
      ...ownBlocks.map((row) => row.blocked_id),
    ])].filter((id) => !blockedIds.has(id) || ownBlocks.some((row) => row.blocked_id === id))
    const peopleRes = ids.length
      ? await supabase.from('profiles').select('id,username,full_name,avatar_url,created_at').in('id', ids)
      : { data: [] as Profile[] }
    const people = new Map(((peopleRes.data ?? []) as Profile[]).map((person) => [person.id, person]))
    setBlocks(ownBlocks.map((row) => ({ ...row, person: people.get(row.blocked_id) })))
    setIncoming(incomingRows.filter((row) => !blockedIds.has(row.sender_id) && people.has(row.sender_id)).map((row) => ({ ...row, person: people.get(row.sender_id) })))
    setOutgoing(outgoingRows.filter((row) => !blockedIds.has(row.receiver_id) && people.has(row.receiver_id)).map((row) => ({ ...row, person: people.get(row.receiver_id) })))
    setFriends(acceptedRows.filter((row) => {
      const other = row.sender_id === userId ? row.receiver_id : row.sender_id
      return !blockedIds.has(other) && people.has(other)
    }).map((row) => ({ requestId: row.id, person: people.get(row.sender_id === userId ? row.receiver_id : row.sender_id)! })))
    setLoading(false)
  }, [supabase, userId])

  useEffect(() => { void refresh() }, [refresh])
  function clearFeedback() { setMessage(''); setError('') }

  async function runAction(action: () => Promise<void>, success: string) {
    setBusy(true); clearFeedback()
    try { await action(); setMessage(success); await refresh() }
    catch (e) {
      if (e && typeof e === 'object' && 'code' in e) {
        const code = String((e as { code?: unknown }).code ?? '')
        if (code === '42501') {
          setError('Supabase denied this action. Please sign out and sign in again, then retry.')
        } else if (code === '23505') {
          setError('A pending friend request or friendship already exists for this account.')
        } else if (code === '23503') {
          setError('That account is no longer available. Refresh the page and try again.')
        } else {
          const message = 'message' in e ? String((e as { message?: unknown }).message ?? '') : ''
          setError(message || 'Something went wrong. Please try again.')
        }
      } else if (e instanceof Error) {
        setError(e.message)
      } else {
        setError('Something went wrong. Please try again.')
      }
    }
    finally { setBusy(false) }
  }

  async function searchPeople(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); clearFeedback()
    const term = query.trim().replace(/^@/, '')
    if (term.length < 2) { setError('Enter at least 2 characters of a username.'); setResults([]); return }
    setBusy(true)
    const { data, error: searchError } = await supabase.from('profiles')
      .select('id,username,full_name,avatar_url,created_at').ilike('username', `%${term}%`).neq('id', userId).limit(20)
    setBusy(false)
    if (searchError) { setError(searchError.message); setResults([]); return }
    const known = new Set([...friends.map((x) => x.person.id), ...incoming.map((x) => x.sender_id), ...outgoing.map((x) => x.receiver_id), ...blocks.map((x) => x.blocked_id)])
    setResults(((data ?? []) as Profile[]).filter((person) => !known.has(person.id)))
    if (!data?.length) setMessage('No matching people found. Try another username.')
  }

  async function sendRequest(person: Profile) {
    await runAction(async () => {
      const { error: e } = await supabase.from('friend_requests').insert({ sender_id: userId, receiver_id: person.id })
      if (e) throw e
      setResults((items) => items.filter((x) => x.id !== person.id))
    }, `Friend request sent to ${nameOf(person)}.`)
  }
  async function respond(request: RequestRow, status: 'accepted'|'declined') {
    await runAction(async () => {
      const { error: e } = await supabase.from('friend_requests').update({ status }).eq('id', request.id).eq('receiver_id', userId).eq('status', 'pending')
      if (e) throw e
    }, status === 'accepted' ? `${nameOf(request.person)} is now your friend.` : 'Friend request declined.')
  }
  async function cancelRequest(request: RequestRow) {
    await runAction(async () => {
      const { error: e } = await supabase.from('friend_requests').update({ status: 'cancelled' }).eq('id', request.id).eq('sender_id', userId).eq('status', 'pending')
      if (e) throw e
    }, 'Friend request cancelled.')
  }
  async function unfriend(friend: FriendRow) {
    await runAction(async () => {
      const { error: e } = await supabase.from('friend_requests').update({ status: 'cancelled' }).eq('id', friend.requestId).eq('status', 'accepted')
      if (e) throw e
    }, `${nameOf(friend.person)} removed from friends.`)
  }
  async function blockPerson(person: Profile) {
    await runAction(async () => {
      const { data: related, error: queryError } = await supabase
        .from('friend_requests')
        .select('id,sender_id,receiver_id,status')
        .in('status', ['pending', 'accepted'])
        .or(`and(sender_id.eq.${userId},receiver_id.eq.${person.id}),and(sender_id.eq.${person.id},receiver_id.eq.${userId})`)
      if (queryError) throw queryError

      for (const row of related ?? []) {
        const nextStatus = row.status === 'accepted' || row.sender_id === userId ? 'cancelled' : 'declined'
        const { error: updateError } = await supabase
          .from('friend_requests')
          .update({ status: nextStatus })
          .eq('id', row.id)
          .eq('status', row.status)
        if (updateError) throw updateError
      }

      const { error: blockError } = await supabase
        .from('user_blocks')
        .insert({ blocker_id: userId, blocked_id: person.id })
      if (blockError && !blockError.message.toLowerCase().includes('duplicate')) throw blockError
    }, `${nameOf(person)} has been blocked and removed from your friend connections.`)
    setResults((items) => items.filter((x) => x.id !== person.id))
  }
  async function unblockPerson(block: BlockRow) {
    await runAction(async () => {
      const { error: e } = await supabase.from('user_blocks').delete().eq('blocker_id', userId).eq('blocked_id', block.blocked_id)
      if (e) throw e
    }, 'User unblocked.')
  }
  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const cleanUsername = username.trim().toLowerCase()
    const cleanName = fullName.trim()
    if (!/^[a-z0-9_.]{3,40}$/.test(cleanUsername)) { setError('Username must be 3–40 characters and use only a–z, 0–9, dot or underscore.'); return }
    if (cleanName.length > 80) { setError('Name must be 80 characters or fewer.'); return }
    await runAction(async () => {
      const { data, error: e } = await supabase.from('profiles').update({ username: cleanUsername, full_name: cleanName })
        .eq('id', userId).select('id,username,full_name,avatar_url,created_at').single()
      if (e) throw e
      setProfile(data as Profile)
    }, 'Profile saved.')
  }
  async function signOut() {
    const { error: e } = await supabase.auth.signOut()
    if (e) setError(e.message); else window.location.assign('/login')
  }

  const navItems: { id: Tab; icon: string; label: string; count?: number }[] = [
    { id: 'discover', icon: '⌕', label: 'Discover' }, { id: 'friends', icon: '♡', label: 'Friends' },
    { id: 'requests', icon: '✉', label: 'Requests', count: incoming.length }, { id: 'profile', icon: '◉', label: 'Profile' },
  ]
  return (
    <main className="app-shell">
      <div className="ambient ambient-a" /><div className="ambient ambient-b" />
      <aside className="sidebar glass-panel">
        <a className="brand-lockup brand-small" href="/"><div className="brand-mark">C</div><div><p className="eyebrow">YOUR PEOPLE</p><h1>Connectly</h1></div></a>
        <div className="side-caption">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          {navItems.map((item) => <button key={item.id} className={`nav-item ${tab === item.id ? 'active' : ''}`} onClick={() => { setTab(item.id); clearFeedback() }}>
            <span className="nav-icon">{item.icon}</span><span>{item.label}</span>{item.count ? <span className="nav-count">{item.count}</span> : null}
          </button>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="mini-profile"><div className="avatar avatar-small">{initialOf(profile)}</div><div className="mini-profile-text"><strong>{nameOf(profile)}</strong><span>{email}</span></div></div>
          <button className="nav-item signout-item" onClick={signOut}><span className="nav-icon">↗</span><span>Sign out</span></button>
          <p className="sidebar-version">CONNECTLY · PHASE 01</p>
        </div>
      </aside>

      <section className="main-column">
        <header className="topbar"><div><p className="eyebrow">YOUR PRIVATE SOCIAL SPACE</p><h2>{tab === 'discover' ? 'Find your people' : tab === 'friends' ? 'Your circle' : tab === 'requests' ? 'Friend requests' : 'Your profile'}</h2></div><div className="topbar-status"><span className="status-dot" /> Secure session</div></header>
        {(message || error) && <div className={`global-feedback ${error ? 'feedback-error' : 'feedback-success'}`} role="status">{error || message}<button onClick={clearFeedback} aria-label="Dismiss message">×</button></div>}

        {tab === 'discover' && <section className="content-stack">
          <div className="welcome-panel glass-panel"><div className="welcome-copy"><p className="eyebrow">A LITTLE CLOSER, EVERY DAY</p><h3>Good connections<br /><span>start with hello.</span></h3><p>Search by username and invite the people you want in your circle.</p></div><div className="welcome-orbit"><div className="orbit-core">C</div><span className="orbit-dot orbit-dot-one">✦</span><span className="orbit-dot orbit-dot-two">♡</span><span className="orbit-dot orbit-dot-three">✧</span></div></div>
          <div className="section-heading"><div><p className="eyebrow">DISCOVER</p><h3>Find friends</h3></div><span className="muted small-text">Search public usernames</span></div>
          <form className="search-bar glass-panel" onSubmit={searchPeople}><span className="search-symbol">⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search username…" aria-label="Search username" /><button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Searching…' : 'Search'}</button></form>
          <div className="people-grid">
            {results.map((person) => <article className="person-card glass-panel" key={person.id}>
              <div className="person-card-top"><div className="avatar">{initialOf(person)}</div><span className="online-pill"><i /> CONNECTLY</span></div><h4>{nameOf(person)}</h4><p className="muted">@{person.username}</p>
              <div className="person-actions"><button className="button button-primary" onClick={() => sendRequest(person)} disabled={busy}>＋ Add friend</button><button className="icon-button" title="Block user" onClick={() => blockPerson(person)} disabled={busy}>⊘</button></div>
            </article>)}
            {!results.length && !loading && <div className="empty-state glass-panel"><div className="empty-icon">✧</div><h4>Your next connection is out there.</h4><p>Search a username above to discover someone on Connectly.</p></div>}
            {loading && <div className="empty-state glass-panel"><div className="loader-dot" /><p>Loading your space…</p></div>}
          </div>
        </section>}

        {tab === 'friends' && <section className="content-stack">
          <div className="section-heading"><div><p className="eyebrow">YOUR CIRCLE</p><h3>{friends.length} {friends.length === 1 ? 'friend' : 'friends'}</h3></div><button className="button button-subtle" onClick={() => setTab('discover')}>＋ Find people</button></div>
          <div className="list-panel glass-panel">
            {friends.map((friend) => <div className="list-row" key={friend.requestId}><div className="avatar">{initialOf(friend.person)}</div><div className="list-person"><strong>{nameOf(friend.person)}</strong><span>@{friend.person.username}</span></div><span className="friend-badge">Friends</span><button className="icon-button" title="Remove friend" onClick={() => unfriend(friend)} disabled={busy}>−</button><button className="icon-button danger-icon" title="Block user" onClick={() => blockPerson(friend.person)} disabled={busy}>⊘</button></div>)}
            {!friends.length && <div className="empty-state"><div className="empty-icon">♡</div><h4>Your circle is ready to grow.</h4><p>Find someone by username and send your first friend request.</p><button className="button button-primary" onClick={() => setTab('discover')}>Discover people</button></div>}
          </div>
          <div className="section-heading"><div><p className="eyebrow">PRIVACY</p><h3>Blocked accounts</h3></div></div>
          <div className="list-panel glass-panel">{blocks.map((block) => <div className="list-row" key={block.blocked_id}><div className="avatar avatar-muted">⊘</div><div className="list-person"><strong>{nameOf(block.person)}</strong><span>{block.person ? `@${block.person.username}` : 'Blocked by you'}</span></div><button className="button button-subtle" onClick={() => unblockPerson(block)} disabled={busy}>Unblock</button></div>)}{!blocks.length && <p className="quiet-empty">You have not blocked anyone.</p>}</div>
        </section>}

        {tab === 'requests' && <section className="content-stack">
          <div className="section-heading"><div><p className="eyebrow">YOUR INBOX</p><h3>Incoming requests <span className="heading-count">{incoming.length}</span></h3></div></div>
          <div className="list-panel glass-panel">{incoming.map((request) => <div className="list-row request-row" key={request.id}><div className="avatar">{initialOf(request.person)}</div><div className="list-person"><strong>{nameOf(request.person)}</strong><span>@{request.person?.username}</span></div><button className="button button-primary" onClick={() => respond(request, 'accepted')} disabled={busy}>Accept</button><button className="button button-subtle" onClick={() => respond(request, 'declined')} disabled={busy}>Decline</button></div>)}{!incoming.length && <div className="quiet-empty">No incoming requests right now.</div>}</div>
          <div className="section-heading"><div><p className="eyebrow">WAITING FOR A REPLY</p><h3>Sent requests <span className="heading-count">{outgoing.length}</span></h3></div></div>
          <div className="list-panel glass-panel">{outgoing.map((request) => <div className="list-row" key={request.id}><div className="avatar avatar-muted">{initialOf(request.person)}</div><div className="list-person"><strong>{nameOf(request.person)}</strong><span>@{request.person?.username}</span></div><span className="pending-badge">Pending</span><button className="button button-subtle" onClick={() => cancelRequest(request)} disabled={busy}>Cancel</button></div>)}{!outgoing.length && <div className="quiet-empty">You have no pending sent requests.</div>}</div>
        </section>}

        {tab === 'profile' && <section className="content-stack profile-layout">
          <div className="profile-hero glass-panel"><div className="profile-avatar">{initialOf(profile)}</div><div><p className="eyebrow">YOUR CONNECTLY ID</p><h3>{nameOf(profile)}</h3><p className="muted">@{profile.username}</p></div><span className="profile-status"><i /> ACTIVE</span></div>
          <div className="form-panel glass-panel"><div className="section-heading"><div><p className="eyebrow">PERSONAL DETAILS</p><h3>Edit profile</h3></div></div>
            <form className="stack-form" onSubmit={saveProfile}><label className="field-label">Full name<input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={80} placeholder="Your name" /></label><label className="field-label">Username<div className="input-prefix"><span>@</span><input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={40} placeholder="yourname" /></div></label><label className="field-label">Email address<input value={email} disabled /></label><p className="muted small-text">Username: 3–40 characters, lowercase letters, numbers, dots and underscores.</p><button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></form>
          </div>
          <div className="form-panel glass-panel privacy-note"><div className="privacy-icon">◇</div><div><h4>Your privacy matters</h4><p className="muted">Only your profile basics are searchable by signed-in Connectly users. Never put passwords, phone numbers or private details in your public profile.</p></div></div>
        </section>}

        <footer className="app-footer"><span>CONNECTLY</span><span>Made for meaningful connections</span><span>PHASE 01 · AUTH & FRIENDS</span></footer>
      </section>
      <nav className="mobile-nav" aria-label="Mobile navigation">{navItems.map((item) => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}><span>{item.icon}</span><small>{item.label}</small>{item.count ? <i>{item.count}</i> : null}</button>)}</nav>
    </main>
  )
}
