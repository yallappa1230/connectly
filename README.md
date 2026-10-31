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


## Badge-free free hosting path (Cloudflare Workers)

Netlify currently marks the "Powered by Netlify" badge as a paid-plan feature. There is no supported free toggle to hide it. This branch is reserved for a separate Cloudflare Workers migration; the existing Netlify deployment and `phase-1-auth-friends` branch remain unchanged.

Cloudflare's current Next.js recommendation is vinext for Workers. It supports Next.js 16 projects, including App Router, route handlers, server rendering, and `proxy.ts`, but is still actively developed. Run the compatibility check before migrating:

```bash
git fetch origin
git switch cloudflare-free
npx vinext check
```

If the check reports no blocking compatibility issues, initialise the non-destructive Cloudflare setup:

```bash
npx vinext init --platform=cloudflare
```

Review the generated files and changes, then test locally before deploying. The normal Next.js `next dev` setup should remain available; use the generated vinext dev/build scripts for the Cloudflare preview and deploy. The Cloudflare account can then import this branch or deploy from the Codespaces terminal with the generated Cloudflare CLI command.

Cloudflare Workers Free currently includes up to 100,000 requests/day and 10 ms CPU time per request. This is a free usage allowance, not an unlimited plan. Check the live limits before production use.

Do not delete the Netlify project yet. Keep it live until the Cloudflare build, Supabase login, email confirmation, and profile page are tested successfully. Cloudflare will issue a different public `workers.dev` address; the Supabase Auth Site URL and Redirect URLs must then be updated to that address.
