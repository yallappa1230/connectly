'use client'

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Profile = { id: string; username: string; full_name: string | null; avatar_url: string | null; created_at?: string }
type RequestRow = { id: string; sender_id: string; receiver_id: string; status: 'pending'|'accepted'|'declined'|'cancelled'; created_at: string; person?: Profile }
type FriendRow = { requestId: string; person: Profile }
type BlockRow = { blocker_id: string; blocked_id: string; created_at: string; person?: Profile }
type ConversationRow = { id: string; title: string | null; is_group: boolean; direct_key: string | null; created_at: string }
type MessageRow = { id: string; conversation_id: string; sender_id: string; content: string; created_at: string }
type ChatSummary = { conversationId: string; person: Profile; lastMessage?: string; lastAt?: string }
type Tab = 'chats'|'profile'
type Theme = 'black'|'white'|'glass'
type CallMode = 'audio'|'video'
type CallPhase = 'incoming'|'calling'|'connecting'|'active'
type CallView = { callId: string; person: Profile; mode: CallMode; phase: CallPhase; direction: 'incoming'|'outgoing' }
type IncomingCallPayload = { callId: string; from: string; to: string; mode: CallMode; offer: RTCSessionDescriptionInit }
type CallSignalPayload = { callId: string; from: string; to: string; kind: 'answer'|'ice'|'end'; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }

const emptyProfile: Profile = { id: '', username: '', full_name: '', avatar_url: null }
const nameOf = (p?: Profile | null) => p?.full_name?.trim() || (p?.username ? `@${p.username}` : 'Connectly member')
const initialOf = (p?: Profile | null) => nameOf(p).replace(/^@/, '').slice(0, 1).toUpperCase() || 'C'

export function ConnectlyShell({ userId, email, initialProfile }: { userId: string; email: string; initialProfile: Profile }) {
  const supabase = useMemo(() => createClient(), [])
  const [tab, setTab] = useState<Tab>('chats')
  const [theme, setTheme] = useState<Theme>('black')
  const [chatSearch, setChatSearch] = useState('')
  const [selectedPerson, setSelectedPerson] = useState<Profile | null>(null)
  const [profile, setProfile] = useState<Profile>(initialProfile ?? emptyProfile)
  const [incoming, setIncoming] = useState<RequestRow[]>([])
  const [outgoing, setOutgoing] = useState<RequestRow[]>([])
  const [friends, setFriends] = useState<FriendRow[]>([])
  const [blocks, setBlocks] = useState<BlockRow[]>([])
  const [chats, setChats] = useState<ChatSummary[]>([])
  const [activeChatId, setActiveChatId] = useState('')
  const [chatMessages, setChatMessages] = useState<MessageRow[]>([])
  const [chatDraft, setChatDraft] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatBusy, setChatBusy] = useState(false)
  const [results, setResults] = useState<Profile[]>([])
  const [query, setQuery] = useState('')
  const [fullName, setFullName] = useState(initialProfile?.full_name ?? '')
  const [username, setUsername] = useState(initialProfile?.username ?? '')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [callState, setCallState] = useState<CallView | null>(null)
  const [callError, setCallError] = useState('')
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [callMuted, setCallMuted] = useState(false)
  const [cameraEnabled, setCameraEnabled] = useState(true)
  const callStateRef = useRef<CallView | null>(null)
  const incomingOfferRef = useRef<IncomingCallPayload | null>(null)
  const callPeerRef = useRef<RTCPeerConnection | null>(null)
  const callMediaRef = useRef<MediaStream | null>(null)
  const callChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const pendingRemoteIceRef = useRef<RTCIceCandidateInit[]>([])
  const pendingLocalIceRef = useRef<RTCIceCandidateInit[]>([])
  const remotePeerReadyRef = useRef(false)
  const localVideoRef = useRef<HTMLVideoElement | null>(null)
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null)
  const callTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refreshChats = useCallback(async () => {
    const { data: memberships, error: memberError } = await supabase
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', userId)
    if (memberError) throw memberError

    const conversationIds = [...new Set((memberships ?? []).map((row) => row.conversation_id as string))]
    if (!conversationIds.length) {
      setChats([])
      return
    }

    const [conversationResult, allMembersResult, messageResult] = await Promise.all([
      supabase.from('conversations')
        .select('id,title,is_group,direct_key,created_at')
        .in('id', conversationIds)
        .eq('is_group', false),
      supabase.from('conversation_members')
        .select('conversation_id,user_id')
        .in('conversation_id', conversationIds),
      supabase.from('messages')
        .select('id,conversation_id,sender_id,content,created_at')
        .in('conversation_id', conversationIds)
        .order('created_at', { ascending: false })
        .limit(100),
    ])
    if (conversationResult.error) throw conversationResult.error
    if (allMembersResult.error) throw allMembersResult.error
    if (messageResult.error) throw messageResult.error

    const conversations = (conversationResult.data ?? []) as ConversationRow[]
    const members = (allMembersResult.data ?? []) as { conversation_id: string; user_id: string }[]
    const otherIds = [...new Set(members.filter((m) => m.user_id !== userId).map((m) => m.user_id))]
    const peopleResult = otherIds.length
      ? await supabase.from('profiles').select('id,username,full_name,avatar_url,created_at').in('id', otherIds)
      : { data: [] as Profile[], error: null }
    if (peopleResult.error) throw peopleResult.error

    const people = new Map(((peopleResult.data ?? []) as Profile[]).map((person) => [person.id, person]))
    const latest = new Map<string, MessageRow>()
    for (const message of (messageResult.data ?? []) as MessageRow[]) {
      if (!latest.has(message.conversation_id)) latest.set(message.conversation_id, message)
    }

    const summaries: ChatSummary[] = conversations.flatMap((conversation) => {
      const otherMember = members.find((m) => m.conversation_id === conversation.id && m.user_id !== userId)
      const person = otherMember ? people.get(otherMember.user_id) : undefined
      if (!person) return []
      const last = latest.get(conversation.id)
      return [{
        conversationId: conversation.id,
        person,
        lastMessage: last?.content,
        lastAt: last?.created_at,
      }]
    }).sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''))

    setChats(summaries)
  }, [supabase, userId])

  const loadChatMessages = useCallback(async (conversationId: string) => {
    setChatLoading(true)
    const { data, error: loadError } = await supabase
      .from('messages')
      .select('id,conversation_id,sender_id,content,created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(100)
    if (loadError) {
      setError(loadError.message)
      setChatMessages([])
    } else {
      setChatMessages((data ?? []) as MessageRow[])
    }
    setChatLoading(false)
  }, [supabase])

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
    try {
      await refreshChats()
    } catch (chatError) {
      setError(chatError instanceof Error ? chatError.message : 'Could not load chats.')
    }
    setLoading(false)
  }, [supabase, userId, refreshChats])

  useEffect(() => { void refresh() }, [refresh])

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('connectly-theme')
      if (saved === 'black' || saved === 'white' || saved === 'glass') setTheme(saved)
    } catch {
      // Theme remains usable even when local storage is unavailable.
    }
  }, [])

  function chooseTheme(nextTheme: Theme) {
    setTheme(nextTheme)
    try {
      window.localStorage.setItem('connectly-theme', nextTheme)
    } catch {
      // The current page still updates when persistence is unavailable.
    }
  }
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

  async function openChat(person: Profile) {
    setChatBusy(true)
    clearFeedback()
    try {
      const { data: friendship, error: friendshipError } = await supabase
        .from('friend_requests')
        .select('id')
        .eq('status', 'accepted')
        .or(`and(sender_id.eq.${userId},receiver_id.eq.${person.id}),and(sender_id.eq.${person.id},receiver_id.eq.${userId})`)
        .maybeSingle()
      if (friendshipError) throw friendshipError
      if (!friendship) throw new Error('You can only message accepted friends.')

      const { data: blockRows, error: blockError } = await supabase
        .from('user_blocks')
        .select('blocker_id,blocked_id')
        .or(`and(blocker_id.eq.${userId},blocked_id.eq.${person.id}),and(blocker_id.eq.${person.id},blocked_id.eq.${userId})`)
      if (blockError) throw blockError
      if ((blockRows ?? []).length) throw new Error('Messaging is unavailable because one of these accounts is blocked.')

      const pairKey = [userId, person.id].sort().join(':')
      let { data: conversation, error: lookupError } = await supabase
        .from('conversations')
        .select('id')
        .eq('direct_key', pairKey)
        .maybeSingle()
      if (lookupError) throw lookupError

      if (!conversation) {
        const { error: createError } = await supabase.from('conversations').insert({
          title: null,
          is_group: false,
          created_by: userId,
          direct_key: pairKey,
        })
        if (createError && createError.code !== '23505') throw createError

        const lookup = await supabase
          .from('conversations')
          .select('id')
          .eq('direct_key', pairKey)
          .maybeSingle()
        if (lookup.error) throw lookup.error
        conversation = lookup.data
      }

      if (!conversation?.id) throw new Error('Could not open this conversation. Please retry.')

      const { error: membershipError } = await supabase
        .from('conversation_members')
        .insert({ conversation_id: conversation.id, user_id: person.id })
      if (membershipError && membershipError.code !== '23505') throw membershipError

      setActiveChatId(conversation.id)
      setTab('chats')
      await refreshChats()
      await loadChatMessages(conversation.id)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not open this chat.')
    } finally {
      setChatBusy(false)
    }
  }

  async function showPersonDetails(person: Profile) {
    clearFeedback()
    const { data: friendship, error: friendshipError } = await supabase
      .from('friend_requests')
      .select('id')
      .eq('status', 'accepted')
      .or(`and(sender_id.eq.${userId},receiver_id.eq.${person.id}),and(sender_id.eq.${person.id},receiver_id.eq.${userId})`)
      .maybeSingle()
    if (friendshipError) {
      setError(friendshipError.message)
      return
    }
    if (!friendship) {
      setError('This profile is available only to accepted friends.')
      return
    }

    const { data: blocks, error: blockError } = await supabase
      .from('user_blocks')
      .select('blocker_id,blocked_id')
      .or(`and(blocker_id.eq.${userId},blocked_id.eq.${person.id}),and(blocker_id.eq.${person.id},blocked_id.eq.${userId})`)
    if (blockError) {
      setError(blockError.message)
      return
    }
    if ((blocks ?? []).length) {
      setError('This profile is unavailable.')
      return
    }
    setSelectedPerson(person)
  }

  function updateCallState(next: CallView | null) {
    callStateRef.current = next
    setCallState(next)
  }

  async function waitForCallChannel(channel: ReturnType<typeof supabase.channel>) {
    await supabase.realtime.setAuth()
    await new Promise<void>((resolve, reject) => {
      let settled = false
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true
          reject(new Error('Call connection timed out. Please try again.'))
        }
      }, 12000)

      channel.subscribe((status, channelError) => {
        if (status === 'SUBSCRIBED' && !settled) {
          settled = true
          clearTimeout(timeout)
          resolve()
        } else if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') && !settled) {
          settled = true
          clearTimeout(timeout)
          reject(channelError instanceof Error ? channelError : new Error('Could not connect to the private call channel.'))
        }
      })
    })
  }

  async function broadcastToUser(
    targetId: string,
    event: 'incoming-call'|'call-status',
    payload: Record<string, unknown>,
  ) {
    const channel = supabase.channel(`user-calls:${targetId}`, {
      config: { private: true, broadcast: { ack: true } },
    })
    try {
      await waitForCallChannel(channel)
      const result = await channel.send({ type: 'broadcast', event, payload })
      if (result !== 'ok') throw new Error('Could not send the call invitation. Please try again.')
    } finally {
      await supabase.removeChannel(channel)
    }
  }

  async function sendPairCallSignal(kind: CallSignalPayload['kind'], extra: Partial<CallSignalPayload> = {}) {
    const active = callStateRef.current
    const channel = callChannelRef.current
    if (!active || !channel) return
    const result = await channel.send({
      type: 'broadcast',
      event: 'signal',
      payload: {
        callId: active.callId,
        from: userId,
        to: active.person.id,
        kind,
        ...extra,
      },
    })
    if (result !== 'ok') throw new Error('The call signal could not be sent.')
  }

  async function flushPendingCallIce() {
    const channel = callChannelRef.current
    const active = callStateRef.current
    if (!channel || !active) return
    const queued = pendingLocalIceRef.current.splice(0)
    for (const candidate of queued) {
      const result = await channel.send({
        type: 'broadcast',
        event: 'signal',
        payload: {
          callId: active.callId,
          from: userId,
          to: active.person.id,
          kind: 'ice',
          candidate,
        },
      })
      if (result !== 'ok') throw new Error('A network connection update could not be sent.')
    }
  }

  async function flushPendingRemoteIce(peer: RTCPeerConnection) {
    const queued = pendingRemoteIceRef.current.splice(0)
    for (const candidate of queued) {
      try {
        await peer.addIceCandidate(new RTCIceCandidate(candidate))
      } catch {
        // A stale ICE candidate can be ignored; the browser will keep negotiating.
      }
    }
  }

  async function handlePairCallSignal(payload: CallSignalPayload) {
    const active = callStateRef.current
    const peer = callPeerRef.current
    if (!active || !peer || payload.callId !== active.callId || payload.from !== active.person.id || payload.to !== userId) return

    if (payload.kind === 'end') {
      cleanupCall()
      return
    }

    if (payload.kind === 'answer' && payload.sdp && active.direction === 'outgoing') {
      try {
        await peer.setRemoteDescription(new RTCSessionDescription(payload.sdp))
        remotePeerReadyRef.current = true
        await flushPendingRemoteIce(peer)
        await flushPendingCallIce()
        updateCallState({ ...active, phase: 'connecting' })
      } catch {
        setCallError('The other person could not join this call. Please try again.')
        cleanupCall()
      }
      return
    }

    if (payload.kind === 'ice' && payload.candidate) {
      if (peer.remoteDescription) {
        try {
          await peer.addIceCandidate(new RTCIceCandidate(payload.candidate))
        } catch {
          // Ignore candidates that arrive after a call has already moved on.
        }
      } else {
        pendingRemoteIceRef.current.push(payload.candidate)
      }
    }
  }

  function createCallPeer(person: Profile, stream: MediaStream) {
    const peer = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    })

    stream.getTracks().forEach((track) => peer.addTrack(track, stream))
    peer.ontrack = (event) => {
      const streamFromPeer = event.streams[0] ?? new MediaStream([event.track])
      setRemoteStream(streamFromPeer)
    }
    peer.onicecandidate = (event) => {
      if (!event.candidate) return
      const candidate = event.candidate.toJSON()
      if (!remotePeerReadyRef.current) {
        pendingLocalIceRef.current.push(candidate)
      } else {
        void sendPairCallSignal('ice', { candidate }).catch((caught) => {
          setCallError(caught instanceof Error ? caught.message : 'Could not update the call connection.')
        })
      }
    }
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'connected') {
        const active = callStateRef.current
        if (active) updateCallState({ ...active, phase: 'active' })
      } else if (peer.connectionState === 'failed') {
        setCallError('A direct connection could not be made on this network. A TURN relay may be needed.')
        cleanupCall()
      }
    }
    callPeerRef.current = peer
    return peer
  }

  function cleanupCall() {
    if (callTimerRef.current) {
      clearTimeout(callTimerRef.current)
      callTimerRef.current = null
    }
    callPeerRef.current?.close()
    callPeerRef.current = null
    callMediaRef.current?.getTracks().forEach((track) => track.stop())
    callMediaRef.current = null
    pendingLocalIceRef.current = []
    pendingRemoteIceRef.current = []
    remotePeerReadyRef.current = false
    incomingOfferRef.current = null
    setLocalStream(null)
    setRemoteStream(null)
    setCallMuted(false)
    setCameraEnabled(true)
    updateCallState(null)
    const channel = callChannelRef.current
    callChannelRef.current = null
    if (channel) void supabase.removeChannel(channel)
  }

  async function createPairCallChannel(person: Profile, callId: string) {
    const topic = `call:${[userId, person.id].sort().join(':')}`
    const channel = supabase.channel(topic, {
      config: { private: true, broadcast: { ack: true } },
    })
    channel.on('broadcast', { event: 'signal' }, ({ payload }) => {
      void handlePairCallSignal(payload as CallSignalPayload)
    })
    await waitForCallChannel(channel)
    callChannelRef.current = channel
    return channel
  }

  async function startCall(person: Profile, mode: CallMode) {
    if (callStateRef.current) {
      setCallError('Finish your current call before starting another one.')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCallError('This browser does not support microphone or camera access.')
      return
    }

    setCallError('')
    const callId = crypto.randomUUID()
    const outgoingCall: CallView = { callId, person, mode, phase: 'calling', direction: 'outgoing' }
    updateCallState(outgoingCall)
    remotePeerReadyRef.current = false
    pendingLocalIceRef.current = []
    pendingRemoteIceRef.current = []

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: mode === 'video' ? {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 24, max: 30 },
        } : false,
      })
      callMediaRef.current = stream
      setLocalStream(stream)

      await createPairCallChannel(person, callId)
      const peer = createCallPeer(person, stream)
      const offer = await peer.createOffer()
      await peer.setLocalDescription(offer)
      const localDescription = peer.localDescription?.toJSON() ?? offer

      await broadcastToUser(person.id, 'incoming-call', {
        callId,
        from: userId,
        to: person.id,
        mode,
        offer: localDescription,
      })

      callTimerRef.current = setTimeout(() => {
        const active = callStateRef.current
        if (active?.callId === callId && active.phase === 'calling') {
          setCallError('No answer. You can try again later.')
          void broadcastToUser(person.id, 'call-status', {
            callId,
            from: userId,
            to: person.id,
            status: 'cancelled',
          })
          cleanupCall()
        }
      }, 45000)
    } catch (caught) {
      setCallError(caught instanceof Error ? caught.message : 'Could not start this call.')
      cleanupCall()
    }
  }

  async function acceptIncomingCall() {
    const active = callStateRef.current
    const invitation = incomingOfferRef.current
    if (!active || active.direction !== 'incoming' || !invitation) return

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: active.mode === 'video' ? {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 24, max: 30 },
        } : false,
      })
      callMediaRef.current = stream
      setLocalStream(stream)

      await createPairCallChannel(active.person, active.callId)
      const peer = createCallPeer(active.person, stream)
      await peer.setRemoteDescription(new RTCSessionDescription(invitation.offer))
      remotePeerReadyRef.current = true
      await flushPendingRemoteIce(peer)
      const answer = await peer.createAnswer()
      await peer.setLocalDescription(answer)
      await sendPairCallSignal('answer', { sdp: peer.localDescription?.toJSON() ?? answer })
      updateCallState({ ...active, phase: 'connecting' })
    } catch (caught) {
      setCallError(caught instanceof Error ? caught.message : 'Could not answer this call.')
      try {
        await broadcastToUser(active.person.id, 'call-status', {
          callId: active.callId,
          from: userId,
          to: active.person.id,
          status: 'declined',
        })
      } catch {
        // The caller may already have ended the call.
      }
      cleanupCall()
    }
  }

  async function declineIncomingCall() {
    const active = callStateRef.current
    if (active?.direction === 'incoming') {
      try {
        await broadcastToUser(active.person.id, 'call-status', {
          callId: active.callId,
          from: userId,
          to: active.person.id,
          status: 'declined',
        })
      } catch {
        // The caller may already have ended the call.
      }
    }
    cleanupCall()
  }

  async function endCall() {
    const active = callStateRef.current
    if (!active) return
    try {
      if (active.direction === 'outgoing' && active.phase === 'calling') {
        await broadcastToUser(active.person.id, 'call-status', {
          callId: active.callId,
          from: userId,
          to: active.person.id,
          status: 'cancelled',
        })
      } else {
        await sendPairCallSignal('end')
      }
    } catch {
      // Always stop the local camera and microphone, even when signaling is lost.
    }
    cleanupCall()
  }

  function toggleCallMicrophone() {
    const next = !callMuted
    callMediaRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next })
    setCallMuted(next)
  }

  function toggleCallCamera() {
    const next = !cameraEnabled
    callMediaRef.current?.getVideoTracks().forEach((track) => { track.enabled = !next })
    setCameraEnabled(next)
  }

  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStream
      if (localStream) void localVideoRef.current.play().catch(() => {})
    }
  }, [localStream, callState?.callId])

  useEffect(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream
      if (remoteStream) void remoteVideoRef.current.play().catch(() => {})
    }
  }, [remoteStream, callState?.callId])

  useEffect(() => {
    let mounted = true
    const channel = supabase.channel(`user-calls:${userId}`, {
      config: { private: true },
    })
    channel
      .on('broadcast', { event: 'incoming-call' }, async ({ payload }) => {
        const invite = payload as IncomingCallPayload
        if (!mounted || invite.to !== userId || invite.from === userId) return
        if (callStateRef.current) {
          try {
            await broadcastToUser(invite.from, 'call-status', {
              callId: invite.callId,
              from: userId,
              to: invite.from,
              status: 'busy',
            })
          } catch {
            // Ignore a busy response if the caller already left.
          }
          return
        }

        const [friendshipResult, blockResult, personResult] = await Promise.all([
          supabase.from('friend_requests')
            .select('id')
            .eq('status', 'accepted')
            .or(`and(sender_id.eq.${userId},receiver_id.eq.${invite.from}),and(sender_id.eq.${invite.from},receiver_id.eq.${userId})`)
            .maybeSingle(),
          supabase.from('user_blocks')
            .select('blocker_id')
            .or(`and(blocker_id.eq.${userId},blocked_id.eq.${invite.from}),and(blocker_id.eq.${invite.from},blocked_id.eq.${userId})`),
          supabase.from('profiles')
            .select('id,username,full_name,avatar_url,created_at')
            .eq('id', invite.from)
            .maybeSingle(),
        ])
        if (!mounted || friendshipResult.error || !friendshipResult.data || blockResult.error || (blockResult.data ?? []).length || !personResult.data) return

        incomingOfferRef.current = invite
        updateCallState({
          callId: invite.callId,
          person: personResult.data as Profile,
          mode: invite.mode === 'video' ? 'video' : 'audio',
          phase: 'incoming',
          direction: 'incoming',
        })
      })
      .on('broadcast', { event: 'call-status' }, ({ payload }) => {
        const status = payload as { callId?: string; status?: string }
        const active = callStateRef.current
        if (!active || status.callId !== active.callId) return
        if (status.status === 'declined') {
          setCallError(`${nameOf(active.person)} declined the call.`)
          cleanupCall()
        } else if (status.status === 'cancelled') {
          setCallError('The incoming call was cancelled.')
          cleanupCall()
        } else if (status.status === 'busy') {
          setCallError(`${nameOf(active.person)} is already in another call.`)
          cleanupCall()
        }
      })

    void supabase.realtime.setAuth().then(() => {
      if (!mounted) return
      channel.subscribe((status, channelError) => {
        if (mounted && (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')) {
          setCallError(channelError instanceof Error ? channelError.message : 'Call notifications could not connect.')
        }
      })
    }).catch(() => {
      if (mounted) setCallError('Call notifications could not authenticate. Please sign in again.')
    })

    return () => {
      mounted = false
      void supabase.removeChannel(channel)
    }
  }, [supabase, userId])

  async function sendChatMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const content = chatDraft.trim()
    if (!content || !activeChatId || chatBusy) return
    setChatBusy(true)
    clearFeedback()
    const { error: sendError } = await supabase.from('messages').insert({
      conversation_id: activeChatId,
      sender_id: userId,
      content,
    })
    if (sendError) {
      setError(sendError.message)
    } else {
      setChatDraft('')
      await loadChatMessages(activeChatId)
      await refreshChats()
    }
    setChatBusy(false)
  }

  useEffect(() => {
    if (!activeChatId) return
    const channel = supabase
      .channel(`connectly-chat-${activeChatId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${activeChatId}`,
      }, () => {
        void loadChatMessages(activeChatId)
        void refreshChats()
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [supabase, activeChatId, loadChatMessages, refreshChats])

  const navItems: { id: Tab; icon: string; label: string; count?: number }[] = [
    { id: 'chats', icon: '▤', label: 'Chats', count: incoming.length },
    { id: 'profile', icon: '◉', label: 'Profile' },
  ]
  const firstName = profile.full_name?.trim().split(/\s+/)[0] || profile.username || 'there'
  const filteredChats = chats.filter((chat) => {
    const term = chatSearch.trim().toLowerCase()
    return !term || nameOf(chat.person).toLowerCase().includes(term)
      || (chat.lastMessage ?? '').toLowerCase().includes(term)
      || chat.person.username.toLowerCase().includes(term)
  })
  const activeChatPerson = chats.find((chat) => chat.conversationId === activeChatId)?.person ?? null
  async function selectChat(chat: ChatSummary) {
    setActiveChatId(chat.conversationId)
    setChatMessages([])
    clearFeedback()
    await loadChatMessages(chat.conversationId)
  }
  return (
    <main className="app-shell" data-theme={theme}>
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
        <header className="app-topbar">
          <a className="topbar-brand" href="/" aria-label="Connectly home">
            <span className="brand-symbol">•••</span>
            <span className="topbar-brand-copy"><strong>Connectly</strong><small>YOUR PRIVATE SOCIAL SPACE</small></span>
          </a>
          <div className="topbar-actions">
            
            <span className="topbar-status"><i className="status-dot" /> Secure</span>
            <button type="button" className="topbar-avatar" onClick={() => setTab('profile')} aria-label="Open profile">{initialOf(profile)}</button>
          </div>
        </header>
        {(message || error) && <div className={`global-feedback ${error ? 'feedback-error' : 'feedback-success'}`} role="status">{error || message}<button onClick={clearFeedback} aria-label="Dismiss message">×</button></div>}

        {tab === 'chats' && <section className="inbox-layout">
          {!activeChatId ? <>
            <section className="inbox-welcome">
              <div>
                <p className="eyebrow">A LITTLE CLOSER, EVERY DAY</p>
                <h2>Hi, <span>{firstName}</span> 👋</h2>
                <p>Stay connected with your people.</p>
              </div>
              <div className="welcome-orb" aria-hidden="true"><span>✦</span></div>
            </section>

            <div className="inbox-title-row">
              <div><p className="eyebrow">YOUR MESSAGES</p><h3>Chats <span className="chat-total">{chats.length}</span></h3></div>
            </div>

            <label className="inbox-search glass-panel">
              <span aria-hidden="true">⌕</span>
              <input value={chatSearch} onChange={(event) => setChatSearch(event.target.value)} placeholder="Search chats, friends…" aria-label="Search chats and friends" />
              {chatSearch && <button type="button" onClick={() => setChatSearch('')} aria-label="Clear search">×</button>}
            </label>

            <div className="inbox-list" aria-live="polite">
              {filteredChats.map((chat) => <button key={chat.conversationId} type="button" className="inbox-chat-row" onClick={() => void selectChat(chat)}>
                <span className="inbox-avatar">{initialOf(chat.person)}</span>
                <span className="inbox-chat-copy">
                  <strong>{nameOf(chat.person)}</strong>
                  <small>{chat.lastMessage || 'Start the conversation'}</small>
                </span>
                <span className="inbox-chat-meta"><span className="inbox-chevron">›</span></span>
              </button>)}
              {!filteredChats.length && <div className="inbox-empty glass-panel">
                <div className="inbox-empty-icon">✉</div>
                <h4>{chatSearch ? 'No matching chats' : 'Your inbox is ready'}</h4>
                <p>{chatSearch ? 'Try another name or message.' : 'Start a conversation with someone in your friends list.'}</p>
              </div>}
            </div>

            <section className="inbox-friends-section">
              <div className="inbox-friends-heading">
                <div><p className="eyebrow">YOUR CIRCLE</p><h3>Friends <span className="chat-total">{friends.length}</span></h3></div>
                <span className="small-text muted">Accepted connections</span>
              </div>
              {friends.length ? <div className="inbox-friends-list">
                {friends.map((friend) => <button type="button" className="inbox-friend-row inbox-friend-profile-button" key={friend.requestId} onClick={() => void showPersonDetails(friend.person)} aria-label={`Open ${nameOf(friend.person)} profile`}>
                  <span className="inbox-avatar">{friend.person.avatar_url ? <img src={friend.person.avatar_url} alt="" /> : initialOf(friend.person)}</span>
                  <span className="inbox-friend-copy"><strong>{nameOf(friend.person)}</strong><small>@{friend.person.username}</small></span>
                  <span className="friend-profile-hint">View profile ›</span>
                </button>)}
              </div> : <div className="inbox-friends-empty">Your accepted friends will appear here.</div>}
            </section>

            <section className="inbox-people-tools">
              <section className="inbox-requests-inline">
                <div className="inbox-friends-heading">
                  <div><p className="eyebrow">YOUR INBOX</p><h3>Received requests <span className="chat-total">{incoming.length}</span></h3></div>
                </div>
                {incoming.length ? <div className="inbox-friends-list">
                  {incoming.map((request) => <article className="inbox-friend-row inbox-request-row" key={request.id}>
                    <span className="inbox-avatar">{request.person?.avatar_url ? <img src={request.person.avatar_url} alt="" /> : initialOf(request.person)}</span>
                    <span className="inbox-friend-copy"><strong>{nameOf(request.person)}</strong><small>@{request.person?.username}</small></span>
                    <button type="button" className="button button-primary" onClick={() => respond(request, 'accepted')} disabled={busy}>Accept</button>
                    <button type="button" className="button button-subtle" onClick={() => respond(request, 'declined')} disabled={busy}>Decline</button>
                  </article>)}
                </div> : <p className="inbox-people-empty">No received requests right now.</p>}
              </section>

              <section className="inbox-discover-inline">
                <div className="inbox-friends-heading">
                  <div><p className="eyebrow">GROW YOUR CIRCLE</p><h3>Find friends</h3></div>
                  <span className="small-text muted">Search usernames</span>
                </div>
                <form className="search-bar glass-panel" onSubmit={searchPeople}>
                  <span className="search-symbol">⌕</span>
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search username…" aria-label="Search username" />
                  <button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Searching…' : 'Search'}</button>
                </form>
                {results.length ? <div className="inbox-friends-list inbox-search-results">
                  {results.map((person) => <article className="inbox-friend-row" key={person.id}>
                    <span className="inbox-avatar">{person.avatar_url ? <img src={person.avatar_url} alt="" /> : initialOf(person)}</span>
                    <span className="inbox-friend-copy"><strong>{nameOf(person)}</strong><small>@{person.username}</small></span>
                    <button type="button" className="button button-primary" onClick={() => void sendRequest(person)} disabled={busy}>Add friend</button>
                    <button type="button" className="icon-button danger-icon" aria-label={`Block ${nameOf(person)}`} title="Block" onClick={() => void blockPerson(person)} disabled={busy}>⊘</button>
                  </article>)}
                </div> : <p className="inbox-people-empty">{query.trim().length >= 2 ? 'No matching people found.' : 'Search by username to find people on Connectly.'}</p>}
              </section>
            </section>

          </> : <>
            <section className="conversation-screen">
              <header className="conversation-topbar">
                <button type="button" className="back-to-inbox" onClick={() => { setActiveChatId(''); setChatMessages([]); void refreshChats() }}><span>‹</span> Chats</button>
                {activeChatPerson ? <button type="button" className="conversation-person conversation-person-button" onClick={() => void showPersonDetails(activeChatPerson)} aria-label={`View ${nameOf(activeChatPerson)}'s profile`}>
                  <span className="inbox-avatar small">{activeChatPerson.avatar_url ? <img src={activeChatPerson.avatar_url} alt="" /> : initialOf(activeChatPerson)}</span>
                  <span><strong>{nameOf(activeChatPerson)}</strong><small>@{activeChatPerson.username} · View profile</small></span>
                </button> : <div className="conversation-person"><span className="inbox-avatar small">C</span><span><strong>Connectly member</strong><small>Private conversation</small></span></div>}
                <span className="secure-chip"><i /> Private</span>
              </header>
              <div className="conversation-messages" aria-live="polite">
                {chatLoading && !chatMessages.length && <p className="quiet-empty">Loading messages…</p>}
                {!chatLoading && !chatMessages.length && <div className="conversation-empty"><span>✦</span><strong>Say hello.</strong><p>Your conversation is private to its two members.</p></div>}
                {chatMessages.map((item) => <div key={item.id} className={`chat-message-row ${item.sender_id === userId ? 'mine' : 'theirs'}`}>
                  <div className="chat-bubble"><p>{item.content}</p><time>{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>
                </div>)}
              </div>
              <form className="chat-compose" onSubmit={sendChatMessage}>
                <input value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} maxLength={5000} placeholder="Write a message…" aria-label="Message" />
                <button className="button button-primary" type="submit" disabled={chatBusy || !chatDraft.trim()}>{chatBusy ? 'Sending…' : 'Send'}</button>
              </form>
            </section>
          </>}
        </section>}

          {selectedPerson && <div className="modal-scrim profile-modal-scrim" role="presentation" onClick={() => setSelectedPerson(null)}>
            <section className="person-profile-modal glass-panel" role="dialog" aria-modal="true" aria-labelledby="person-profile-title" onClick={(event) => event.stopPropagation()}>
              <div className="modal-heading"><div><p className="eyebrow">CONNECTLY MEMBER</p><h3 id="person-profile-title">Profile details</h3></div><button type="button" className="icon-button" onClick={() => setSelectedPerson(null)} aria-label="Close profile">×</button></div>
              <div className="person-profile-identity">
                <div className="person-profile-photo">
                  {selectedPerson.avatar_url ? <img src={selectedPerson.avatar_url} alt={`${nameOf(selectedPerson)} profile`} /> : <span>{initialOf(selectedPerson)}</span>}
                </div>
                <h4>{nameOf(selectedPerson)}</h4>
                <p>@{selectedPerson.username}</p>
                <span className="accepted-friend-label"><i /> Accepted friend</span>
              </div>
              <div className="person-profile-fields">
                <div><small>Full name</small><strong>{selectedPerson.full_name?.trim() || 'Not provided'}</strong></div>
                <div><small>Username</small><strong>@{selectedPerson.username}</strong></div>
              </div>
              <div className="person-profile-actions">
                <button type="button" className="button button-primary" onClick={() => { const person = selectedPerson; setSelectedPerson(null); void openChat(person) }} disabled={chatBusy}>Message</button>
                <button type="button" className="button button-subtle" onClick={() => { const person = selectedPerson; setSelectedPerson(null); void startCall(person, 'audio') }} disabled={!!callState}>Audio call</button>
                <button type="button" className="button button-subtle" onClick={() => { const person = selectedPerson; setSelectedPerson(null); void startCall(person, 'video') }} disabled={!!callState}>Video call</button>
                <button type="button" className="button button-subtle" onClick={() => {
                  const friend = friends.find((item) => item.person.id === selectedPerson.id)
                  if (friend) {
                    setSelectedPerson(null)
                    void unfriend(friend)
                  }
                }} disabled={busy || !friends.some((item) => item.person.id === selectedPerson.id)}>Remove friend</button>
                <button type="button" className="button button-danger" onClick={() => { const person = selectedPerson; setSelectedPerson(null); void blockPerson(person) }} disabled={busy}>Block</button>
              </div>
              <button type="button" className="button button-subtle button-wide" onClick={() => setSelectedPerson(null)}>Close</button>
            </section>
          </div>}

        {tab === 'profile' && <section className="content-stack profile-layout">
          <div className="profile-hero glass-panel"><div className="profile-avatar">{initialOf(profile)}</div><div><p className="eyebrow">YOUR CONNECTLY ID</p><h3>{nameOf(profile)}</h3><p className="muted">@{profile.username}</p></div><span className="profile-status"><i /> ACTIVE</span></div>
          <div className="form-panel glass-panel appearance-panel">
            <div className="section-heading"><div><p className="eyebrow">MAKE IT YOURS</p><h3>Appearance</h3><p className="muted small-text">Choose how Connectly looks on this device.</p></div></div>
            <div className="profile-theme-options" role="group" aria-label="Choose appearance">
              <button type="button" className={`profile-theme-option ${theme === 'black' ? 'selected' : ''}`} onClick={() => chooseTheme('black')} aria-pressed={theme === 'black'}>
                <span className="theme-preview theme-preview-black" /><span><strong>Black</strong><small>Minimal dark</small></span>{theme === 'black' && <b>✓</b>}
              </button>
              <button type="button" className={`profile-theme-option ${theme === 'white' ? 'selected' : ''}`} onClick={() => chooseTheme('white')} aria-pressed={theme === 'white'}>
                <span className="theme-preview theme-preview-white" /><span><strong>White</strong><small>Clean light</small></span>{theme === 'white' && <b>✓</b>}
              </button>
              <button type="button" className={`profile-theme-option ${theme === 'glass' ? 'selected' : ''}`} onClick={() => chooseTheme('glass')} aria-pressed={theme === 'glass'}>
                <span className="theme-preview theme-preview-glass" /><span><strong>Liquid Glass</strong><small>Frosted surfaces</small></span>{theme === 'glass' && <b>✓</b>}
              </button>
            </div>
          </div>
          <div className="form-panel glass-panel"><div className="section-heading"><div><p className="eyebrow">PERSONAL DETAILS</p><h3>Edit profile</h3></div></div>
            <form className="stack-form" onSubmit={saveProfile}><label className="field-label">Full name<input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={80} placeholder="Your name" /></label><label className="field-label">Username<div className="input-prefix"><span>@</span><input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={40} placeholder="yourname" /></div></label><label className="field-label">Email address<input value={email} disabled /></label><p className="muted small-text">Username: 3–40 characters, lowercase letters, numbers, dots and underscores.</p><button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></form>
          </div>
          <button type="button" className="button button-danger button-wide mobile-profile-signout" onClick={signOut}>Sign out</button>
          <div className="form-panel glass-panel privacy-note"><div className="privacy-icon">◇</div><div><h4>Your privacy matters</h4><p className="muted">Only your profile basics are searchable by signed-in Connectly users. Never put passwords, phone numbers or private details in your public profile.</p></div></div>
        </section>}

        <footer className="app-footer"><span>CONNECTLY</span><span>Made for meaningful connections</span><span>PHASE 01 · AUTH & FRIENDS</span></footer>
      </section>
      {callError && !callState && <div className="call-toast" role="status">
        <span>{callError}</span><button type="button" onClick={() => setCallError('')} aria-label="Dismiss call message">×</button>
      </div>}
      {callState && <div className="call-overlay" role="dialog" aria-modal="true" aria-label={callState.mode === 'video' ? 'Video call' : 'Audio call'}>
        <section className="call-window glass-panel">
          <header className="call-window-header">
            <div><p className="eyebrow">{callState.mode === 'video' ? 'CONNECTLY VIDEO' : 'CONNECTLY VOICE'}</p><h3>{callState.phase === 'incoming' ? 'Incoming call' : callState.phase === 'calling' ? 'Calling…' : callState.phase === 'connecting' ? 'Connecting…' : 'In call'}</h3></div>
            <span className="secure-chip"><i /> Private call</span>
          </header>
          <div className={`call-stage ${callState.mode === 'video' ? 'video-mode' : 'audio-mode'}`}>
            {callState.mode === 'video' && remoteStream
              ? <video ref={remoteVideoRef} className="call-remote-video" autoPlay playsInline />
              : <div className="call-person-stage">
                  <div className="call-person-avatar">{callState.person.avatar_url ? <img src={callState.person.avatar_url} alt="" /> : initialOf(callState.person)}</div>
                  <strong>{nameOf(callState.person)}</strong>
                  <small>{callState.phase === 'incoming' ? 'Wants to talk with you' : callState.phase === 'calling' ? 'Waiting for them to answer' : callState.phase === 'connecting' ? 'Setting up your connection' : 'Connected'}</small>
                </div>}
            {callState.mode === 'video' && <video ref={localVideoRef} className="call-local-preview" autoPlay muted playsInline />}
            {callState.mode === 'audio' && <video ref={remoteVideoRef} className="call-audio-sink" autoPlay playsInline />}
          </div>
          {callError && <p className="call-inline-error">{callError}</p>}
          <div className="call-controls">
            {callState.phase === 'incoming' ? <>
              <button type="button" className="call-control call-control-accept" onClick={() => void acceptIncomingCall()}><span>✓</span><small>Accept</small></button>
              <button type="button" className="call-control call-control-end" onClick={() => void declineIncomingCall()}><span>×</span><small>Decline</small></button>
            </> : <>
              <button type="button" className={`call-control ${callMuted ? 'is-off' : ''}`} onClick={toggleCallMicrophone}><span>{callMuted ? '×' : '♬'}</span><small>{callMuted ? 'Unmute' : 'Mute'}</small></button>
              {callState.mode === 'video' && <button type="button" className={`call-control ${cameraEnabled ? '' : 'is-off'}`} onClick={toggleCallCamera}><span>{cameraEnabled ? '◉' : '⊘'}</span><small>{cameraEnabled ? 'Camera off' : 'Camera on'}</small></button>}
              <button type="button" className="call-control call-control-end" onClick={() => void endCall()}><span>×</span><small>{callState.phase === 'calling' ? 'Cancel' : 'End call'}</small></button>
            </>}
          </div>
          <p className="call-privacy-note">Camera and microphone are used only while this call is active. Connectly does not record calls.</p>
        </section>
      </div>}
      <nav className="mobile-nav" aria-label="Mobile navigation">{navItems.map((item) => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}><span>{item.icon}</span><small>{item.label}</small>{item.count ? <i>{item.count}</i> : null}</button>)}</nav>
    </main>
  )
}
