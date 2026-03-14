import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// ── Service Worker Registration ──────────────────────────────
async function registerSW() {
  if (!('serviceWorker' in navigator)) return
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    console.log('[SW] Registered:', reg.scope)

    // Check for updates every 60 s
    setInterval(() => reg.update(), 60000)

    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing
      newWorker?.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // New version available — show unobtrusive update banner
          const banner = document.createElement('div')
          banner.id = 'sw-update-banner'
          banner.innerHTML = `
            <span>🆕 App update available</span>
            <button onclick="window.location.reload()">Reload</button>
          `
          document.body.appendChild(banner)
        }
      })
    })
  } catch(err) {
    console.warn('[SW] Registration failed:', err)
  }
}

// Wait for page to be interactive before registering SW
if (document.readyState === 'complete') {
  registerSW()
} else {
  window.addEventListener('load', registerSW)
}

// ── Render ───────────────────────────────────────────────────
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
