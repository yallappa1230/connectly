# Supabase email OTP setup for Connectly

The web client now supports:
- Existing-account passwordless sign-in with Supabase email OTP (`signInWithOtp` + `verifyOtp` with type `email`).
- Email confirmation during password-based signup (`signUp` + `verifyOtp` with type `signup`).
- Existing password sign-in and password reset remain available.

## Required Supabase Dashboard email templates

Supabase sends a six-digit code only when the relevant email template contains the `{{ .Token }}` variable. If a template uses `{{ .ConfirmationURL }}`, Supabase sends a magic link instead, while Connectly's form expects a code.

In Supabase Dashboard → Authentication → Email Templates:

1. Open **Magic Link** and use this email body:

```html
<h2>Your Connectly sign-in code</h2>
<p>Enter this one-time code in Connectly:</p>
<h1>{{ .Token }}</h1>
<p>If you did not request this code, you can ignore this email.</p>
```

2. Open **Confirm signup** and use this email body:

```html
<h2>Confirm your Connectly account</h2>
<p>Your confirmation code is:</p>
<h1>{{ .Token }}</h1>
<p>Enter this code in the Connectly signup screen.</p>
```

3. Save both templates. Do not include the raw token in URLs or analytics.

## Authentication URL settings

In Authentication → URL Configuration:
- Set Site URL to the production Connectly HTTPS domain.
- Add the production domain and active development preview URLs to Redirect URLs if magic-link/reset flows use them.
- Keep email OTP expiration short (Supabase's default is one hour; choose a shorter value appropriate for the product).
- Keep the OTP request rate limit enabled. Supabase's default resend interval is 60 seconds.

## Important security distinction

Email OTP is passwordless primary sign-in / email ownership verification. It is **not** a second factor after password authentication and must not be marketed as completed MFA. Supabase Auth's documented AAL2 second-factor flow currently uses enrolled TOTP or phone factors; passkey/biometric login requires a separate WebAuthn implementation. Device biometrics should be mediated by the operating system and must never send face/fingerprint images to Connectly.

## Live project status

The linked Supabase project was found and is active. The application code is committed, but the Supabase Dashboard email templates and production auth URL settings cannot be changed through the connected database-management actions. A project owner must save the two email templates above before six-digit email messages are delivered. No database migration is required for email OTP.
