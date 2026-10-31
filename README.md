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
