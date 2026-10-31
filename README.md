# Connectly — Phase 1 (Authentication & Friends)

A responsive Next.js web app for account creation, sign-in, profile editing, username discovery, friend requests, unfriend and block/unblock flows. The interface uses a dark Liquid Glass-inspired visual style and adapts to mobile screens.

## Stack

- Next.js 16.4.3 (App Router)
- React 19.2.0 + TypeScript
- Supabase Auth + PostgreSQL
- `@supabase/ssr` with cookie-based sessions

## Configure Supabase

Copy `.env.example` to `.env.local` and add the project URL and publishable key from Supabase Dashboard → Project → Connect. Never place a service-role or secret key in a `NEXT_PUBLIC_` variable. Do not commit `.env.local`.

## Database setup

The Supabase project has the `friend_requests` and `user_blocks` tables. Review and run `supabase/phase-1-security.sql` in the Supabase SQL Editor for the access policies and explicit grants. The script is intended for the Connectly project only; inspect it before execution and check Supabase Database Advisors afterwards.

## Auth redirects

In Supabase Dashboard → Authentication → URL Configuration, add `http://localhost:3000/**` and the exact Codespaces forwarded port-3000 URL ending in `/**`. Set the production Site URL when deploying.

## Run

```bash
npm install
npm run typecheck
npm run dev
```

Open forwarded port 3000 from the Codespaces Ports tab. Keep the generated `package-lock.json` in Git.

## Test

Use two separate test accounts. Verify signup, email confirmation, sign-in/out, profile edits, username search, sending/accepting/declining/cancelling requests, unfriend, and block/unblock. Also verify that a third account cannot read another pair's requests and that blocked users cannot interact.

## Phase 1 scope

Included: signup, login, logout, email confirmation callback, password reset, profile editing, username search, incoming/outgoing friend requests, accepted friendships, unfriend, and block/unblock.

Not included: realtime messaging, group chats, QR friend connection, voice/video calls, stories, AI features, media uploads, or end-to-end encryption.
