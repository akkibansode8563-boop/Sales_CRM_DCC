/**
 * UpdateNotifier — Auto-update handler for DCC SalesForce PWA
 *
 * How it works:
 *  1. VitePWA generates a new service worker on every `npm run build`
 *  2. When the app is open, the browser polls /sw.js every ~24h (or on focus)
 *  3. If the file changed, the new SW installs in background
 *  4. 'skipWaiting: true' in workbox config → new SW activates immediately
 *  5. 'clientsClaim: true' → all open tabs switch to new SW at once
 *  6. This component listens for the SW update event and reloads the page
 *     so users always get the latest code — silently, no action needed
 *
 * TWA (Android APK) behaviour:
 *  - TWA loads the website inside Chrome Custom Tab
 *  - Same SW update mechanism applies
 *  - When you push to GitHub → Vercel deploys → new SW generated
 *  - Next time manager opens the app → SW update detected → silent reload
 *  - Manager sees new version within seconds of opening the app
 */

import { useEffect, useRef, useState } from 'react'

export default function UpdateNotifier() {
  const [showBanner, setShowBanner] = useState(false)
  const reloadPending = useRef(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    // Listen for the controllerchange event:
    // This fires when a new SW takes control (after skipWaiting + clientsClaim)
    const handleControllerChange = () => {
      // Prevent double-reload
      if (reloadPending.current) return
      reloadPending.current = true

      // Show "Updating app…" banner briefly, then reload
      setShowBanner(true)
      setTimeout(() => {
        window.location.reload()
      }, 1200)  // 1.2s — enough to read the banner
    }

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)

    // Also check: if there's already a waiting SW on mount, activate it
    navigator.serviceWorker.ready.then(reg => {
      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' })
      }
    }).catch(() => {})

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
    }
  }, [])

  if (!showBanner) return null

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 99999,
      background: '#2563EB',
      color: '#fff',
      padding: '10px 20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      fontSize: '0.85rem',
      fontWeight: 700,
      fontFamily: 'system-ui, sans-serif',
      boxShadow: '0 2px 16px rgba(0,0,0,0.2)',
      animation: 'slideDown 0.25s ease',
    }}>
      <style>{`
        @keyframes slideDown {
          from { transform: translateY(-100%); opacity: 0; }
          to   { transform: translateY(0);     opacity: 1; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* Spinner */}
      <div style={{
        width: 16, height: 16, borderRadius: '50%',
        border: '2.5px solid rgba(255,255,255,0.3)',
        borderTopColor: '#fff',
        animation: 'spin 0.7s linear infinite',
        flexShrink: 0,
      }}/>

      <span>Updating DCC SalesForce to latest version…</span>
    </div>
  )
}
