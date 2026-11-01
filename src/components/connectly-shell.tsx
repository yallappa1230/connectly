'use client'

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Profile = { id: string; username: string; full_name: string | null; avatar_url: string | null; created_at?: string }
type RequestRow = { id: string; sender_id: string; receiver_id: string; status: 'pending'|'accepted'|'declined'|'cancelled'; created_at: string; person?: Profile }
type FriendRow = { requestId: string; person: Profile }
type BlockRow = { blocker_id: string; blocked_id: string; created_at: string; person?: Profile }
type ConversationRow = { id: string; title: string | null; is_group: boolean; direct_key: string | null; created_at: string }
type MessageRow = { id: string; conversation_id: string; sender_id: string; content: string; created_at: string; reply_to_message_id: string | null }
type MessageAttachmentRow = { id: string; message_id: string; conversation_id: string; uploader_id: string; storage_path: string; original_name: string; mime_type: string; byte_size: number; media_kind: 'image'|'video'|'audio'|'document'; signed_url?: string }
type MessageReactionRow = { message_id: string; user_id: string; emoji: string; created_at: string }
type SavedMessageRow = { message_id: string; note: string | null; saved_at: string; message: MessageRow }
type PrivacySettings = { user_id: string; allow_friend_requests: boolean; discoverable: boolean; read_receipts: boolean }
type QrMode = 'show'|'scan'|null
type ChatSummary = {
  conversationId: string
  person: Profile | null
  title: string | null
  isGroup: boolean
  memberCount: number
  lastMessage?: string
  lastAt?: string
  lastSenderId?: string
  unreadCount: number
  isFavorite: boolean
  isMuted: boolean
  isPinned: boolean
  isArchived: boolean
}
type ConversationSetting = { conversation_id: string; is_favorite: boolean; is_muted: boolean; is_pinned: boolean; is_archived: boolean; last_read_at: string | null }
type ConnectlyTask = { id: string; user_id: string; conversation_id: string; message_id: string | null; title: string; due_at: string | null; status: 'open'|'done'; created_at: string }
type InboxFilter = 'all'|'unread'|'favorites'|'pinned'|'groups'|'archived'
type Tab = 'chats'|'updates'|'communities'|'calls'|'profile'
type Theme = 'black'|'white'|'glass'
type CallMode = 'audio'|'video'
type CallPhase = 'incoming'|'calling'|'connecting'|'active'
type CallView = { callId: string; person: Profile; mode: CallMode; phase: CallPhase; direction: 'incoming'|'outgoing' }
type IncomingCallPayload = { callId: string; from: string; to: string; mode: CallMode; offer: RTCSessionDescriptionInit }
type CallSignalPayload = { callId: string; from: string; to: string; kind: 'answer'|'ice'|'end'; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }

const emptyProfile: Profile = { id: '', username: '', full_name: '', avatar_url: null }
const nameOf = (p?: Profile | null) => p?.full_name?.trim() || (p?.username ? `@${p.username}` : 'Connectly member')
const initialOf = (p?: Profile | null) => nameOf(p).replace(/^@/, '').slice(0, 1).toUpperCase() || 'C'
const formatChatTime = (value?: string) => {
  if (!value) return ''
  const date = new Date(value)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  if (sameDay(date, today)) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (sameDay(date, yesterday)) return 'Yesterday'
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}
const formatMessageDay = (value: string) => {
  const date = new Date(value)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  if (sameDay(date, today)) return 'Today'
  if (sameDay(date, yesterday)) return 'Yesterday'
  return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
}

export function ConnectlyShell({ userId, email, initialProfile }: { userId: string; email: string; initialProfile: Profile }) {
  const supabase = useMemo(() => createClient(), [])
  const [tab, setTab] = useState<Tab>('chats')
  const [theme, setTheme] = useState<Theme>('black')
  const [chatSearch, setChatSearch] = useState('')
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>('all')
  const [chatSettings, setChatSettings] = useState<Record<string, ConversationSetting>>({})
  const [showInboxSearch, setShowInboxSearch] = useState(false)
  const [messageSearchOpen, setMessageSearchOpen] = useState(false)
  const [messageSearch, setMessageSearch] = useState('')
  const [newChatOpen, setNewChatOpen] = useState(false)
  const [newGroupMode, setNewGroupMode] = useState(false)
  const [groupTitle, setGroupTitle] = useState('')
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<string[]>([])
  const [chatMenuFor, setChatMenuFor] = useState<string | null>(null)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const [messageMenuFor, setMessageMenuFor] = useState<string | null>(null)
  const [replyingTo, setReplyingTo] = useState<MessageRow | null>(null)
  const [securityInfoOpen, setSecurityInfoOpen] = useState(false)
  const [messageAttachments, setMessageAttachments] = useState<MessageAttachmentRow[]>([])
  const [messageReactions, setMessageReactions] = useState<MessageReactionRow[]>([])
  const [savedMessageIds, setSavedMessageIds] = useState<string[]>([])
  const [savedMessagesOpen, setSavedMessagesOpen] = useState(false)
  const [savedMessages, setSavedMessages] = useState<SavedMessageRow[]>([])
  const [tasksOpen, setTasksOpen] = useState(false)
  const [tasks, setTasks] = useState<ConnectlyTask[]>([])
  const [taskSourceMessage, setTaskSourceMessage] = useState<MessageRow | null>(null)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDueAt, setTaskDueAt] = useState('')
  const [taskBusy, setTaskBusy] = useState(false)
  const [reactionMenuFor, setReactionMenuFor] = useState<string | null>(null)
  const [mediaMenuOpen, setMediaMenuOpen] = useState(false)
  const [uploadingMedia, setUploadingMedia] = useState(false)
  const [recordingVoice, setRecordingVoice] = useState(false)
  const [privacySettings, setPrivacySettings] = useState<PrivacySettings>({
    user_id: userId, allow_friend_requests: true, discoverable: true, read_receipts: true,
  })
  const [qrMode, setQrMode] = useState<QrMode>(null)
  const [qrSvg, setQrSvg] = useState('')
  const [qrToken, setQrToken] = useState('')
  const [qrExpiresAt, setQrExpiresAt] = useState('')
  const [qrInput, setQrInput] = useState('')
  const [qrBusy, setQrBusy] = useState(false)
  const [qrCameraActive, setQrCameraActive] = useState(false)
  const [reportPerson, setReportPerson] = useState<Profile | null>(null)
  const [reportReason, setReportReason] = useState<'spam'|'harassment'|'impersonation'|'inappropriate_content'|'other'>('spam')
  const [reportDetails, setReportDetails] = useState('')
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const attachmentInputRef = useRef<HTMLInputElement | null>(null)
  const documentInputRef = useRef<HTMLInputElement | null>(null)
  const cameraInputRef = useRef<HTMLInputElement | null>(null)
  const qrScanVideoRef = useRef<HTMLVideoElement | null>(null)
  const voiceRecorderRef = useRef<MediaRecorder | null>(null)
  const voiceChunksRef = useRef<Blob[]>([])
  const qrCameraStreamRef = useRef<MediaStream | null>(null)
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
      setChatSettings({})
      return
    }

    const [conversationResult, allMembersResult, messageResult, settingsResult] = await Promise.all([
      supabase.from('conversations')
        .select('id,title,is_group,direct_key,created_at')
        .in('id', conversationIds),
      supabase.from('conversation_members')
        .select('conversation_id,user_id')
        .in('conversation_id', conversationIds),
      supabase.from('messages')
        .select('id,conversation_id,sender_id,content,created_at')
        .in('conversation_id', conversationIds)
        .order('created_at', { ascending: false })
        .limit(250),
      supabase.from('conversation_user_settings')
        .select('conversation_id,is_favorite,is_muted,is_pinned,is_archived,last_read_at')
        .eq('user_id', userId)
        .in('conversation_id', conversationIds),
    ])
    if (conversationResult.error) throw conversationResult.error
    if (allMembersResult.error) throw allMembersResult.error
    if (messageResult.error) throw messageResult.error
    if (settingsResult.error) throw settingsResult.error

    const conversations = (conversationResult.data ?? []) as ConversationRow[]
    const members = (allMembersResult.data ?? []) as { conversation_id: string; user_id: string }[]
    const peopleIds = [...new Set(members.filter((m) => m.user_id !== userId).map((m) => m.user_id))]
    const peopleResult = peopleIds.length
      ? await supabase.from('profiles').select('id,username,full_name,avatar_url,created_at').in('id', peopleIds)
      : { data: [] as Profile[], error: null }
    if (peopleResult.error) throw peopleResult.error

    const people = new Map(((peopleResult.data ?? []) as Profile[]).map((person) => [person.id, person]))
    const latest = new Map<string, MessageRow>()
    const messagesByConversation = new Map<string, MessageRow[]>()
    for (const item of (messageResult.data ?? []) as MessageRow[]) {
      if (!latest.has(item.conversation_id)) latest.set(item.conversation_id, item)
      const group = messagesByConversation.get(item.conversation_id) ?? []
      group.push(item)
      messagesByConversation.set(item.conversation_id, group)
    }
    const settings = new Map(((settingsResult.data ?? []) as ConversationSetting[]).map((row) => [row.conversation_id, row]))
    setChatSettings(Object.fromEntries(settings.entries()))

    const summaries: ChatSummary[] = conversations.flatMap((conversation) => {
      const conversationMembers = members.filter((m) => m.conversation_id === conversation.id)
      const otherMembers = conversationMembers.filter((m) => m.user_id !== userId)
      const person = !conversation.is_group && otherMembers.length === 1 ? people.get(otherMembers[0].user_id) ?? null : null
      if (!conversation.is_group && !person) return []
      const last = latest.get(conversation.id)
      const preference = settings.get(conversation.id)
      const lastReadAt = preference?.last_read_at ?? null
      const unreadCount = (messagesByConversation.get(conversation.id) ?? []).filter((item) =>
        item.sender_id !== userId && (!lastReadAt || item.created_at > lastReadAt)
      ).length
      return [{
        conversationId: conversation.id,
        person,
        title: conversation.title,
        isGroup: conversation.is_group,
        memberCount: conversationMembers.length,
        lastMessage: last?.content,
        lastAt: last?.created_at,
        lastSenderId: last?.sender_id,
        unreadCount,
        isFavorite: preference?.is_favorite ?? false,
        isMuted: preference?.is_muted ?? false,
        isPinned: preference?.is_pinned ?? false,
        isArchived: preference?.is_archived ?? false,
      }]
    }).sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || (b.lastAt ?? '').localeCompare(a.lastAt ?? ''))

    setChats(summaries)
  }, [supabase, userId])

  const loadChatMessages = useCallback(async (conversationId: string) => {
    setChatLoading(true)
    const { data, error: loadError } = await supabase
      .from('messages')
      .select('id,conversation_id,sender_id,content,created_at,reply_to_message_id')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(100)
    if (loadError) {
      setError(loadError.message)
      setChatMessages([])
      setMessageAttachments([])
      setMessageReactions([])
      setSavedMessageIds([])
    } else {
      const rows = (data ?? []) as MessageRow[]
      setChatMessages(rows)
      const ids = rows.map((row) => row.id)
      if (!ids.length) {
        setMessageAttachments([])
        setMessageReactions([])
        setSavedMessageIds([])
      } else {
        const [attachmentsResult, reactionsResult, savedResult] = await Promise.all([
          supabase.from('message_attachments')
            .select('id,message_id,conversation_id,uploader_id,storage_path,original_name,mime_type,byte_size,media_kind')
            .in('message_id', ids),
          supabase.from('message_reactions')
            .select('message_id,user_id,emoji,created_at')
            .in('message_id', ids),
          supabase.from('saved_messages')
            .select('message_id')
            .eq('user_id', userId)
            .in('message_id', ids),
        ])
        if (attachmentsResult.error) setError(attachmentsResult.error.message)
        if (reactionsResult.error) setError(reactionsResult.error.message)
        if (savedResult.error) setError(savedResult.error.message)
        const attachmentRows = (attachmentsResult.data ?? []) as MessageAttachmentRow[]
        const withUrls = await Promise.all(attachmentRows.map(async (attachment) => {
          const { data: signed } = await supabase.storage.from('chat-media').createSignedUrl(attachment.storage_path, 3600)
          return { ...attachment, signed_url: signed?.signedUrl ?? '' }
        }))
        setMessageAttachments(withUrls)
        setMessageReactions((reactionsResult.data ?? []) as MessageReactionRow[])
        setSavedMessageIds(((savedResult.data ?? []) as { message_id: string }[]).map((row) => row.message_id))
      }
    }
    setChatLoading(false)
  }, [supabase, userId])

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
    let active = true
    void (async () => {
      const { data, error: loadError } = await supabase
        .from('user_privacy_settings')
        .select('user_id,allow_friend_requests,discoverable,read_receipts')
        .eq('user_id', userId)
        .maybeSingle()
      if (!active) return
      if (loadError) {
        setError(loadError.message)
        return
      }
      if (data) {
        setPrivacySettings(data as PrivacySettings)
      } else {
        const defaults: PrivacySettings = {
          user_id: userId,
          allow_friend_requests: true,
          discoverable: true,
          read_receipts: true,
        }
        const { error: insertError } = await supabase
          .from('user_privacy_settings')
          .upsert(defaults, { onConflict: 'user_id' })
        if (active && insertError) setError(insertError.message)
        if (active && !insertError) setPrivacySettings(defaults)
      }
    })()
    return () => { active = false }
  }, [supabase, userId])

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
      await markChatRead(conversation.id)
      await loadChatMessages(conversation.id)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not open this chat.')
    } finally {
      setChatBusy(false)
    }
  }

  async function createGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const title = groupTitle.trim()
    const memberIds = [...new Set(selectedGroupMembers)].filter((id) => friends.some((friend) => friend.person.id === id))
    if (title.length < 2 || title.length > 60) {
      setError('Group name must be between 2 and 60 characters.')
      return
    }
    if (!memberIds.length) {
      setError('Choose at least one accepted friend.')
      return
    }

    setChatBusy(true)
    clearFeedback()
    try {
      const { data: conversation, error: createError } = await supabase
        .from('conversations')
        .insert({ title, is_group: true, created_by: userId })
        .select('id')
        .single()
      if (createError) throw createError

      const membershipsToAdd = memberIds.map((memberId) => ({
        conversation_id: conversation.id,
        user_id: memberId,
      }))
      const { error: memberError } = await supabase.from('conversation_members').insert(membershipsToAdd)
      if (memberError) throw memberError

      await refreshChats()
      setActiveChatId(conversation.id)
      setChatMessages([])
      await markChatRead(conversation.id)
      setNewChatOpen(false)
      setNewGroupMode(false)
      setGroupTitle('')
      setSelectedGroupMembers([])
      setTab('chats')
      setMessage('Group created.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create this group.')
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

  async function savePrivacySetting(field: 'allow_friend_requests'|'discoverable'|'read_receipts', value: boolean) {
    const next = { ...privacySettings, [field]: value, updated_at: new Date().toISOString() }
    setPrivacySettings(next)
    const { error: saveError } = await supabase.from('user_privacy_settings')
      .upsert(next, { onConflict: 'user_id' })
    if (saveError) {
      setPrivacySettings((current) => ({ ...current, [field]: !value }))
      setError(saveError.message)
    } else {
      setMessage('Privacy settings saved.')
    }
  }

  async function sha256Hex(value: string) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  }

  async function createFriendQr() {
    setQrBusy(true)
    setError('')
    try {
      const random = crypto.getRandomValues(new Uint8Array(32))
      const rawToken = Array.from(random, (byte) => byte.toString(16).padStart(2, '0')).join('')
      const tokenHash = await sha256Hex(rawToken)
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
      await supabase.from('friend_qr_tokens').update({ revoked_at: new Date().toISOString() })
        .eq('user_id', userId).is('redeemed_at', null).is('revoked_at', null)
      const { error: insertError } = await supabase.from('friend_qr_tokens').insert({
        user_id: userId,
        token_hash: tokenHash,
        expires_at: expiresAt,
      })
      if (insertError) throw insertError

      const { data, error: qrError } = await supabase.functions.invoke('qr-render', {
        body: { value: rawToken },
      })
      if (qrError) throw qrError
      if (!data?.svg) throw new Error('The QR image could not be generated.')
      setQrToken(rawToken)
      setQrExpiresAt(expiresAt)
      setQrSvg(String(data.svg))
      setQrMode('show')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create your friend QR.')
    } finally {
      setQrBusy(false)
    }
  }

  async function revokeFriendQr() {
    const { error: revokeError } = await supabase.from('friend_qr_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('redeemed_at', null)
      .is('revoked_at', null)
    if (revokeError) setError(revokeError.message)
    setQrToken('')
    setQrSvg('')
    setQrExpiresAt('')
    setQrMode(null)
  }

  async function redeemFriendQr() {
    const token = qrInput.match(/[a-f0-9]{64}/i)?.[0]?.toLowerCase()
    if (!token) {
      setError('Scan a Connectly QR code or paste its 64-character code.')
      return
    }
    setQrBusy(true)
    clearFeedback()
    try {
      const tokenHash = await sha256Hex(token)
      const { data, error: redeemError } = await supabase.rpc('redeem_friend_qr_token', {
        p_token_hash: tokenHash,
      })
      if (redeemError) throw redeemError
      const result = Array.isArray(data) ? data[0] : data
      if (!result) throw new Error('This QR code could not be redeemed.')
      const status = String(result.request_status ?? 'pending')
      setMessage(status === 'accepted'
        ? 'You are already connected with this person.'
        : status === 'request_received'
          ? 'This person has already sent you a request. Check received requests.'
          : 'Friend request sent from QR connection.')
      setQrMode(null)
      setQrInput('')
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not connect using this QR code.')
    } finally {
      setQrBusy(false)
    }
  }

  useEffect(() => {
    if (qrMode !== 'scan' || !qrCameraActive) return
    let cancelled = false
    let frame = 0
    let stream: MediaStream | null = null
    const Detector = (window as unknown as {
      BarcodeDetector?: new (options: { formats: string[] }) => {
        detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>>
      }
    }).BarcodeDetector

    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setQrCameraActive(false)
      setMessage('Camera scanning is unavailable in this browser. Paste the QR code text below instead.')
      return
    }

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        if (cancelled || !qrScanVideoRef.current) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        qrCameraStreamRef.current = stream
        qrScanVideoRef.current.srcObject = stream
        await qrScanVideoRef.current.play()
        const detector = new Detector({ formats: ['qr_code'] })
        const scanFrame = async () => {
          if (cancelled || !qrScanVideoRef.current) return
          try {
            const codes = await detector.detect(qrScanVideoRef.current)
            if (codes[0]?.rawValue) {
              setQrInput(codes[0].rawValue)
              setQrCameraActive(false)
              setMessage('QR detected. Tap Connect to continue.')
              return
            }
          } catch {
            // Continue scanning; temporary camera frames may not decode.
          }
          frame = requestAnimationFrame(() => { void scanFrame() })
        }
        void scanFrame()
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Camera access was not available.')
        setQrCameraActive(false)
      }
    })()

    return () => {
      cancelled = true
      if (frame) cancelAnimationFrame(frame)
      stream?.getTracks().forEach((track) => track.stop())
      qrCameraStreamRef.current?.getTracks().forEach((track) => track.stop())
      qrCameraStreamRef.current = null
    }
  }, [qrMode, qrCameraActive])

  async function toggleMessageReaction(item: MessageRow, emoji: string) {
    const existing = messageReactions.find((row) => row.message_id === item.id && row.user_id === userId && row.emoji === emoji)
    const result = existing
      ? await supabase.from('message_reactions').delete().eq('message_id', item.id).eq('user_id', userId).eq('emoji', emoji)
      : await supabase.from('message_reactions').insert({ message_id: item.id, user_id: userId, emoji })
    if (result.error) {
      setError(result.error.message)
      return
    }
    setReactionMenuFor(null)
    await loadChatMessages(item.conversation_id)
  }

  async function toggleSavedMessage(item: MessageRow) {
    const exists = savedMessageIds.includes(item.id)
    const result = exists
      ? await supabase.from('saved_messages').delete().eq('user_id', userId).eq('message_id', item.id)
      : await supabase.from('saved_messages').insert({ user_id: userId, message_id: item.id })
    if (result.error) {
      setError(result.error.message)
      return
    }
    setSavedMessageIds((items) => exists ? items.filter((id) => id !== item.id) : [...items, item.id])
    setMessage(exists ? 'Removed from Connectly Notes.' : 'Saved to Connectly Notes.')
    setMessageMenuFor(null)
  }

  async function loadSavedMessages() {
    const { data, error: savedError } = await supabase.from('saved_messages')
      .select('message_id,note,saved_at')
      .eq('user_id', userId)
      .order('saved_at', { ascending: false })
      .limit(100)
    if (savedError) {
      setError(savedError.message)
      return
    }
    const rows = (data ?? []) as { message_id: string; note: string | null; saved_at: string }[]
    if (!rows.length) {
      setSavedMessages([])
      setSavedMessagesOpen(true)
      return
    }
    const { data: messagesData, error: messagesError } = await supabase.from('messages')
      .select('id,conversation_id,sender_id,content,created_at,reply_to_message_id')
      .in('id', rows.map((row) => row.message_id))
    if (messagesError) {
      setError(messagesError.message)
      return
    }
    const byId = new Map(((messagesData ?? []) as MessageRow[]).map((item) => [item.id, item]))
    setSavedMessages(rows.flatMap((row) => {
      const item = byId.get(row.message_id)
      return item ? [{ ...row, message: item }] : []
    }))
    setSavedMessagesOpen(true)
  }

  async function loadConnectlyTasks() {
    const { data, error: taskError } = await supabase.from('connectly_tasks')
      .select('id,user_id,conversation_id,message_id,title,due_at,status,created_at')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(100)
    if (taskError) { setError(taskError.message); return }
    setTasks((data ?? []) as ConnectlyTask[])
    setTasksOpen(true)
  }

  function startTaskFromMessage(item: MessageRow) {
    setTaskSourceMessage(item)
    setTaskTitle(item.content.trim().slice(0, 160) || 'Follow up on this shared item')
    setTaskDueAt('')
    setMessageMenuFor(null)
  }

  async function createConnectlyTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const title = taskTitle.trim()
    const conversationId = taskSourceMessage?.conversation_id || activeChatId
    if (!title || !conversationId) { setError('Add a task title and open a conversation first.'); return }
    setTaskBusy(true)
    setError('')
    try {
      const dueAt = taskDueAt ? new Date(taskDueAt + 'T23:59:00').toISOString() : null
      const { data, error: insertError } = await supabase.from('connectly_tasks')
        .insert({ user_id: userId, conversation_id: conversationId, message_id: taskSourceMessage?.id ?? null, title, due_at: dueAt })
        .select('id,user_id,conversation_id,message_id,title,due_at,status,created_at').single()
      if (insertError) throw insertError
      setTasks((items) => [data as ConnectlyTask, ...items])
      setTaskSourceMessage(null)
      setTaskTitle('')
      setTaskDueAt('')
      setMessage('Saved to Connectly Tasks.')
      setTasksOpen(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create the task.')
    } finally { setTaskBusy(false) }
  }

  async function toggleConnectlyTask(task: ConnectlyTask) {
    const nextStatus = task.status === 'done' ? 'open' : 'done'
    const { data, error: updateError } = await supabase.from('connectly_tasks')
      .update({ status: nextStatus }).eq('id', task.id).eq('user_id', userId)
      .select('id,user_id,conversation_id,message_id,title,due_at,status,created_at').single()
    if (updateError) { setError(updateError.message); return }
    setTasks((items) => items.map((item) => item.id === task.id ? data as ConnectlyTask : item))
  }

  async function uploadMessageFile(file: File, forcedKind?: 'audio') {
    if (!activeChatId) return
    if (file.size <= 0 || file.size > 25 * 1024 * 1024) {
      setError('Files must be smaller than 25 MB.')
      return
    }
    const mime = file.type || 'application/octet-stream'
    const kind: MessageAttachmentRow['media_kind'] = forcedKind || (
      mime.startsWith('image/') ? 'image' :
      mime.startsWith('video/') ? 'video' :
      mime.startsWith('audio/') ? 'audio' : 'document'
    )
    const allowed = mime.startsWith('image/') || mime.startsWith('video/') || mime.startsWith('audio/')
      || ['application/pdf','text/plain','application/zip','application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(mime)
    if (!allowed) {
      setError('Supported files: photos, videos, voice notes, PDF, TXT, ZIP and DOCX.')
      return
    }
    setUploadingMedia(true)
    clearFeedback()
    let storagePath = ''
    let createdMessageId = ''
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100) || 'attachment'
      storagePath = `${activeChatId}/${userId}/${crypto.randomUUID()}-${safeName}`
      const { error: uploadError } = await supabase.storage.from('chat-media').upload(storagePath, file, {
        contentType: mime,
        upsert: false,
      })
      if (uploadError) throw uploadError

      const messageText = kind === 'audio' ? 'Voice message' :
        kind === 'image' ? 'Photo' : kind === 'video' ? 'Video' : `📎 ${safeName}`
      const { data: messageRow, error: messageError } = await supabase.from('messages').insert({
        conversation_id: activeChatId,
        sender_id: userId,
        content: messageText,
        reply_to_message_id: replyingTo?.id ?? null,
      }).select('id').single()
      if (messageError) throw messageError
      createdMessageId = messageRow.id

      const { error: attachmentError } = await supabase.from('message_attachments').insert({
        message_id: createdMessageId,
        conversation_id: activeChatId,
        uploader_id: userId,
        storage_path: storagePath,
        original_name: safeName,
        mime_type: mime,
        byte_size: file.size,
        media_kind: kind,
      })
      if (attachmentError) throw attachmentError

      setReplyingTo(null)
      setMediaMenuOpen(false)
      setMessage('Attachment sent.')
      await loadChatMessages(activeChatId)
      await refreshChats()
    } catch (caught) {
      if (createdMessageId) {
        await supabase.from('messages').delete().eq('id', createdMessageId).eq('sender_id', userId)
      }
      if (storagePath) {
        await supabase.storage.from('chat-media').remove([storagePath])
      }
      setError(caught instanceof Error ? caught.message : 'The attachment could not be sent.')
    } finally {
      setUploadingMedia(false)
    }
  }

  async function toggleVoiceRecording() {
    if (recordingVoice && voiceRecorderRef.current) {
      voiceRecorderRef.current.stop()
      setRecordingVoice(false)
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Voice recording is not supported by this browser.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const preferred = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' :
        MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : ''
      const recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined)
      voiceRecorderRef.current = recorder
      voiceChunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data.size) voiceChunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        const type = recorder.mimeType || 'audio/webm'
        const blob = new Blob(voiceChunksRef.current, { type })
        stream.getTracks().forEach((track) => track.stop())
        voiceRecorderRef.current = null
        if (blob.size) {
          const extension = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm'
          const file = new File([blob], `voice-${Date.now()}.${extension}`, { type })
          void uploadMessageFile(file, 'audio')
        }
      }
      recorder.start()
      setRecordingVoice(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Microphone permission was not granted.')
    }
  }

  async function submitUserReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!reportPerson) return
    const { error: reportError } = await supabase.from('user_reports').insert({
      reporter_id: userId,
      reported_user_id: reportPerson.id,
      reason: reportReason,
      details: reportDetails.trim() || null,
      status: 'submitted',
    })
    if (reportError) {
      setError(reportError.message)
      return
    }
    setReportPerson(null)
    setReportDetails('')
    setMessage('Thank you. Your report has been submitted for review.')
  }

  async function copyMessage(item: MessageRow) {
    try {
      await navigator.clipboard.writeText(item.content)
      setMessage('Message copied.')
    } catch {
      setError('Copy is unavailable in this browser. Long-press the message text to copy it.')
    }
    setMessageMenuFor(null)
  }

  async function deleteOwnMessage(item: MessageRow) {
    if (item.sender_id !== userId) return
    if (!window.confirm('Delete this message for everyone in this conversation?')) {
      setMessageMenuFor(null)
      return
    }
    const { error: deleteError } = await supabase.from('messages').delete().eq('id', item.id).eq('sender_id', userId)
    if (deleteError) { setError(deleteError.message); return }
    setMessageMenuFor(null)
    await loadChatMessages(item.conversation_id)
    await refreshChats()
    setMessage('Message deleted for everyone in this conversation.')
  }

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
      reply_to_message_id: replyingTo?.id ?? null,
    })
    if (sendError) {
      setError(sendError.message)
    } else {
      setChatDraft('')
      setReplyingTo(null)
      setMessageMenuFor(null)
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
        if (privacySettings.read_receipts) {
          void supabase.from('conversation_user_settings').update({ last_read_at: new Date().toISOString() })
            .eq('conversation_id', activeChatId).eq('user_id', userId)
        }
        void refreshChats()
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [supabase, activeChatId, loadChatMessages, refreshChats, privacySettings.read_receipts])

  const navItems: { id: Tab; icon: string; label: string; count?: number }[] = [
    { id: 'chats', icon: '▤', label: 'Chats', count: chats.reduce((n, chat) => n + chat.unreadCount, 0) },
    { id: 'updates', icon: '◉', label: 'Updates' },
    { id: 'communities', icon: '♧', label: 'Communities' },
    { id: 'calls', icon: '☎', label: 'Calls' },
  ]
  const firstName = profile.full_name?.trim().split(/\s+/)[0] || profile.username || 'there'
  const searchedChats = chats.filter((chat) => {
    const term = chatSearch.trim().toLowerCase()
    const displayName = chat.isGroup ? (chat.title || 'Group chat') : nameOf(chat.person)
    const usernameMatch = chat.person?.username.toLowerCase().includes(term) ?? false
    return !term || displayName.toLowerCase().includes(term)
      || (chat.lastMessage ?? '').toLowerCase().includes(term)
      || usernameMatch
  })
  const filteredChats = searchedChats.filter((chat) => {
    if (inboxFilter === 'archived') return chat.isArchived
    if (chat.isArchived) return false
    if (inboxFilter === 'unread') return chat.unreadCount > 0
    if (inboxFilter === 'favorites') return chat.isFavorite
    if (inboxFilter === 'pinned') return chat.isPinned
    if (inboxFilter === 'groups') return chat.isGroup
    return true
  })
  const activeChat = chats.find((chat) => chat.conversationId === activeChatId) ?? null
  const activeChatPerson = activeChat?.person ?? null
  const visibleMessages = chatMessages.filter((item) => !messageSearch.trim() || item.content.toLowerCase().includes(messageSearch.trim().toLowerCase()))

  async function markChatRead(conversationId: string) {
    if (!privacySettings.read_receipts) return
    const current = chatSettings[conversationId]
    const timestamp = new Date().toISOString()
    const row = {
      conversation_id: conversationId,
      user_id: userId,
      is_favorite: current?.is_favorite ?? false,
      is_muted: current?.is_muted ?? false,
      is_pinned: current?.is_pinned ?? false,
      is_archived: current?.is_archived ?? false,
      last_read_at: timestamp,
    }
    const { error: saveError } = await supabase.from('conversation_user_settings')
      .upsert(row, { onConflict: 'conversation_id,user_id' })
    if (saveError) {
      setError(saveError.message)
      return
    }
    setChatSettings((items) => ({ ...items, [conversationId]: { ...row } }))
    setChatMenuFor(null)
    await refreshChats()
  }

  async function markChatUnread(chat: ChatSummary) {
    const current = chatSettings[chat.conversationId]
    const latestTimestamp = chat.lastAt ? new Date(new Date(chat.lastAt).getTime() - 1).toISOString() : null
    if (!latestTimestamp) {
      setError('This conversation has no messages to mark unread yet.')
      setChatMenuFor(null)
      return
    }
    const row = {
      conversation_id: chat.conversationId,
      user_id: userId,
      is_favorite: current?.is_favorite ?? false,
      is_muted: current?.is_muted ?? false,
      is_pinned: current?.is_pinned ?? false,
      is_archived: current?.is_archived ?? false,
      last_read_at: latestTimestamp,
    }
    const { error: saveError } = await supabase.from('conversation_user_settings')
      .upsert(row, { onConflict: 'conversation_id,user_id' })
    if (saveError) { setError(saveError.message); return }
    setChatSettings((items) => ({ ...items, [chat.conversationId]: { ...row } }))
    setChatMenuFor(null)
    await refreshChats()
  }

  async function markAllChatsRead() {
    const timestamp = new Date().toISOString()
    const rows = chats.map((chat) => ({
      conversation_id: chat.conversationId,
      user_id: userId,
      is_favorite: chatSettings[chat.conversationId]?.is_favorite ?? false,
      is_muted: chatSettings[chat.conversationId]?.is_muted ?? false,
      is_pinned: chatSettings[chat.conversationId]?.is_pinned ?? false,
      is_archived: chatSettings[chat.conversationId]?.is_archived ?? false,
      last_read_at: timestamp,
    }))
    if (!rows.length) { setMoreMenuOpen(false); return }
    const { error: saveError } = await supabase.from('conversation_user_settings')
      .upsert(rows, { onConflict: 'conversation_id,user_id' })
    if (saveError) { setError(saveError.message); return }
    setChatSettings((items) => ({ ...items, ...Object.fromEntries(rows.map((row) => [row.conversation_id, row])) }))
    setMoreMenuOpen(false)
    await refreshChats()
    setMessage('All conversations marked as read.')
  }

  async function setConversationFlag(chat: ChatSummary, field: 'is_favorite'|'is_muted'|'is_pinned'|'is_archived') {
    const current = chatSettings[chat.conversationId]
    const row = {
      conversation_id: chat.conversationId,
      user_id: userId,
      is_favorite: field === 'is_favorite' ? !chat.isFavorite : (current?.is_favorite ?? false),
      is_muted: field === 'is_muted' ? !chat.isMuted : (current?.is_muted ?? false),
      is_pinned: field === 'is_pinned' ? !chat.isPinned : (current?.is_pinned ?? false),
      is_archived: field === 'is_archived' ? !chat.isArchived : (current?.is_archived ?? false),
      last_read_at: current?.last_read_at ?? null,
    }
    const { error: saveError } = await supabase.from('conversation_user_settings')
      .upsert(row, { onConflict: 'conversation_id,user_id' })
    if (saveError) { setError(saveError.message); return }
    setChatSettings((items) => ({ ...items, [chat.conversationId]: { ...row } }))
    setChatMenuFor(null)
    await refreshChats()
  }

  async function selectChat(chat: ChatSummary) {
    setActiveChatId(chat.conversationId)
    setChatMessages([])
    setEmojiOpen(false)
    setChatMenuFor(null)
    setMessageMenuFor(null)
    setReplyingTo(null)
    setMessageSearch('')
    setMessageSearchOpen(false)
    clearFeedback()
    await markChatRead(chat.conversationId)
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
            <button type="button" className="topbar-icon-button" aria-label="Open updates" title="Updates" onClick={() => setTab('updates')}>▣</button>
            <button type="button" className="topbar-icon-button" aria-label="Search chats" title="Search chats" onClick={() => { setTab('chats'); setShowInboxSearch((value) => !value) }}>⌕</button>
            <button type="button" className="topbar-icon-button" aria-label="More options" title="More options" onClick={() => setMoreMenuOpen((value) => !value)}>⋮</button>
            {moreMenuOpen && <div className="topbar-more-menu">
              <button type="button" onClick={() => { setNewChatOpen(true); setNewGroupMode(false); setMoreMenuOpen(false) }}>New chat</button>
              <button type="button" onClick={() => { setNewChatOpen(true); setNewGroupMode(true); setMoreMenuOpen(false) }}>New group</button>
              <button type="button" onClick={() => { setInboxFilter('archived'); setTab('chats'); setMoreMenuOpen(false) }}>Archived chats</button>
               <button type="button" onClick={() => void markAllChatsRead()}>Mark all as read</button>
              <button type="button" onClick={() => { setMoreMenuOpen(false); void loadSavedMessages() }}>Connectly Notes</button>
               <button type="button" onClick={() => { setMoreMenuOpen(false); void loadConnectlyTasks() }}>Connectly Tasks</button>
               <button type="button" onClick={() => { setMoreMenuOpen(false); void createFriendQr() }}>Show my QR</button>
               <button type="button" onClick={() => { setQrMode('scan'); setQrInput(''); setQrCameraActive(false); setMoreMenuOpen(false) }}>Scan friend QR</button>
              <button type="button" onClick={() => { setTab('profile'); setMoreMenuOpen(false) }}>Settings & profile</button>
              <button type="button" onClick={() => { setMoreMenuOpen(false); void signOut() }}>Sign out</button>
            </div>}
            <button type="button" className="topbar-avatar" onClick={() => setTab('profile')} aria-label="Open profile">
              {profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : initialOf(profile)}
            </button>
          </div>
        </header>
        {(message || error) && <div className={`global-feedback ${error ? 'feedback-error' : 'feedback-success'}`} role="status">{error || message}<button onClick={clearFeedback} aria-label="Dismiss message">×</button></div>}

        {tab === 'chats' && <section className="inbox-layout whatsapp-inbox">
          {!activeChatId ? <>
            <div className="inbox-title-row whatsapp-title-row">
              <div><p className="eyebrow">YOUR MESSAGES</p><h3>Chats <span className="chat-total">{chats.length}</span></h3></div>
              <button type="button" className="inbox-camera-action" aria-label="Open profile options" title="More options" onClick={() => setMoreMenuOpen((value) => !value)}>⋮</button>
            </div>

            <div className="inbox-filter-chips" role="tablist" aria-label="Filter chats">
              {([
                ['all', 'All'],
                ['unread', 'Unread'],
                ['favorites', 'Favorites'],
                ['pinned', 'Pinned'],
                ['groups', 'Groups'],
                ['archived', 'Archived'],
              ] as [InboxFilter, string][]).map(([value, label]) => <button
                type="button"
                role="tab"
                aria-selected={inboxFilter === value}
                className={`inbox-filter-chip ${inboxFilter === value ? 'active' : ''}`}
                key={value}
                onClick={() => setInboxFilter(value)}
              >{label}</button>)}
            </div>

            {showInboxSearch && <label className="inbox-search glass-panel whatsapp-search">
              <span aria-hidden="true">⌕</span>
              <input ref={searchInputRef} value={chatSearch} onChange={(event) => setChatSearch(event.target.value)} placeholder="Search name or message…" aria-label="Search chats" />
              {chatSearch && <button type="button" onClick={() => setChatSearch('')} aria-label="Clear search">×</button>}
            </label>}

            <div className="inbox-list whatsapp-chat-list" aria-live="polite">
              {filteredChats.map((chat) => <article className="whatsapp-chat-row" key={chat.conversationId}>
                <button type="button" className="whatsapp-chat-main" onClick={() => void selectChat(chat)}>
                  <span className={`inbox-avatar whatsapp-chat-avatar ${chat.isGroup ? 'group-avatar' : ''}`}>
                    {!chat.isGroup && chat.person?.avatar_url ? <img src={chat.person.avatar_url} alt="" /> : chat.isGroup ? '♧' : initialOf(chat.person)}
                  </span>
                  <span className="inbox-chat-copy">
                    <strong>{chat.isGroup ? (chat.title || 'Group chat') : nameOf(chat.person)}</strong>
                    <small>{chat.lastMessage ? `${chat.lastSenderId === userId ? 'You: ' : ''}${chat.lastMessage}` : 'Start the conversation'}</small>
                  </span>
                  <span className="inbox-chat-meta whatsapp-chat-meta">
                    <time>{chat.lastAt ? formatChatTime(chat.lastAt) : ''}</time>
                    <span className="chat-meta-indicators">
                      {chat.isPinned && <span className="chat-pin-indicator" title="Pinned">⌖</span>}
                      {chat.isMuted && <span className="chat-muted-indicator" title="Muted">♩̸</span>}
                      {chat.isFavorite && <span className="chat-favorite-indicator" title="Favorite">★</span>}
                      {chat.unreadCount > 0 && <b className="chat-unread-count">{chat.unreadCount > 99 ? '99+' : chat.unreadCount}</b>}
                    </span>
                  </span>
                </button>
                <button type="button" className={`chat-row-star ${chat.isFavorite ? 'selected' : ''}`} onClick={() => void setConversationFlag(chat, 'is_favorite')} aria-label={chat.isFavorite ? 'Remove from favorites' : 'Add to favorites'} title={chat.isFavorite ? 'Unfavorite' : 'Favorite'}>{chat.isFavorite ? '★' : '☆'}</button>
                <div className="chat-row-menu-wrap">
                  <button type="button" className="chat-row-menu-button" onClick={() => setChatMenuFor(chatMenuFor === chat.conversationId ? null : chat.conversationId)} aria-label="Chat options" title="Chat options">⋮</button>
                  {chatMenuFor === chat.conversationId && <div className="chat-row-menu">
                    <button type="button" onClick={() => void setConversationFlag(chat, 'is_favorite')}>{chat.isFavorite ? 'Remove favorite' : 'Add to favorites'}</button>
                    <button type="button" onClick={() => void setConversationFlag(chat, 'is_pinned')}>{chat.isPinned ? 'Unpin chat' : 'Pin chat'}</button>
                     <button type="button" onClick={() => void setConversationFlag(chat, 'is_muted')}>{chat.isMuted ? 'Unmute chat' : 'Mute chat'}</button>
                    <button type="button" onClick={() => void (chat.unreadCount > 0 ? markChatRead(chat.conversationId) : markChatUnread(chat))}>{chat.unreadCount > 0 ? 'Mark as read' : 'Mark as unread'}</button>
                     <button type="button" onClick={() => void setConversationFlag(chat, 'is_archived')}>{chat.isArchived ? 'Move to inbox' : 'Archive chat'}</button>
                    <button type="button" onClick={() => { setChatMenuFor(null); void selectChat(chat) }}>Open chat</button>
                  </div>}
                </div>
              </article>)}
              {!filteredChats.length && <div className="inbox-empty glass-panel">
                <div className="inbox-empty-icon">{inboxFilter === 'favorites' ? '★' : inboxFilter === 'pinned' ? '⌖' : inboxFilter === 'groups' ? '♧' : inboxFilter === 'archived' ? '▣' : '✉'}</div>
                <h4>{chatSearch ? 'No matching chats' : inboxFilter === 'unread' ? 'All caught up' : inboxFilter === 'favorites' ? 'No favorite chats yet' : inboxFilter === 'pinned' ? 'No pinned chats yet' : inboxFilter === 'groups' ? 'No group conversations yet' : inboxFilter === 'archived' ? 'No archived chats' : 'Your inbox is ready'}</h4>
                <p>{chatSearch ? 'Try another name or message.' : inboxFilter === 'unread' ? 'New messages will appear here.' : inboxFilter === 'favorites' ? 'Star a chat to keep it easy to find.' : inboxFilter === 'pinned' ? 'Pin important conversations to keep them at the top.' : inboxFilter === 'groups' ? 'Group conversations will appear here when created.' : inboxFilter === 'archived' ? 'Archived conversations stay out of your main inbox.' : 'Start a conversation with someone in your friends list.'}</p>
              </div>}
            </div>

            <button type="button" className="whatsapp-compose-fab" aria-label="New chat" title="New chat" onClick={() => setNewChatOpen(true)}>＋</button>
            <section className="inbox-people-tools whatsapp-social-tools">
              <details className="inbox-social-accordion">
                <summary>Friends <span>{friends.length}</span></summary>
                {friends.length ? <div className="inbox-friends-list">
                  {friends.map((friend) => <button type="button" className="inbox-friend-row inbox-friend-profile-button" key={friend.requestId} onClick={() => void showPersonDetails(friend.person)} aria-label={`Open ${nameOf(friend.person)} profile`}>
                    <span className="inbox-avatar">{friend.person.avatar_url ? <img src={friend.person.avatar_url} alt="" /> : initialOf(friend.person)}</span>
                    <span className="inbox-friend-copy"><strong>{nameOf(friend.person)}</strong><small>@{friend.person.username}</small></span><span className="friend-profile-hint">View profile ›</span>
                  </button>)}
                </div> : <p className="inbox-people-empty">Your accepted friends will appear here.</p>}
              </details>
              <details className="inbox-social-accordion">
                <summary>Received requests <span>{incoming.length}</span></summary>
                {incoming.length ? <div className="inbox-friends-list">
                  {incoming.map((request) => <article className="inbox-friend-row inbox-request-row" key={request.id}>
                    <span className="inbox-avatar">{request.person?.avatar_url ? <img src={request.person.avatar_url} alt="" /> : initialOf(request.person)}</span>
                    <span className="inbox-friend-copy"><strong>{nameOf(request.person)}</strong><small>@{request.person?.username}</small></span>
                    <button type="button" className="button button-primary" onClick={() => respond(request, 'accepted')} disabled={busy}>Accept</button>
                    <button type="button" className="button button-subtle" onClick={() => respond(request, 'declined')} disabled={busy}>Decline</button>
                  </article>)}
                </div> : <p className="inbox-people-empty">No received requests right now.</p>}
              </details>
              <details className="inbox-social-accordion">
                <summary>Find people</summary>
                <form className="search-bar glass-panel" onSubmit={searchPeople}>
                  <span className="search-symbol">⌕</span>
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search username…" aria-label="Search username" />
                  <button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Searching…' : 'Search'}</button>
                </form>
                {results.length > 0 && <div className="inbox-friends-list inbox-search-results">
                  {results.map((person) => <article className="inbox-friend-row" key={person.id}>
                    <span className="inbox-avatar">{person.avatar_url ? <img src={person.avatar_url} alt="" /> : initialOf(person)}</span>
                    <span className="inbox-friend-copy"><strong>{nameOf(person)}</strong><small>@{person.username}</small></span>
                    <button type="button" className="button button-primary" onClick={() => void sendRequest(person)} disabled={busy}>Add friend</button>
                  </article>)}
                </div>}
              </details>
            </section>
          </> : <>
            <section className="conversation-screen whatsapp-conversation">
              <header className="conversation-topbar whatsapp-conversation-topbar">
                <button type="button" className="back-to-inbox" aria-label="Back to chats" onClick={() => { setActiveChatId(''); setChatMessages([]); void refreshChats() }}><span>‹</span></button>
                {activeChat ? <button type="button" className="conversation-person conversation-person-button" onClick={() => activeChatPerson && void showPersonDetails(activeChatPerson)} aria-label={activeChatPerson ? `View ${nameOf(activeChatPerson)}'s profile` : 'Group details'}>
                  <span className="inbox-avatar small">
                    {activeChatPerson?.avatar_url ? <img src={activeChatPerson.avatar_url} alt="" /> : activeChat?.isGroup ? '♧' : initialOf(activeChatPerson)}
                  </span>
                  <span><strong>{activeChat.isGroup ? (activeChat.title || 'Group chat') : nameOf(activeChatPerson)}</strong><small>{activeChat.isGroup ? `${activeChat.memberCount} members` : `@${activeChatPerson?.username} · Connectly friend`}</small></span>
                </button> : <div className="conversation-person"><span className="inbox-avatar small">C</span><span><strong>Connectly chat</strong><small>Private conversation</small></span></div>}
                <div className="conversation-actions">
                  <button type="button" className="conversation-action-button" title="Search this chat" aria-label="Search this chat" onClick={() => { setMessageSearchOpen((value) => !value); setMessageSearch('') }}>⌕</button>
                  {activeChatPerson && <>
                    <button type="button" className="conversation-action-button" title="Video call" aria-label="Video call" disabled={!!callState} onClick={() => void startCall(activeChatPerson, 'video')}>▣</button>
                    <button type="button" className="conversation-action-button" title="Audio call" aria-label="Audio call" disabled={!!callState} onClick={() => void startCall(activeChatPerson, 'audio')}>☎</button>
                  </>}
                  <button type="button" className="conversation-action-button" title="More chat options" aria-label="More chat options" onClick={() => setChatMenuFor(chatMenuFor === activeChatId ? null : activeChatId)}>⋮</button>
                  {chatMenuFor === activeChatId && <div className="conversation-more-menu">
                    {activeChatPerson && <button type="button" onClick={() => { setChatMenuFor(null); void showPersonDetails(activeChatPerson) }}>Contact info</button>}
                    <button type="button" onClick={() => { if (activeChat) void setConversationFlag(activeChat, 'is_favorite'); setChatMenuFor(null) }}>{activeChat?.isFavorite ? 'Remove favorite' : 'Add to favorites'}</button>
                    <button type="button" onClick={() => { if (activeChat) void setConversationFlag(activeChat, 'is_muted'); setChatMenuFor(null) }}>{activeChat?.isMuted ? 'Unmute chat' : 'Mute notifications'}</button>
                  </div>}
                </div>
              </header>

              <div className="chat-encryption-notice chat-encryption-warning" role="note">
                <span aria-hidden="true">ⓘ</span>
                <div><strong>End-to-end encryption is not enabled yet.</strong><small>Messages are protected in transit, but Connectly's current message records are readable by the service. Avoid sending private or sensitive information here.</small></div>
                <button type="button" onClick={() => setSecurityInfoOpen(true)}>Security info</button>
              </div>

              {messageSearchOpen && <label className="conversation-search-bar"><span aria-hidden="true">⌕</span><input autoFocus value={messageSearch} onChange={(event) => setMessageSearch(event.target.value)} placeholder="Search messages in this chat…" aria-label="Search messages in this chat" />{messageSearch && <button type="button" onClick={() => setMessageSearch('')} aria-label="Clear message search">×</button>}</label>}
              <div className="conversation-messages whatsapp-message-wall" aria-live="polite">
                {chatLoading && !chatMessages.length && <p className="quiet-empty">Loading messages…</p>}
                {!chatLoading && !chatMessages.length && <div className="conversation-empty"><span>✦</span><strong>Say hello.</strong><p>Your conversation starts here.</p></div>}
                {visibleMessages.map((item, index) => {
                  const previous = visibleMessages[index - 1]
                  const isNewDay = !previous || new Date(previous.created_at).toDateString() !== new Date(item.created_at).toDateString()
                  return <div key={item.id}>
                    {isNewDay && <div className="chat-day-divider"><span>{formatMessageDay(item.created_at)}</span></div>}
                    <div className={`chat-message-row ${item.sender_id === userId ? 'mine' : 'theirs'}`}>
                      <div className="chat-bubble-wrap">
                        <div className="chat-bubble">
                          {item.reply_to_message_id && (() => {
                            const original = chatMessages.find((message) => message.id === item.reply_to_message_id)
                            return original ? <div className="chat-reply-reference"><small>{original.sender_id === userId ? 'You' : nameOf(activeChatPerson)} replied to</small><p>{original.content}</p></div> : null
                          })()}
                          {messageAttachments.filter((attachment) => attachment.message_id === item.id).map((attachment) => attachment.signed_url ? <div className="chat-attachment-preview" key={attachment.id}>
                            {attachment.media_kind === 'image'
                              ? <a href={attachment.signed_url} target="_blank" rel="noreferrer"><img src={attachment.signed_url} alt={attachment.original_name} /></a>
                              : attachment.media_kind === 'video'
                                ? <video controls preload="metadata" src={attachment.signed_url} />
                                : attachment.media_kind === 'audio'
                                  ? <audio controls preload="metadata" src={attachment.signed_url} />
                                  : <a className="chat-document-link" href={attachment.signed_url} target="_blank" rel="noreferrer">📄 {attachment.original_name} · Download</a>}
                          </div> : null)}
                          <p>{item.content}</p>
                          <time>{new Date(item.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}{item.sender_id === userId && <span className="message-sent-check" aria-label="Sent"> ✓</span>}</time>
                        </div>
                        {messageReactions.some((reaction) => reaction.message_id === item.id) && <div className="message-reaction-list">
                          {[...new Set(messageReactions.filter((reaction) => reaction.message_id === item.id).map((reaction) => reaction.emoji))].map((emoji) => {
                            const rows = messageReactions.filter((reaction) => reaction.message_id === item.id && reaction.emoji === emoji)
                            return <button type="button" key={emoji} className={`message-reaction-chip ${rows.some((row) => row.user_id === userId) ? 'mine' : ''}`} onClick={() => void toggleMessageReaction(item, emoji)}>{emoji} <span>{rows.length}</span></button>
                          })}
                        </div>}
                        {reactionMenuFor === item.id && <div className="message-quick-reactions">
                          {['👍','❤️','😂','😮','🙏','🔥'].map((emoji) => <button type="button" key={emoji} onClick={() => void toggleMessageReaction(item, emoji)}>{emoji}</button>)}
                        </div>}
                        <button type="button" className="message-options-button" title="Message options" aria-label="Message options" onClick={() => setMessageMenuFor(messageMenuFor === item.id ? null : item.id)}>⋮</button>
                        {messageMenuFor === item.id && <div className="message-options-menu">
                          <button type="button" onClick={() => { setReplyingTo(item); setMessageMenuFor(null); setEmojiOpen(false) }}>Reply</button>
                          <button type="button" onClick={() => { setReactionMenuFor(reactionMenuFor === item.id ? null : item.id); setMessageMenuFor(null) }}>React</button>
                          <button type="button" onClick={() => void toggleSavedMessage(item)}>{savedMessageIds.includes(item.id) ? 'Remove from Connectly Notes' : 'Save to Connectly Notes'}</button>
                          <button type="button" onClick={() => startTaskFromMessage(item)}>Turn into task</button>
                          <button type="button" onClick={() => void copyMessage(item)}>Copy</button>
                          {item.sender_id === userId && <button type="button" className="message-delete-option" onClick={() => void deleteOwnMessage(item)}>Delete for everyone</button>}
                        </div>}
                      </div>
                    </div>
                  </div>
                })}
              </div>

              {replyingTo && <div className="chat-replying-banner">
                <div><small>Replying to {replyingTo.sender_id === userId ? 'yourself' : nameOf(activeChatPerson)}</small><p>{replyingTo.content}</p></div>
                <button type="button" aria-label="Cancel reply" onClick={() => setReplyingTo(null)}>×</button>
              </div>}
              {emojiOpen && <div className="chat-emoji-picker" role="group" aria-label="Choose an emoji">
                {['😀','😂','🥰','😊','😍','👍','🙏','❤️','🎉','🔥','👏','🤗','😎','✨','💯','👋'].map((emoji) => <button type="button" key={emoji} onClick={() => setChatDraft((value) => value + emoji)}>{emoji}</button>)}
              </div>}
              <input ref={attachmentInputRef} type="file" accept="image/*,video/mp4,video/webm" hidden onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void uploadMessageFile(file); event.currentTarget.value = '' }} />
              <input ref={documentInputRef} type="file" accept=".pdf,.txt,.zip,.docx" hidden onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void uploadMessageFile(file); event.currentTarget.value = '' }} />
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" hidden onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void uploadMessageFile(file); event.currentTarget.value = '' }} />
              {mediaMenuOpen && <div className="chat-media-menu">
                <button type="button" onClick={() => { setMediaMenuOpen(false); attachmentInputRef.current?.click() }}>▧ Photos & videos</button>
                <button type="button" onClick={() => { setMediaMenuOpen(false); documentInputRef.current?.click() }}>▤ Documents</button>
                <button type="button" onClick={() => { setMediaMenuOpen(false); cameraInputRef.current?.click() }}>▣ Camera</button>
              </div>}
              {recordingVoice && <div className="voice-recording-banner"><span className="recording-dot" /> Recording voice message… <button type="button" onClick={() => void toggleVoiceRecording()}>Stop</button></div>}
              <form className="chat-compose whatsapp-composer" onSubmit={sendChatMessage}>
                <button type="button" className={`composer-action-button ${emojiOpen ? 'active' : ''}`} aria-label="Emoji" title="Emoji" onClick={() => setEmojiOpen((value) => !value)}>☺</button>
                <input value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} maxLength={5000} placeholder="Message" aria-label="Message" />
                <button type="button" className={`composer-action-button ${mediaMenuOpen ? 'active' : ''}`} aria-label="Attachments" title="Attach photo, video or document" disabled={uploadingMedia || chatBusy} onClick={() => setMediaMenuOpen((value) => !value)}>⌁</button>
                {chatDraft.trim()
                  ? <button type="submit" className="composer-send-button" aria-label="Send message" title="Send message" disabled={chatBusy || uploadingMedia}>{chatBusy || uploadingMedia ? '…' : '➤'}</button>
                  : <button type="button" className={`composer-mic-button ${recordingVoice ? 'recording' : ''}`} aria-label={recordingVoice ? 'Stop voice recording' : 'Record voice message'} title={recordingVoice ? 'Stop recording' : 'Record voice message'} disabled={uploadingMedia || chatBusy} onClick={() => void toggleVoiceRecording()}>{recordingVoice ? '■' : '♩'}</button>}
              </form>
            </section>
          </>}
        </section>}

        {tab === 'updates' && <section className="content-stack whatsapp-placeholder-page">
          <div className="inbox-title-row"><div><p className="eyebrow">UPDATES</p><h3>Status</h3></div></div>
          <div className="inbox-empty glass-panel"><div className="inbox-empty-icon">◉</div><h4>Status updates are coming next</h4><p>Share short-lived photos, text and updates with the people you choose. This section will appear here when status privacy and media storage are ready.</p></div>
        </section>}

        {tab === 'communities' && <section className="content-stack whatsapp-placeholder-page">
          <div className="inbox-title-row"><div><p className="eyebrow">YOUR GROUPS</p><h3>Communities</h3></div></div>
          <div className="inbox-list whatsapp-chat-list">
            {chats.filter((chat) => chat.isGroup).map((chat) => <button type="button" className="inbox-chat-row" key={chat.conversationId} onClick={() => void selectChat(chat)}>
              <span className="inbox-avatar group-avatar">♧</span>
              <span className="inbox-chat-copy"><strong>{chat.title || 'Group chat'}</strong><small>{chat.lastMessage || `${chat.memberCount} members`}</small></span>
              <span className="inbox-chat-meta"><time>{formatChatTime(chat.lastAt)}</time></span>
            </button>)}
            {!chats.some((chat) => chat.isGroup) && <div className="inbox-empty glass-panel"><div className="inbox-empty-icon">♧</div><h4>No communities yet</h4><p>Group conversations will show here. Group creation and community tools are planned for the next phase.</p></div>}
          </div>
        </section>}

        {tab === 'calls' && <section className="content-stack whatsapp-placeholder-page">
          <div className="inbox-title-row"><div><p className="eyebrow">CONNECTLY CALLS</p><h3>Call a friend</h3></div></div>
          <div className="inbox-list whatsapp-chat-list">
            {friends.map((friend) => <article className="inbox-chat-row whatsapp-call-row" key={friend.requestId}>
              <span className="inbox-avatar">{friend.person.avatar_url ? <img src={friend.person.avatar_url} alt="" /> : initialOf(friend.person)}</span>
              <span className="inbox-chat-copy"><strong>{nameOf(friend.person)}</strong><small>@{friend.person.username}</small></span>
              <span className="call-list-actions">
                <button type="button" className="conversation-action-button" title="Audio call" aria-label={`Audio call ${nameOf(friend.person)}`} disabled={!!callState} onClick={() => void startCall(friend.person, 'audio')}>☎</button>
                <button type="button" className="conversation-action-button" title="Video call" aria-label={`Video call ${nameOf(friend.person)}`} disabled={!!callState} onClick={() => void startCall(friend.person, 'video')}>▣</button>
              </span>
            </article>)}
            {!friends.length && <div className="inbox-empty glass-panel"><div className="inbox-empty-icon">☎</div><h4>No friends to call yet</h4><p>Accept a friend request before starting a private audio or video call.</p></div>}
          </div>
        </section>}

        {newChatOpen && <div className="modal-scrim" role="presentation" onClick={() => setNewChatOpen(false)}>
          <section className="new-chat-modal glass-panel" role="dialog" aria-modal="true" aria-labelledby="new-chat-title" onClick={(event) => event.stopPropagation()}>
            <div className="modal-heading"><div><p className="eyebrow">START A CONVERSATION</p><h3 id="new-chat-title">{newGroupMode ? 'New group' : 'New chat'}</h3></div><button type="button" className="icon-button" onClick={() => setNewChatOpen(false)} aria-label="Close new chat">×</button></div>
            <div className="new-chat-mode-switch">
              <button type="button" className={!newGroupMode ? 'selected' : ''} onClick={() => setNewGroupMode(false)}>New chat</button>
              <button type="button" className={newGroupMode ? 'selected' : ''} onClick={() => setNewGroupMode(true)}>New group</button>
            </div>
            {newGroupMode ? <form className="stack-form group-create-form" onSubmit={createGroup}>
              <label className="field-label">Group name<input value={groupTitle} onChange={(event) => setGroupTitle(event.target.value)} maxLength={60} minLength={2} placeholder="e.g. Nursing Friends" /></label>
              <p className="eyebrow">ADD FRIENDS</p>
              {friends.map((friend) => <label className="group-member-option" key={friend.requestId}>
                <span className="inbox-avatar small">{friend.person.avatar_url ? <img src={friend.person.avatar_url} alt="" /> : initialOf(friend.person)}</span>
                <span><strong>{nameOf(friend.person)}</strong><small>@{friend.person.username}</small></span>
                <input type="checkbox" checked={selectedGroupMembers.includes(friend.person.id)} onChange={(event) => setSelectedGroupMembers((current) => event.target.checked ? [...current, friend.person.id] : current.filter((id) => id !== friend.person.id))} />
              </label>)}
              <button type="submit" className="button button-primary button-wide" disabled={chatBusy || !selectedGroupMembers.length}>{chatBusy ? 'Creating…' : 'Create group'}</button>
            </form> : <>
              <label className="inbox-search glass-panel"><span>⌕</span><input value={chatSearch} onChange={(event) => setChatSearch(event.target.value)} placeholder="Search your friends…" aria-label="Search friends" /></label>
              {friends.filter((friend) => {
                const term = chatSearch.trim().toLowerCase()
                return !term || nameOf(friend.person).toLowerCase().includes(term) || friend.person.username.toLowerCase().includes(term)
              }).map((friend) => <button type="button" className="new-chat-friend" key={friend.requestId} onClick={() => { setNewChatOpen(false); setChatSearch(''); void openChat(friend.person) }}>
                <span className="inbox-avatar small">{friend.person.avatar_url ? <img src={friend.person.avatar_url} alt="" /> : initialOf(friend.person)}</span>
                <span><strong>{nameOf(friend.person)}</strong><small>@{friend.person.username}</small></span><b>Message</b>
              </button>)}
              {!friends.length && <p className="quiet-empty">Accepted friends will appear here.</p>}
            </>}
          </section>
        </div>}

          {securityInfoOpen && <div className="modal-scrim" role="presentation" onClick={() => setSecurityInfoOpen(false)}>
            <section className="new-chat-modal glass-panel security-info-modal" role="dialog" aria-modal="true" aria-labelledby="security-info-title" onClick={(event) => event.stopPropagation()}>
              <div className="modal-heading"><div><p className="eyebrow">CONNECTLY SECURITY</p><h3 id="security-info-title">Message privacy</h3></div><button type="button" className="icon-button" onClick={() => setSecurityInfoOpen(false)} aria-label="Close security information">×</button></div>
              <div className="security-info-content">
                <p><strong>Transport protection is active.</strong> HTTPS protects messages while they travel between your browser and the service.</p>
                <p><strong>End-to-end encryption is not active yet.</strong> The message text is currently stored in a form the service can read. Do not send passwords, financial details or other highly sensitive information.</p>
                <p><strong>What is needed next:</strong> a reviewed multi-device encryption protocol, device identity keys, safety-number or QR verification, encrypted key backup and encrypted media. The encryption must run on each device before a message is uploaded.</p>
                <p>Connectly will only show a lock and “End-to-end encrypted” after these checks are implemented and verified.</p>
              </div>
              <button type="button" className="button button-primary button-wide" onClick={() => setSecurityInfoOpen(false)}>I understand</button>
            </section>
          </div>}

          {qrMode && <div className="modal-scrim qr-modal-scrim" role="presentation" onClick={() => { setQrMode(null); setQrCameraActive(false) }}>
            <section className="qr-modal glass-panel" role="dialog" aria-modal="true" aria-labelledby="qr-modal-title" onClick={(event) => event.stopPropagation()}>
              <div className="modal-heading">
                <div><p className="eyebrow">CONNECTLY CONNECTION</p><h3 id="qr-modal-title">{qrMode === 'show' ? 'Your friend QR' : 'Scan a friend QR'}</h3></div>
                <button type="button" className="icon-button" onClick={() => { setQrMode(null); setQrCameraActive(false) }} aria-label="Close QR dialog">×</button>
              </div>
              {qrMode === 'show' ? <>
                <div className="qr-code-surface">
                  {qrSvg ? <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg)}`} alt="One-time Connectly friend QR code" /> : <span>QR unavailable</span>}
                </div>
                <h4 className="qr-owner-name">{nameOf(profile)}</h4>
                <p className="muted small-text qr-expiry">This code expires at {qrExpiresAt ? new Date(qrExpiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—'} and works once.</p>
                <div className="qr-profile-actions">
                  <button type="button" className="button button-subtle" onClick={() => { void navigator.clipboard.writeText(qrToken).then(() => setMessage('One-time QR code copied.')).catch(() => setError('Clipboard access is unavailable.')) }}>Copy connection code</button>
                  <button type="button" className="button button-danger" onClick={() => void revokeFriendQr()}>Revoke code</button>
                </div>
              </> : <>
                {qrCameraActive && <video ref={qrScanVideoRef} className="qr-scanner-video" autoPlay muted playsInline />}
                {!qrCameraActive && <div className="qr-scanner-placeholder"><span>▦</span><strong>Scan a Connectly QR code</strong><small>Use your camera or paste the connection code below.</small></div>}
                <button type="button" className="button button-subtle button-wide" onClick={() => setQrCameraActive((value) => !value)}>{qrCameraActive ? 'Stop camera' : 'Start camera scanner'}</button>
                <label className="field-label">QR connection code<input value={qrInput} onChange={(event) => setQrInput(event.target.value)} placeholder="Paste the 64-character code" autoCapitalize="none" autoCorrect="off" /></label>
                <button type="button" className="button button-primary button-wide" onClick={() => void redeemFriendQr()} disabled={qrBusy || qrInput.trim().length < 64}>{qrBusy ? 'Connecting…' : 'Connect'}</button>
              </>}
            </section>
          </div>}

          {savedMessagesOpen && <div className="modal-scrim" role="presentation" onClick={() => setSavedMessagesOpen(false)}>
            <section className="new-chat-modal glass-panel saved-messages-modal" role="dialog" aria-modal="true" aria-labelledby="saved-messages-title" onClick={(event) => event.stopPropagation()}>
              <div className="modal-heading"><div><p className="eyebrow">CONNECTLY NOTES</p><h3 id="saved-messages-title">Saved messages</h3></div><button type="button" className="icon-button" onClick={() => setSavedMessagesOpen(false)} aria-label="Close saved messages">×</button></div>
              {savedMessages.length ? <div className="saved-messages-list">
                {savedMessages.map((saved) => {
                  const chat = chats.find((item) => item.conversationId === saved.message.conversation_id)
                  return <article className="saved-message-item" key={saved.message_id}>
                    <p>{saved.message.content}</p>
                    <small>{chat?.isGroup ? (chat.title || 'Group chat') : nameOf(chat?.person)} · {formatChatTime(saved.saved_at)}</small>
                    <button type="button" className="text-button" onClick={() => {
                      setSavedMessagesOpen(false)
                      if (chat) void selectChat(chat)
                    }}>Open conversation</button>
                    <button type="button" className="text-button danger-text" onClick={async () => {
                      const { error: deleteError } = await supabase.from('saved_messages').delete().eq('user_id', userId).eq('message_id', saved.message_id)
                      if (deleteError) { setError(deleteError.message); return }
                      setSavedMessages((items) => items.filter((item) => item.message_id !== saved.message_id))
                      setSavedMessageIds((items) => items.filter((id) => id !== saved.message_id))
                    }}>Remove saved message</button>
                  </article>
                })}
              </div> : <div className="inbox-empty glass-panel"><span className="inbox-empty-icon">▱</span><h4>No saved messages yet</h4><p>Use a message's menu and choose Save to Connectly Notes.</p></div>}
            </section>
          </div>}

          {taskSourceMessage && <div className="modal-scrim" role="presentation" onClick={() => setTaskSourceMessage(null)}>
            <section className="new-chat-modal glass-panel task-create-modal" role="dialog" aria-modal="true" aria-labelledby="task-create-title" onClick={(event) => event.stopPropagation()}>
              <div className="modal-heading"><div><p className="eyebrow">CONNECTLY FOCUS</p><h3 id="task-create-title">Turn message into a task</h3></div><button type="button" className="icon-button" onClick={() => setTaskSourceMessage(null)} aria-label="Close task form">×</button></div>
              <form className="stack-form" onSubmit={createConnectlyTask}>
                <label className="field-label">Task title<input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} maxLength={160} required placeholder="What needs to be done?" /></label>
                <label className="field-label">Due date (optional)<input type="date" value={taskDueAt} onChange={(event) => setTaskDueAt(event.target.value)} /></label>
                <p className="muted small-text">This task is saved privately to your Connectly account and linked to this conversation.</p>
                <button type="submit" className="button button-primary button-wide" disabled={taskBusy || !taskTitle.trim()}>{taskBusy ? 'Saving…' : 'Save task'}</button>
              </form>
            </section>
          </div>}

          {tasksOpen && <div className="modal-scrim" role="presentation" onClick={() => setTasksOpen(false)}>
            <section className="new-chat-modal glass-panel tasks-list-modal" role="dialog" aria-modal="true" aria-labelledby="connectly-tasks-title" onClick={(event) => event.stopPropagation()}>
              <div className="modal-heading"><div><p className="eyebrow">CONNECTLY FOCUS</p><h3 id="connectly-tasks-title">My tasks</h3></div><button type="button" className="icon-button" onClick={() => setTasksOpen(false)} aria-label="Close tasks">×</button></div>
              {tasks.length ? <div className="connectly-task-list">
                {tasks.map((task) => <article className={`connectly-task-item ${task.status === 'done' ? 'completed' : ''}`} key={task.id}>
                  <label><input type="checkbox" checked={task.status === 'done'} onChange={() => void toggleConnectlyTask(task)} /><span><strong>{task.title}</strong><small>{task.due_at ? 'Due ' + new Date(task.due_at).toLocaleDateString() : 'No due date'} · {task.status === 'done' ? 'Completed' : 'Open'}</small></span></label>
                  <button type="button" className="text-button" onClick={() => {
                    const chat = chats.find((item) => item.conversationId === task.conversation_id)
                    setTasksOpen(false)
                    if (chat) void selectChat(chat)
                  }}>Open chat</button>
                </article>)}
              </div> : <div className="inbox-empty glass-panel"><span className="inbox-empty-icon">✓</span><h4>No tasks yet</h4><p>Open a message menu and choose “Turn into task” to keep track of something important.</p></div>}
            </section>
          </div>}

          {reportPerson && <div className="modal-scrim" role="presentation" onClick={() => setReportPerson(null)}>
            <section className="new-chat-modal glass-panel report-modal" role="dialog" aria-modal="true" aria-labelledby="report-person-title" onClick={(event) => event.stopPropagation()}>
              <div className="modal-heading"><div><p className="eyebrow">SAFETY CENTRE</p><h3 id="report-person-title">Report {nameOf(reportPerson)}</h3></div><button type="button" className="icon-button" onClick={() => setReportPerson(null)} aria-label="Close report">×</button></div>
              <form className="stack-form" onSubmit={submitUserReport}>
                <label className="field-label">Reason
                  <select value={reportReason} onChange={(event) => setReportReason(event.target.value as typeof reportReason)}>
                    <option value="spam">Spam</option><option value="harassment">Harassment or bullying</option><option value="impersonation">Impersonation</option><option value="inappropriate_content">Inappropriate content</option><option value="other">Other</option>
                  </select>
                </label>
                <label className="field-label">Details (optional)<textarea value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} maxLength={1000} rows={4} placeholder="Tell us what happened…" /></label>
                <button type="submit" className="button button-primary button-wide">Submit report</button>
              </form>
            </section>
          </div>}

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
                <button type="button" className="button button-danger" onClick={() => { setReportPerson(selectedPerson); setSelectedPerson(null) }} disabled={busy}>Report</button>
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
          <div className="form-panel glass-panel account-security-panel">
            <div className="section-heading"><div><p className="eyebrow">ACCOUNT PROTECTION</p><h3>Sign-in verification</h3></div><span className="encryption-pending-label">Setup required</span></div>
            <p className="encryption-status-copy">Additional sign-in verification is not enabled in this build. The planned options are an email one-time code and device passkeys, which can use your phone or computer's built-in fingerprint, face or screen-lock verification.</p>
            <div className="security-method-list">
              <div><span className="security-method-icon">✉</span><span><strong>Email one-time code</strong><small>Verify a sign-in with a short-lived email code.</small></span><em>Planned</em></div>
              <div><span className="security-method-icon">⌑</span><span><strong>Passkey / device biometrics</strong><small>Use Android, iOS, Windows or browser-supported device verification. Connectly will not receive face or fingerprint images.</small></span><em>Planned</em></div>
            </div>
          </div>
          <div className="form-panel glass-panel notification-settings-panel">
            <div className="section-heading"><div><p className="eyebrow">STAY IN THE LOOP</p><h3>Push notifications</h3></div><span className="encryption-pending-label">Not connected</span></div>
            <p className="encryption-status-copy">Cross-platform push delivery is not configured yet. The planned setup supports Android and desktop browsers, installed iPhone/iPad web apps where supported, and packaged apps after platform notification permissions and delivery services are configured.</p>
            <div className="security-method-list">
              <div><span className="security-method-icon">▣</span><span><strong>Web & installed app notifications</strong><small>New messages, friend requests and call alerts with per-device controls.</small></span><em>Planned</em></div>
              <div><span className="security-method-icon">⌘</span><span><strong>Desktop & packaged apps</strong><small>Windows and Linux notification integration; Android native notification channel.</small></span><em>Planned</em></div>
            </div>
          </div>
          <div className="form-panel glass-panel encryption-status-panel">
            <div className="section-heading"><div><p className="eyebrow">PRIVACY & SECURITY</p><h3>End-to-end encryption</h3></div><span className="encryption-pending-label">Not enabled</span></div>
            <p className="encryption-status-copy">Connectly is not end-to-end encrypted yet. Current message text is stored as readable content in the database, although traffic is protected by HTTPS and account-level access controls. Do not treat the current chat as suitable for highly sensitive information.</p>
            <div className="encryption-roadmap-heading"><strong>Security implementation roadmap</strong><span>0 of 4 complete</span></div>
            <ol className="encryption-roadmap">
              <li><span className="encryption-roadmap-number">01</span><span><strong>Device identity & verification</strong><small>Establish per-device keys and a way to verify who you are chatting with.</small></span><em>Planned</em></li>
              <li><span className="encryption-roadmap-number">02</span><span><strong>Encrypted one-to-one messages</strong><small>Encrypt on the sender's device and decrypt only on the recipient's device.</small></span><em>Planned</em></li>
              <li><span className="encryption-roadmap-number">03</span><span><strong>Encrypted media & private features</strong><small>Protect attachments, saved messages, previews, search and notifications from plaintext leaks.</small></span><em>Planned</em></li>
              <li><span className="encryption-roadmap-number">04</span><span><strong>Groups, multiple devices & review</strong><small>Test membership changes, recovery, device removal and independent security review.</small></span><em>Planned</em></li>
            </ol>
            <p className="encryption-status-copy">Encryption will remain off until the protocol and every required security test are verified. Existing message history will not be labelled as encrypted.</p>
          </div>
          <div className="form-panel glass-panel">
            <div className="section-heading"><div><p className="eyebrow">PRIVACY CONTROLS</p><h3>Who can find and contact you</h3><p className="muted small-text">These preferences are enforced by the database.</p></div></div>
            <label className="privacy-toggle-row">
              <span><strong>Discoverable by username</strong><small>Allow signed-in users to find your profile.</small></span>
              <input type="checkbox" checked={privacySettings.discoverable} onChange={(event) => void savePrivacySetting('discoverable', event.target.checked)} />
            </label>
            <label className="privacy-toggle-row">
              <span><strong>Allow friend requests</strong><small>Allow people to send you a connection request.</small></span>
              <input type="checkbox" checked={privacySettings.allow_friend_requests} onChange={(event) => void savePrivacySetting('allow_friend_requests', event.target.checked)} />
            </label>
            <label className="privacy-toggle-row">
              <span><strong>Read receipts</strong><small>Let friends know when you have read their messages.</small></span>
              <input type="checkbox" checked={privacySettings.read_receipts} onChange={(event) => void savePrivacySetting('read_receipts', event.target.checked)} />
            </label>
          </div>
          <div className="form-panel glass-panel qr-settings-panel">
            <div className="section-heading"><div><p className="eyebrow">CONNECTLY ID</p><h3>QR friend connection</h3><p className="muted small-text">Create a private QR code or scan a friend's code.</p></div></div>
            <div className="qr-profile-actions">
              <button type="button" className="button button-primary" onClick={() => void createFriendQr()} disabled={qrBusy}>{qrBusy ? 'Generating…' : 'Show my QR'}</button>
              <button type="button" className="button button-subtle" onClick={() => { setQrMode('scan'); setQrInput(''); setQrCameraActive(false) }}>Scan a friend QR</button>
            </div>
            <p className="muted small-text">QR codes expire after 10 minutes and can be used once. You can revoke an unused code by generating a replacement.</p>
          </div>
          <div className="form-panel glass-panel blocked-users-panel">
            <div className="section-heading"><div><p className="eyebrow">SAFETY CENTRE</p><h3>Blocked accounts <span className="chat-total">{blocks.length}</span></h3><p className="muted small-text">Blocked people cannot send friend requests or contact you through Connectly.</p></div></div>
            {blocks.length ? <div className="blocked-users-list">
              {blocks.map((block) => <div className="blocked-user-row" key={block.blocked_id}>
                <span className="inbox-avatar">{block.person?.avatar_url ? <img src={block.person.avatar_url} alt="" /> : initialOf(block.person)}</span>
                <span><strong>{nameOf(block.person)}</strong><small>@{block.person?.username || 'profile unavailable'}</small></span>
                <button type="button" className="button button-subtle" onClick={() => void unblockPerson(block)} disabled={busy}>Unblock</button>
              </div>)}
            </div> : <p className="inbox-people-empty">You have not blocked anyone.</p>}
          </div>
          <div className="form-panel glass-panel">
            <div className="section-heading"><div><p className="eyebrow">YOUR SAVED CONTENT</p><h3>Connectly Notes</h3><p className="muted small-text">Messages you save from any chat, kept in one private list.</p></div></div>
            <button type="button" className="button button-subtle button-wide" onClick={() => void loadSavedMessages()}>Open saved messages</button>
          </div>
          <div className="form-panel glass-panel"><div className="section-heading"><div><p className="eyebrow">PERSONAL DETAILS</p><h3>Edit profile</h3></div></div>
            <form className="stack-form" onSubmit={saveProfile}><label className="field-label">Full name<input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={80} placeholder="Your name" /></label><label className="field-label">Username<div className="input-prefix"><span>@</span><input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={40} placeholder="yourname" /></div></label><label className="field-label">Email address<input value={email} disabled /></label><p className="muted small-text">Username: 3–40 characters, lowercase letters, numbers, dots and underscores.</p><button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></form>
          </div>
          <button type="button" className="button button-danger button-wide mobile-profile-signout" onClick={signOut}>Sign out</button>
          <div className="form-panel glass-panel privacy-note"><div className="privacy-icon">◇</div><div><h4>Your privacy matters</h4><p className="muted">Only your profile basics are searchable by signed-in Connectly users. Never put passwords, phone numbers or private details in your public profile.</p></div></div>
        </section>}

        <footer className="app-footer"><span>CONNECTLY</span><span>Made for meaningful connections</span><span>MESSAGING PREVIEW</span></footer>
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
