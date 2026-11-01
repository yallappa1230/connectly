'use client'

import { type FormEvent, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Mode = 'login' | 'signup' | 'reset'
type LoginMethod = 'password' | 'email-code'
type OtpType = 'email' | 'signup'

export function AuthForm() {
  const [mode, setMode] = useState<Mode>('login')
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('email-code')
  const [otpType, setOtpType] = useState<OtpType>('email')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  function clearFeedback() {
    setNotice('')
    setError('')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    clearFeedback()

    try {
      const supabase = createClient()

      if (mode === 'signup' && !otpSent) {
        if (fullName.trim().length < 2) throw new Error('Enter your name (at least 2 characters).')
        if (password.length < 8) throw new Error('Use a password with at least 8 characters.')
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: fullName.trim() } },
        })
        if (signUpError) throw signUpError
        if (data.session) {
          window.location.assign('/')
          return
        }
        setOtpType('signup')
        setOtpSent(true)
        setNotice('Your account was created. Enter the 6-digit confirmation code sent to your email.')
        setPassword('')
        return
      }

      if ((mode === 'signup' || (mode === 'login' && loginMethod === 'email-code' && otpSent))) {
        if (!/^\d{6}$/.test(otp.trim())) throw new Error('Enter the 6-digit code from your email.')
        const { error: verifyError } = await supabase.auth.verifyOtp({
          email: email.trim(),
          token: otp.trim(),
          type: otpType,
        })
        if (verifyError) throw verifyError
        window.location.assign('/')
        return
      }

      if (mode === 'login' && loginMethod === 'email-code') {
        const { error: otpError } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: { shouldCreateUser: false },
        })
        if (otpError) throw otpError
        setOtpType('email')
        setOtpSent(true)
        setNotice('A sign-in code has been sent if this email belongs to a Connectly account. Check your inbox and spam folder.')
        return
      }

      if (mode === 'login' && loginMethod === 'password') {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (signInError) throw signInError
        window.location.assign('/')
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

  function changeMode(next: Mode) {
    setMode(next)
    setOtpSent(false)
    setOtp('')
    setPassword('')
    clearFeedback()
  }

  function restartOtp() {
    setOtpSent(false)
    setOtp('')
    clearFeedback()
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
          <h2>{mode === 'signup' ? otpSent ? 'Verify your email' : 'Create your account' : mode === 'reset' ? 'Reset your password' : otpSent && loginMethod === 'email-code' ? 'Check your email' : 'Good to see you.'}</h2>
          <p className="muted">{mode === 'signup' ? otpSent ? 'Enter the confirmation code to activate your account.' : 'Make a space for the people who matter.' : mode === 'reset' ? 'We’ll email you a secure reset link.' : loginMethod === 'email-code' ? 'Sign in with a one-time code sent to your email.' : 'Sign in to continue to your Connectly space.'}</p>
        </div>

        {mode === 'login' && (
          <div className="auth-method-switch" role="group" aria-label="Sign-in method">
            <button type="button" className={loginMethod === 'email-code' ? 'active' : ''} onClick={() => { setLoginMethod('email-code'); restartOtp() }}>Email code</button>
            <button type="button" className={loginMethod === 'password' ? 'active' : ''} onClick={() => { setLoginMethod('password'); restartOtp() }}>Password</button>
          </div>
        )}

        <form className="stack-form" onSubmit={submit}>
          {mode === 'signup' && !otpSent && (
            <label className="field-label">
              Full name
              <input autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your name" required />
            </label>
          )}
          <label className="field-label">
            Email address
            <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required disabled={otpSent} />
          </label>
          {((mode === 'login' && loginMethod === 'email-code') || mode === 'signup') && otpSent && (
            <label className="field-label">
              Six-digit email code
              <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" required />
            </label>
          )}
          {(mode === 'signup' && !otpSent || (mode === 'login' && loginMethod === 'password')) && (
            <label className="field-label">
              Password
              <input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" minLength={8} required />
            </label>
          )}
          {error && <p className="form-message form-error" role="alert">{error}</p>}
          {notice && <p className="form-message form-success" role="status">{notice}</p>}
          <button className="button button-primary button-wide" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'signup' ? otpSent ? 'Verify email & create account' : 'Create account' : mode === 'reset' ? 'Send reset link' : otpSent && loginMethod === 'email-code' ? 'Verify code & sign in' : loginMethod === 'email-code' ? 'Send email code' : 'Sign in'}
          </button>
          {((mode === 'login' && otpSent && loginMethod === 'email-code') || (mode === 'signup' && otpSent)) && (
            <button className="text-button" type="button" disabled={busy} onClick={restartOtp}>Use a different email or request a new code</button>
          )}
        </form>

        <div className="auth-links">
          {mode === 'login' && (
            <>
              <button className="text-button" type="button" onClick={() => changeMode('reset')}>Forgot password?</button>
              <span className="muted">New here? <button className="text-button" type="button" onClick={() => changeMode('signup')}>Create account</button></span>
            </>
          )}
          {mode === 'signup' && <span className="muted">Already have an account? <button className="text-button" type="button" onClick={() => changeMode('login')}>Sign in</button></span>}
          {mode === 'reset' && <button className="text-button" type="button" onClick={() => changeMode('login')}>Back to sign in</button>}
        </div>
        <p className="auth-footnote">Email codes are single-use verification codes. Never share your password or verification code with anyone.</p>
      </section>
    </main>
  )
}
