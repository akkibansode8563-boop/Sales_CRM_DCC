import { getStorageMode } from '../utils/supabaseClient'

/**
 * SyncModeBanner — shows sync state at top of both dashboards.
 * In local mode: shows a prominent "Setup Cloud Sync" button.
 */
export default function SyncModeBanner({
  isOnline, syncStatus, lastSyncAt, pendingCount = 0,
  manualSyncing = false, onSyncNow, onSetupCloud,
}) {
  const isCloud = getStorageMode() === 'cloud'
  const syncTime = lastSyncAt
    ? new Date(lastSyncAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null

  /* ── Local-only mode ─────────────────────────────────────── */
  if (!isCloud) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 8,
        padding: '8px 16px',
        background: '#FFFBEB',
        borderBottom: '2px solid #FDE68A',
        fontSize: '0.72rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span style={{ fontWeight: 700, color: '#92400E' }}>Local Storage Only — data is NOT syncing across devices</span>
          <span style={{ color: '#B45309', fontWeight: 400 }}>
            · Users, visits and data created here won't appear on other phones or browsers
          </span>
        </div>
        {onSetupCloud && (
          <button onClick={onSetupCloud} style={{
            padding: '6px 14px', borderRadius: 8, border: 'none',
            background: '#2563EB', color: '#fff',
            fontWeight: 800, fontSize: '0.72rem', cursor: 'pointer',
            fontFamily: 'inherit', whiteSpace: 'nowrap',
            display: 'flex', alignItems: 'center', gap: 5,
            boxShadow: '0 2px 8px rgba(37,99,235,0.3)',
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
            Setup Cloud Sync →
          </button>
        )}
      </div>
    )
  }

  /* ── Offline ─────────────────────────────────────────────── */
  if (!isOnline) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 16px',
        background: '#FEF2F2', borderBottom: '1px solid #FECACA',
        fontSize: '0.68rem', color: '#DC2626', fontWeight: 700,
      }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="1" y1="1" x2="23" y2="23"/>
          <path d="M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.56 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01"/>
        </svg>
        Offline — data saved locally, will sync when reconnected
        {pendingCount > 0 && (
          <span style={{ background: '#DC2626', color: '#fff', borderRadius: 99, padding: '1px 7px', fontSize: '0.6rem' }}>
            {pendingCount} queued
          </span>
        )}
      </div>
    )
  }

  /* ── Pending sync ────────────────────────────────────────── */
  if (pendingCount > 0) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '5px 16px',
        background: '#FFFBEB', borderBottom: '1px solid #FDE68A',
        fontSize: '0.68rem', color: '#D97706', fontWeight: 700,
      }}>
        <span>⏳ {pendingCount} action{pendingCount !== 1 ? 's' : ''} pending cloud sync</span>
        {onSyncNow && (
          <button onClick={onSyncNow} disabled={manualSyncing} style={{
            background: '#FDE68A', border: '1px solid #F59E0B',
            borderRadius: 6, padding: '3px 10px', cursor: 'pointer',
            color: '#92400E', fontWeight: 700, fontSize: '0.65rem', fontFamily: 'inherit',
          }}>
            {manualSyncing ? 'Syncing…' : 'Push Now'}
          </button>
        )}
      </div>
    )
  }

  /* ── Cloud synced ────────────────────────────────────────── */
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '4px 16px',
      background: '#F0FDF4', borderBottom: '1px solid #BBF7D0',
      fontSize: '0.63rem', color: '#059669', fontWeight: 700,
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%', background: '#10B981',
          display: 'inline-block', animation: 'pulse 2s infinite',
        }}/>
        Cloud Sync Active
        {syncTime && <span style={{ fontWeight: 400, color: '#86EFAC' }}>· synced {syncTime}</span>}
      </span>
      {onSyncNow && (
        <button onClick={onSyncNow} disabled={manualSyncing} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#059669', fontWeight: 700, fontSize: '0.6rem',
          textDecoration: 'underline', opacity: manualSyncing ? 0.5 : 1, fontFamily: 'inherit',
        }}>
          {manualSyncing ? 'Syncing…' : 'Sync now'}
        </button>
      )}
    </div>
  )
}
