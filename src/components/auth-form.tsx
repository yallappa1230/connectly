'use client'

import { type FormEvent, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Mode = 'login' | 'signup' | 'reset'

export function AuthForm() {
  const [mode, setMode] = useState<Mode>('login')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setNotice('')
    setError('')

    try {
      const supabase = createClient()

      if (mode === 'login') {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (signInError) throw signInError
        window.location.assign('/')
        return
      }

      if (mode === 'signup') {
        if (fullName.trim().length < 2) throw new Error('Enter your name (at least 2 characters).')
        if (password.length < 8) throw new Error('Use a password with at least 8 characters.')

        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: fullName.trim() },
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        })
        if (signUpError) throw signUpError

        if (data.session) {
          window.location.assign('/')
          return
        }
        setNotice('Account created. Check your email and confirm your address, then sign in.')
        setMode('login')
        setPassword('')
        return
      }

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      })
      if (resetError) throw resetError
      setNotice('Password reset instructions have been sent, if that email is registered.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-glow auth-glow-one" />
      <div className="auth-glow auth-glow-two" />
      <section className="auth-card glass-panel">
        <div className="brand-lockup">
          <div className="brand-mark">C</div>
          <div>
            <p className="eyebrow">YOUR PEOPLE, YOUR SPACE</p>
            <h1>Connectly</h1>
          </div>
        </div>

        <div className="auth-heading">
          <p className="eyebrow">{mode === 'signup' ? 'START CONNECTING' : mode === 'reset' ? 'ACCOUNT RECOVERY' : 'WELCOME BACK'}</p>
          <h2>{mode === 'signup' ? 'Create your account' : mode === 'reset' ? 'Reset your password' : 'Good to see you.'}</h2>
          <p className="muted">{mode === 'signup' ? 'Make a space for the people who matter.' : mode === 'reset' ? 'We’ll email you a secure reset link.' : 'Sign in to continue to your Connectly space.'}</p>
        </div>

        <form className="stack-form" onSubmit={submit}>
          {mode === 'signup' && (
            <label className="field-label">
              Full name
              <input autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your name" required />
            </label>
          )}
          <label className="field-label">
            Email address
            <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required />
          </label>
          {mode !== 'reset' && (
            <label className="field-label">
              Password
              <input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" minLength={8} required />
            </label>
          )}
          {error && <p className="form-message form-error" role="alert">{error}</p>}
          {notice && <p className="form-message form-success" role="status">{notice}</p>}
          <button className="button button-primary button-wide" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in'}
          </button>
        </form>

        <div className="auth-links">
          {mode === 'login' && (
            <>
              <button className="text-button" type="button" onClick={() => { setMode('reset'); setError(''); setNotice('') }}>Forgot password?</button>
              <span className="muted">New here? <button className="text-button" type="button" onClick={() => { setMode('signup'); setError(''); setNotice('') }}>Create account</button></span>
            </>
          )}
          {mode === 'signup' && <span className="muted">Already have an account? <button className="text-button" type="button" onClick={() => { setMode('login'); setError(''); setNotice('') }}>Sign in</button></span>}
          {mode === 'reset' && <button className="text-button" type="button" onClick={() => { setMode('login'); setError(''); setNotice('') }}>Back to sign in</button>}
        </div>
        <p className="auth-footnote">Private conversations start with secure sign-in. Never share your password or verification links.</p>
      </section>
    </main>
  )
}
