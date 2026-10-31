'use client'

import { type FormEvent, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function ResetPasswordForm() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')
    if (password.length < 8) return setError('Use at least 8 characters.')
    if (password !== confirm) return setError('The passwords do not match.')

    setBusy(true)
    try {
      const { error: updateError } = await createClient().auth.updateUser({ password })
      if (updateError) throw updateError
      setMessage('Password updated. You can now return to Connectly.')
      setPassword('')
      setConfirm('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update the password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card glass-panel">
        <div className="brand-lockup"><div className="brand-mark">C</div><div><p className="eyebrow">CONNECTLY SECURITY</p><h1>New password</h1></div></div>
        <p className="muted">Choose a new password for your account.</p>
        <form className="stack-form" onSubmit={submit}>
          <label className="field-label">New password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} autoComplete="new-password" required /></label>
          <label className="field-label">Confirm password<input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} autoComplete="new-password" required /></label>
          {error && <p className="form-message form-error" role="alert">{error}</p>}
          {message && <p className="form-message form-success" role="status">{message}</p>}
          <button className="button button-primary button-wide" disabled={busy}>{busy ? 'Saving…' : 'Update password'}</button>
        </form>
        <a className="text-link" href="/">Return to Connectly</a>
      </section>
    </main>
  )
}
