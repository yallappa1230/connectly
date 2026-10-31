const { app, BrowserWindow, shell, session } = require('electron')

const CONNECTLY_URL = process.env.CONNECTLY_WEB_URL || 'https://connectly-gamma-lyart.vercel.app'
const TRUSTED_HOST = new URL(CONNECTLY_URL).hostname

function isTrustedUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === TRUSTED_HOST
  } catch {
    return false
  }
}

async function openExternal(value) {
  try {
    const url = new URL(value)
    if (url.protocol === 'https:' || url.protocol === 'mailto:' || url.protocol === 'tel:') {
      await shell.openExternal(url.toString())
    }
  } catch {
    // Ignore malformed or unsupported external links.
  }
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 920,
    minHeight: 640,
    show: false,
    backgroundColor: '#0b141a',
    autoHideMenuBar: true,
    title: 'Connectly',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  })

  window.once('ready-to-show', () => window.show())

  window.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedUrl(url)) {
      event.preventDefault()
      void openExternal(url)
    }
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    void openExternal(url)
    return { action: 'deny' }
  })

  window.webContents.on('will-attach-webview', (event) => {
    event.preventDefault()
  })

  window.loadURL(CONNECTLY_URL).catch(() => {
    window.show()
  })
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.connectly.desktop')

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const trustedRequest = isTrustedUrl(details.requestingUrl || webContents.getURL())
    callback(trustedRequest && permission === 'media')
  })

  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    return isTrustedUrl(requestingOrigin) && permission === 'media'
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
