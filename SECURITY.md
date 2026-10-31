# Connectly Security Status and E2EE Plan

## Current security status

- Login is handled by Supabase Auth.
- Browser-to-service traffic is expected to use HTTPS.
- Row Level Security restricts access to conversations and messages to authenticated conversation members.
- WebRTC calls use browser peer-to-peer media APIs; the signaling channel carries setup metadata.
- **Chat messages are NOT end-to-end encrypted.** The current `public.messages.content` field contains readable text. Supabase/database administrators and service-side components with database access can read it. The interface must not show an E2EE lock or claim that only the sender and receiver can read messages.
- Push notifications, logs, search indexing, backups, and attachments are not E2EE-protected because E2EE has not shipped.

## E2EE implementation direction

Evaluate a maintained, browser-compatible, audited cryptographic engine rather than implementing a homemade cipher or ratchet. The current candidate for a technical spike is the Matrix Rust crypto WebAssembly state machine (`@matrix-org/matrix-sdk-crypto-wasm`). Its documented `OlmMachine` is a no-network-I/O E2EE state machine. This is not a drop-in Supabase chat adapter: the app still needs a carefully designed Supabase key directory and transport adapter, device lifecycle, durable crypto state and protocol-specific tests. Compare it with other maintained browser-ready protocol implementations before committing to a production design.

Do not use the old community TypeScript Signal implementation as a shortcut without a fresh maintenance, audit, dependency, browser compatibility and licensing review. Do not hand-roll X3DH, PQXDH, Double Ratchet, nonce handling, key derivation or signature verification.

## Required architecture

1. **Device identities:** each browser/device creates its own cryptographic identity and private state locally. Never upload private identity keys, session keys or plaintext backups to Supabase.
2. **Public key directory:** Supabase may store public identity keys, signed prekeys and one-time prekeys. Key bundles must be authenticated and protected from replacement/tampering.
3. **Authenticated sessions:** establish per-device sessions with a reviewed asynchronous key-agreement protocol and ratcheting message encryption. Multi-device users need separate sessions for each recipient device, including the sender's other devices.
4. **Ciphertext-only message rows:** encrypt on the sender device before inserting. Store versioned ciphertext/envelope metadata, not message text. Decrypt only on recipient devices. Old plaintext messages need an explicit, safe migration/retention policy; never silently label historical plaintext messages as encrypted.
5. **Identity verification:** provide QR/safety-number comparison, key-change warnings and trusted-device management. First-use encryption without identity verification can still be vulnerable to key substitution.
6. **Group encryption:** group chat requires a reviewed group protocol and per-device membership/key changes; do not reuse direct-message encryption naively.
7. **Metadata and media:** encrypt attachments with random content keys before private Storage upload; encrypt filenames, previews, thumbnails, voice notes and relevant message metadata where practical. Be clear that timing, IP, membership and some routing metadata may remain visible.
8. **Backups and recovery:** offer a user-controlled encrypted backup with a recovery key, or clearly explain that loss of all trusted devices may mean losing message history. Do not build a server-side recovery backdoor.
9. **Notifications and observability:** never put plaintext message bodies into push notifications, analytics, server logs or crash reports. Use generic notification text unless the receiving client can safely decrypt locally.
10. **Calls:** WebRTC's transport encryption is separate from message E2EE. Verify signaling authentication, peer identity, TURN behavior and media encryption assumptions independently.

## Required release gates

- Two-device tests for initial session creation, messages in both directions, offline recipient, out-of-order messages, duplicate/replayed messages, tampered ciphertext, invalid signatures and key changes.
- Browser refresh/restart tests proving crypto state persists safely in IndexedDB and is never lost silently.
- Device replacement, logout, account recovery and encrypted-backup restore tests.
- Multi-device and group membership-change tests.
- Security review of the public key directory, trust-on-first-use flow, session storage, XSS exposure and all logs/notifications.
- Confirm that a database-only dump contains ciphertext and public metadata, not readable message bodies.
- Only after these gates pass may the app label new conversations as end-to-end encrypted. The UI must distinguish encrypted sessions from legacy plaintext history.

## Current user-facing wording

Use: **“End-to-end encryption is not enabled yet. Current chat messages are stored as readable text by the service. Avoid sending highly sensitive information here.”**

Do not use: “End-to-end encrypted”, “only you and the recipient can read this”, or a lock badge that implies E2EE.
