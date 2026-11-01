# Connectly Desktop

The Electron shell loads the hosted Connectly web app in a desktop window. It does not bundle the Next.js server or make the app work offline.

## Run locally

```bash
npm install
npm start
```

## Build installers

On Windows:

```bash
npm run dist:win
```

On Debian/Ubuntu Linux:

```bash
npm run dist:linux
```

Installers are written to `dist/`. The Windows NSIS installer is an unsigned `.exe`; the Linux build is a `.deb`.

Set `CONNECTLY_WEB_URL` to an HTTPS Connectly deployment when launching or building for another deployment. The default is the Connectly Vercel production URL.

The main process opens only the configured Connectly origin inside the app. External HTTPS links are sent to the system browser. Camera/microphone permission requests are accepted only from the configured Connectly origin, with the operating system still controlling hardware access.
