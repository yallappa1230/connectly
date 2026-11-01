# Connectly E2EE library evaluation

**Reviewed:** 2026-11-01  
**Status:** Evaluation only — no production cryptography dependency selected.

## Current application constraints

Connectly is a Next.js 16 / React 19 browser application. Message records currently contain readable message text and media is uploaded in readable form. The existing security notice correctly states that end-to-end encryption is not enabled. This evaluation does not change that status.

A production implementation must work in supported browsers first. It must keep private identity/session keys on user devices, authenticate device identity, support key changes and multiple devices, encrypt attachments before upload, and avoid plaintext in previews, search, saved messages, notifications, task extraction, logs, and analytics.

## Candidate review

### Signal's official libsignal TypeScript API

- The official Signal repository exposes a TypeScript API backed by Rust.
- Its README says the library is used by Signal's own clients and that use outside Signal is unsupported; APIs may change.
- The published npm package is a native Node addon with platform-specific binaries. That is not a drop-in browser/WebCrypto package for this Next.js client.
- The package is AGPL-3.0-only, which also needs a deliberate licensing review before adoption.

References:
- https://github.com/signalapp/libsignal
- https://www.npmjs.com/package/@signalapp/libsignal-client

**Decision:** Do not add it directly to the browser bundle. Reconsider only if the project adopts a supported native/server architecture and completes compatibility and licensing review.

### ts-mls

- TypeScript implementation of Messaging Layer Security (MLS, RFC 9420).
- Project documentation describes browser support.
- Its own README explicitly says it has not undergone a formal security audit.

References:
- https://github.com/LukaJCB/ts-mls
- https://www.npmjs.com/package/ts-mls
- https://www.rfc-editor.org/rfc/rfc9420

**Decision:** Suitable for a contained technical proof-of-concept and interoperability evaluation only. Do not enable it for real user conversations until an independent security review, protocol test suite, and operational review are complete.

### OpenMLS

- Rust implementation of MLS with a documented WebAssembly target.
- The project distinguishes tested targets from targets that are built but not tested; wasm32-unknown-unknown is listed among the latter.

References:
- https://github.com/openmls/openmls
- https://book.openmls.tech/

**Decision:** Keep as a possible WASM/native integration candidate. Browser support, persistence, bindings, bundle size, and target test coverage need a working prototype before selection.

## Architecture decision

**No library is approved for production yet.** Do not write a home-grown Signal/MLS protocol or substitute a single AES-GCM key for a messaging protocol.

The next engineering milestone is a throwaway, isolated browser proof-of-concept on a separate branch. It must demonstrate:

1. Two independent browser profiles can create distinct device identities.
2. A user can authenticate the peer's identity (for example, by comparing a safety code).
3. A first message can be established without the server receiving plaintext or private keys.
4. Subsequent messages use evolving session state and reject invalid/replayed protocol messages.
5. A device refresh/restart can safely restore local cryptographic state without uploading private keys.
6. The prototype passes the library's protocol tests and browser compatibility checks.

The proof-of-concept must use test accounts and synthetic messages only. It must not be wired to production message sending or represented as enabled encryption.

## Production acceptance gates

Production rollout is blocked until all of the following are complete:

- Independent cryptographic/security review of the selected library and integration.
- Threat model covering malicious delivery service, account takeover, device loss, key changes, XSS, backups, and multi-device membership.
- Server schema and RLS review for public key packages, device records, ciphertext, and attachment metadata.
- Client-side encryption/decryption for text and media, with authenticated metadata and replay handling.
- No plaintext leakage through inbox previews, search, replies, saved messages, tasks, notifications, logs, analytics, or error reports.
- Verified key-change warnings and user-visible device verification.
- Recovery and device revocation design that does not silently weaken E2EE.
- Cross-browser, two-device, tampering, replay, membership-change, and migration tests.
- A staged migration plan; old plaintext history must not be relabeled as encrypted.

Until those gates pass, the UI must continue to say **Not end-to-end encrypted**.
