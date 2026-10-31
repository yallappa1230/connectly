# Connectly — Phase 1 (Authentication & Friends)

A responsive Next.js web app for account creation, sign-in, profile editing, username discovery, friend requests, unfriend and block/unblock flows. The interface uses a dark Liquid Glass-inspired visual style and adapts to mobile screens.

## Stack

- Next.js 16.4.3 (App Router)
- React 19.2.0 + TypeScript
- Supabase Auth + PostgreSQL
- `@supabase/ssr` with cookie-based sessions

## Open the correct branch

Open [yallappa1230/connectly](https://github.com/yallappa1230/connectly) and select the `phase-1-auth-friends` branch. Create or open a Codespace on that branch. The `main` branch is intentionally unchanged.

## Configure Supabase

Copy `.env.example` to `.env.local` and add the project URL and publishable key from Supabase Dashboard → Project → Connect. Never place a service-role or secret key in a `NEXT_PUBLIC_` variable. Do not commit `.env.local`.

## Database setup

The Supabase project already has the `friend_requests` and `user_blocks` tables, with RLS enabled. Review and run `supabase/phase-1-security.sql` in the Supabase SQL Editor for the access policies and explicit grants. The script is intended for the Connectly project only; inspect it before execution and check Supabase Database Advisors afterwards.

## Auth redirects

In Supabase Dashboard → Authentication → URL Configuration, add `http://localhost:3000/**` and the exact Codespaces forwarded port-3000 URL ending in `/**`. Set the production Site URL when deploying.

## Run

```bash
cp .env.example .env.local
npm install
npm run typecheck
npm run dev
```

Fill in the two Supabase variables in `.env.local` before opening the app. Open forwarded port 3000 from the Codespaces Ports tab. Keep the generated `package-lock.json` in Git.

## Test

Use two separate test accounts. Verify signup, email confirmation, sign-in/out, profile edits, username search, sending/accepting/declining/cancelling requests, unfriend, and block/unblock. Also verify that a third account cannot read another pair's friend requests and that blocked users cannot interact.

## Phase 1 scope

Included: signup, login, logout, email confirmation callback, password reset, profile editing, username search, incoming/outgoing friend requests, accepted friendships, unfriend, and block/unblock.

Not included: realtime messaging, group chats, QR friend connection, voice/video calls, stories, AI features, media uploads, or end-to-end encryption.


## Deploy publicly on Netlify (without Vercel)

1. Open https://app.netlify.com/start and sign in with GitHub.
2. Choose **Add new project → Import an existing project** and authorize Netlify to access `yallappa1230/connectly`.
3. Select the `phase-1-auth-friends` branch as the production branch (do not choose `main` yet).
4. Keep the root directory as the repository root. Netlify detects Next.js; `netlify.toml` sets Node.js 22 and `npm run build`.
5. Add these environment variables in Project configuration → Environment variables, for Production and Deploy Previews:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
6. Deploy. Netlify's Next.js adapter supports App Router, route handlers, and server rendering.

After Netlify assigns a public `.netlify.app` domain, add that exact domain to Supabase Authentication → URL Configuration as the Site URL and an allowed redirect URL (`https://YOUR-SITE.netlify.app/**`). Keep localhost and your Codespaces URL during development.

Do not use a Supabase secret/service-role key in the browser. Before inviting users, apply and verify `supabase/phase-1-security.sql` in the Connectly Supabase SQL Editor, then test with two accounts. This repo's friend/RLS setup is not a substitute for a full security review.

## Private one-to-one messaging

The Phase 1 interface now includes a Chats tab. An accepted friend can be messaged from the Friends list. The application opens or reuses a private conversation, sends messages to `public.messages`, loads recent messages, and listens for new message inserts through Supabase Realtime.

Database requirements already applied to the live Connectly project:
- `conversations.direct_key` plus a unique partial index to keep one direct conversation per unordered pair.
- Conversation membership RLS that allows the creator and an accepted, unblocked friend only.
- `public.messages` remains protected by its member-only SELECT and sender-only INSERT policies.
- `public.messages` is included in the `supabase_realtime` publication.

To test, use two separate, email-confirmed accounts. Accept a friend request, open Friends, choose **Message**, send a message, then sign in as the other friend to verify receipt. Do not use a service-role key in the app.

## In-app audio and video calls

Connectly includes browser-native WebRTC audio and video calling. It does not open a separate calling website or record calls. Supabase Realtime private Broadcast channels carry only call setup/signaling; the media connection is peer-to-peer.

The live Supabase project has the RLS policies from `supabase/call-signaling-policies.sql`. Both personal incoming-call topics and pair call topics are restricted to authenticated, accepted, unblocked friends. The client explicitly joins private Realtime channels.

The initial ICE configuration uses public STUN servers only. This can work for many networks, but some mobile/carrier NATs require a TURN relay. No TURN relay is configured yet, so direct calls may fail on restrictive networks. For dependable calling, configure a private TURN service and issue short-lived credentials server-side; never put long-lived TURN secrets in `NEXT_PUBLIC_*` variables.

To test, use two separate signed-in devices/accounts that are accepted friends:
1. Open the chat, tap the other person's name/photo, then select Audio call or Video call.
2. On the other device, accept or decline the incoming call.
3. Test microphone mute, camera toggle, hang up, and repeat on mobile data and Wi-Fi.
4. Block or remove the friendship and verify new calls are rejected.

Calls require HTTPS and browser permission for microphone/camera. If permissions are denied, enable them in the browser's site settings.


## WhatsApp-inspired inbox update

The Chats workspace now includes All, Unread, Favorites, and Groups filters; per-user favorite/mute preferences; a last-read cursor for unread counts; a floating new-chat action; direct chat creation from accepted friends; group creation; emoji insertion; date separators; and an in-app Calls destination. Updates/Status remains a clearly labelled coming-next section. File/media attachment controls remain disabled until private storage and attachment permissions are implemented.

Per-user inbox settings are stored in `public.conversation_user_settings`. The matching SQL is in `supabase/conversation-user-settings.sql`.

## End-to-end encryption status

**End-to-end encryption is not implemented or enabled in the current release.** The `messages.content` column still stores readable text. HTTPS protects transport, and Supabase authentication/RLS controls data access, but these are not E2EE. Do not use the current app for highly sensitive conversations.

See [SECURITY.md](./SECURITY.md) for the planned cryptographic design, rollout gates, and verification checklist. The current browser-capable candidate for technical evaluation is the official Matrix Rust crypto WebAssembly state machine; it is a cryptographic engine, not a drop-in Supabase messaging integration. A custom Supabase key directory/transport adapter and security review are still required before any E2EE claim.


## Inbox and conversation interactions

The Chats screen has WhatsApp-inspired interaction patterns without copying WhatsApp branding: All / Unread / Favorites / Groups filters, inbox search, unread counts, per-chat favorite and mute controls, new chat and new group pickers, friend/request accordions, and a four-section mobile navigation. Message actions include reply, copy, and delete-own-message. Mark unread and mark all as read are per-user preferences in `conversation_user_settings`.

## End-to-end encryption status

**End-to-end encryption is not enabled in Connectly yet.** Supabase Auth plus HTTPS protects the session and network transport, but the current `public.messages.content` values are stored as readable text in PostgreSQL. Do not describe this as E2EE or tell users that only chat participants can read the current message records.

A suitable browser architecture to evaluate is the maintained Matrix JavaScript SDK with its Rust/WASM crypto module. The SDK supports browser clients and exposes E2EE through `initRustCrypto()`, but it requires a Matrix homeserver for device registration, key upload/claims, encrypted event delivery, cross-signing, device verification and encrypted history/key backup. This is an architecture change, not just a client-side switch; Connectly would need to keep Supabase for profiles/friends while moving message transport and key management to the Matrix homeserver, or build and review a comparable service.

Do not roll a home-grown encryption scheme or publish an E2EE lock until the implementation includes:
- per-device identity and encryption keys generated locally, protected local key storage, and device revocation;
- authenticated pre-key/device discovery, safety-number or QR verification, and multi-device key sharing;
- forward secrecy and post-compromise recovery from a reviewed protocol;
- encrypted file/media payloads and metadata minimization;
- secure encrypted key backup/recovery, migration handling for existing plaintext messages, and independent security review.

The official Signal `libsignal` repository describes the TypeScript package as a Node add-on and says external use is unsupported; it is not a drop-in browser dependency for this Next.js client. The Matrix browser SDK is the practical candidate to prototype, subject to choosing a homeserver and testing device/key flows. Keep the in-chat security notice visible until E2EE is genuinely active and verified.
