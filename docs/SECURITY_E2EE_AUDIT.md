# Connectly messaging security audit

Audit date: 2026-11-01
Branch reviewed: `phase-1-auth-friends`

## Current findings

This is a code-level review of the current client implementation, not an independent penetration test.

- **Message bodies are plaintext at rest in the application data model.** The client selects `messages.content` directly and inserts the user's text directly into that field.
- **Attachments are uploaded as original files.** `uploadMessageFile` sends the original `File` to the `chat-media` Supabase Storage bucket. The attachment row stores the original name, MIME type, and byte size.
- **Chat previews expose message text to the client data layer.** `refreshChats` reads message `content` to construct inbox previews.
- **Saved messages and task creation also consume message content.** These features will need to work with locally decrypted content once E2EE is enabled.
- **No dedicated cryptography dependency is currently declared** in `package.json`.
- **WebRTC call media is peer-to-peer WebRTC media**, but the inspected code uses public STUN servers and no configured TURN relay. Call signaling is a separate security surface from message encryption.

## E2EE implementation requirements

Do not label Connectly as end-to-end encrypted until all of these are implemented and tested:

1. A vetted, maintained end-to-end protocol/library with documented browser support; do not invent a cryptographic protocol.
2. Per-device identity keys and authenticated device registration.
3. Secure session establishment and ratcheting, including replay protection and key-change handling.
4. Client-side encryption/decryption before any message body reaches Supabase.
5. Client-side attachment encryption before upload; filenames and MIME metadata must not reveal sensitive content unnecessarily.
6. No plaintext message body in inbox previews, search indexes, logs, notifications, analytics, or server-side functions.
7. A documented multi-device and group-key design, including membership changes and device revocation.
8. Safe local key storage, recovery/backup choices, and clear behavior when browser storage is cleared.
9. Security tests for tampering, wrong keys, replay, missing keys, device changes, and unauthorized membership.
10. A migration plan for existing plaintext messages and attachments. Existing content cannot become retroactively private simply by deploying new client code.

## Recommended rollout

### Phase 1 — Protocol and data-model design
Choose a maintained protocol implementation compatible with the web client and define identity, device, prekey/session, and group membership records. Add schema and RLS only after the protocol and threat model are settled.

### Phase 2 — Direct-message prototype
Implement device identity, authenticated session establishment, encrypted direct messages, key-change warnings, and cross-browser/device tests. Keep plaintext fallback disabled for conversations marked encrypted.

### Phase 3 — Attachments and secondary features
Encrypt attachment bytes and sensitive metadata client-side. Update previews, search, saved messages, reactions, replies, tasks, and notifications so no server-side feature requires plaintext.

### Phase 4 — Groups, multi-device, migration, and independent review
Implement group key distribution and device lifecycle, migrate or clearly label legacy plaintext history, test recovery and membership changes, then obtain an independent security review.

## Current status

**E2EE: not implemented.** This audit records the verified starting point and the work required. Do not display an E2EE/security guarantee in the UI until the implementation and tests are complete.
