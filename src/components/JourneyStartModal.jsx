import { useState, useEffect, useRef } from 'react'
import { gsap } from 'gsap'

const MODES = [
  {
    id: 'On Field',
    icon: '🚗',
    iconBig: '🏍️',
    label: 'On Field',
    sub: 'Visiting clients, dealers & distributors',
    color: '#10B981',
    bg: 'linear-gradient(135deg,#ECFDF5,#D1FAE5)',
    border: '#6EE7B7',
    glow: 'rgba(16,185,129,0.25)',
    badge: 'GPS Tracking Active',
    badgeColor: '#059669',
    tips: ['GPS route recorded automatically', 'Nearby customers detected', 'Visit log & photo capture ready'],
    recommended: true,
  },
  {
    id: 'In-Office',
    icon: '🏢',
    iconBig: '💼',
    label: 'In-Office',
    sub: 'Working from office, calls & admin tasks',
    color: '#2563EB',
    bg: 'linear-gradient(135deg,#EFF6FF,#DBEAFE)',
    border: '#93C5FD',
    glow: 'rgba(37,99,235,0.2)',
    badge: 'Office Mode',
    badgeColor: '#1D4ED8',
    tips: ['Log customer calls & follow-ups', 'Update sales reports', 'Manage product entries'],
    recommended: false,
  },
  {
    id: 'Travel',
    icon: '✈️',
    iconBig: '🚆',
    label: 'Travelling',
    sub: 'Inter-city travel, training or conferences',
    color: '#7C3AED',
    bg: 'linear-gradient(135deg,#F5F3FF,#EDE9FE)',
    border: '#C4B5FD',
    glow: 'rgba(124,58,237,0.2)',
    badge: 'Travel Mode',
    badgeColor: '#6D28D9',
    tips: ['Track travel time & distance', 'Log meeting notes on the go', 'Route resumes on arrival'],
    recommended: false,
  },
]

export default function JourneyStartModal({ onStart, onClose, currentStatus }) {
  const [selected, setSelected]   = useState('On Field')
  const [step, setStep]           = useState('pick')   // pick | confirm | launching
  const [locStatus, setLocStatus] = useState('idle')   // idle | getting | got | denied
  const [location, setLocation]   = useState(null)
  const [pulse, setPulse]         = useState(false)

  const overlayRef = useRef(null)
  const cardRef    = useRef(null)
  const mode       = MODES.find(m => m.id === selected)

  /* ── Animate in ── */
  useEffect(() => {
    gsap.fromTo(overlayRef.current,
      { opacity: 0 },
      { opacity: 1, duration: 0.25, ease: 'power2.out' }
    )
    gsap.fromTo(cardRef.current,
      { y: 80, opacity: 0, scale: 0.95 },
      { y: 0, opacity: 1, scale: 1, duration: 0.45, ease: 'back.out(1.5)' }
    )
  }, [])

  /* ── Animate card on selection ── */
  useEffect(() => {
    gsap.fromTo(cardRef.current,
      { scale: 0.98 },
      { scale: 1, duration: 0.25, ease: 'back.out(1.7)' }
    )
  }, [selected])

  /* ── GPS ── */
  const getGPS = () => {
    if (!navigator.geolocation) return
    setLocStatus('getting')
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocStatus('got')
      },
      () => setLocStatus('denied'),
      { timeout: 10000, enableHighAccuracy: true }
    )
  }
  useEffect(() => { if (step === 'confirm') getGPS() }, [step])

  /* ── Pulse effect on hover ── */
  const handleModeClick = (id) => {
    setSelected(id)
    setPulse(true)
    setTimeout(() => setPulse(false), 400)
  }

  /* ── Launch ── */
  const handleLaunch = () => {
    setStep('launching')
    gsap.to(cardRef.current, {
      scale: 1.04, opacity: 0, y: -20, duration: 0.4, ease: 'power3.in',
      onComplete: () => onStart(selected, location)
    })
  }

  /* ── Close ── */
  const handleClose = () => {
    gsap.to(overlayRef.current, {
      opacity: 0, duration: 0.2,
      onComplete: onClose
    })
  }

  return (
    <div
      ref={overlayRef}
      onClick={e => e.target === overlayRef.current && handleClose()}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'flex-end',
        justifyContent: 'center',
        opacity: 0,
      }}
    >
      <div
        ref={cardRef}
        style={{
          width: '100%', maxWidth: 480,
          background: '#fff',
          borderRadius: '24px 24px 0 0',
          maxHeight: '92vh', overflowY: 'auto',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.2)',
        }}
      >
        {/* ── Handle ── */}
        <div style={{ width: 36, height: 4, background: '#E5E7EB', borderRadius: 99, margin: '12px auto 0' }} />

        {/* ── Header ── */}
        <div style={{ padding: '16px 20px 0' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: '1.1rem', color: '#111827', letterSpacing: '-0.01em' }}>
                🚀 Start Today's Journey
              </div>
              <div style={{ fontSize: '0.75rem', color: '#6B7280', marginTop: 2 }}>
                Choose your mode — this sets GPS, tracking & reporting
              </div>
            </div>
            <button onClick={handleClose} style={{
              background: '#F3F4F6', border: 'none', borderRadius: '50%',
              width: 30, height: 30, cursor: 'pointer',
              fontSize: '1rem', color: '#6B7280', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>✕</button>
          </div>

          {/* Current status pill */}
          {currentStatus && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: '#F9FAFB', border: '1px solid #E5E7EB',
              borderRadius: 99, padding: '3px 10px',
              fontSize: '0.68rem', fontWeight: 600, color: '#6B7280', marginTop: 8,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#9CA3AF' }} />
              Currently: {currentStatus}
            </div>
          )}
        </div>

        {step === 'pick' && (
          <>
            {/* ── Mode Cards ── */}
            <div style={{ padding: '16px 16px 0' }}>
              {MODES.map((m) => {
                const isActive = selected === m.id
                return (
                  <div
                    key={m.id}
                    onClick={() => handleModeClick(m.id)}
                    style={{
                      border: `2px solid ${isActive ? m.color : '#F3F4F6'}`,
                      borderRadius: 16, padding: '14px 16px',
                      marginBottom: 10, cursor: 'pointer',
                      background: isActive ? m.bg : '#FAFAFA',
                      transition: 'all 0.2s cubic-bezier(0.34,1.56,0.64,1)',
                      transform: isActive ? 'scale(1.015)' : 'scale(1)',
                      boxShadow: isActive ? `0 4px 20px ${m.glow}` : '0 1px 3px rgba(0,0,0,0.06)',
                      position: 'relative', overflow: 'hidden',
                    }}
                  >
                    {/* Recommended badge */}
                    {m.recommended && (
                      <div style={{
                        position: 'absolute', top: 10, right: 10,
                        background: '#FEF3C7', color: '#D97706',
                        fontSize: '0.55rem', fontWeight: 800,
                        letterSpacing: '0.1em', textTransform: 'uppercase',
                        padding: '2px 7px', borderRadius: 99, border: '1px solid #FDE68A',
                      }}>★ Recommended</div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {/* Icon */}
                      <div style={{
                        width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                        background: isActive ? `${m.color}22` : '#F3F4F6',
                        display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: '1.6rem',
                        border: `2px solid ${isActive ? m.border : 'transparent'}`,
                        transition: 'all 0.2s',
                        boxShadow: isActive ? `0 0 0 4px ${m.glow}` : 'none',
                      }}>
                        {m.icon}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontWeight: 800, fontSize: '0.95rem',
                          color: isActive ? m.color : '#111827',
                          marginBottom: 2, transition: 'color 0.2s',
                        }}>
                          {m.label}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#6B7280', lineHeight: 1.4 }}>
                          {m.sub}
                        </div>
                      </div>

                      {/* Checkbox */}
                      <div style={{
                        width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                        border: `2px solid ${isActive ? m.color : '#D1D5DB'}`,
                        background: isActive ? m.color : '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.2s',
                        boxShadow: isActive ? `0 0 0 3px ${m.glow}` : 'none',
                      }}>
                        {isActive && (
                          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                            <path d="M2 5.5L4.5 8L9 3" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                    </div>

                    {/* Tips — shown when selected */}
                    {isActive && (
                      <div style={{
                        marginTop: 12, paddingTop: 12,
                        borderTop: `1px solid ${m.border}`,
                        display: 'flex', flexDirection: 'column', gap: 5,
                      }}>
                        {m.tips.map((tip, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.72rem', color: '#374151' }}>
                            <span style={{
                              width: 18, height: 18, borderRadius: '50%',
                              background: `${m.color}22`, flexShrink: 0,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                                <path d="M1.5 4.5L3.5 6.5L7.5 2.5" stroke={m.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </span>
                            {tip}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* ── CTA ── */}
            <div style={{ padding: '12px 16px 28px' }}>
              <button
                onClick={() => setStep('confirm')}
                style={{
                  width: '100%', padding: '16px',
                  background: `linear-gradient(135deg, ${mode.color}, ${mode.color}CC)`,
                  border: 'none', borderRadius: 14, cursor: 'pointer',
                  color: '#fff', fontWeight: 800, fontSize: '1rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: `0 4px 20px ${mode.glow}`,
                  transition: 'all 0.2s',
                  fontFamily: 'inherit',
                  letterSpacing: '-0.01em',
                }}
                onMouseEnter={e => { e.target.style.transform = 'translateY(-2px)'; e.target.style.boxShadow = `0 8px 28px ${mode.glow}` }}
                onMouseLeave={e => { e.target.style.transform = 'translateY(0)'; e.target.style.boxShadow = `0 4px 20px ${mode.glow}` }}
              >
                <span style={{ fontSize: '1.2rem' }}>{mode.icon}</span>
                Start as {mode.label}
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          </>
        )}

        {/* ── Step 2: Confirm + GPS ── */}
        {step === 'confirm' && (
          <ConfirmStep
            mode={mode}
            locStatus={locStatus}
            location={location}
            onLaunch={handleLaunch}
            onBack={() => setStep('pick')}
          />
        )}

        {/* ── Step 3: Launching ── */}
        {step === 'launching' && (
          <LaunchingStep mode={mode} />
        )}
      </div>
    </div>
  )
}

/* ── Confirm step ── */
function ConfirmStep({ mode, locStatus, location, onLaunch, onBack }) {
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div style={{ padding: '20px 16px 28px' }}>

      {/* Summary card */}
      <div style={{
        background: mode.bg, border: `2px solid ${mode.border}`,
        borderRadius: 16, padding: '16px', marginBottom: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: `${mode.color}22`,
            border: `2px solid ${mode.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem',
          }}>{mode.icon}</div>
          <div>
            <div style={{ fontWeight: 800, color: mode.color, fontSize: '0.95rem' }}>{mode.label} Mode</div>
            <div style={{ fontSize: '0.7rem', color: '#6B7280' }}>{today}</div>
          </div>
        </div>

        {/* GPS status */}
        <div style={{
          background: '#fff', borderRadius: 10, padding: '10px 12px',
          display: 'flex', alignItems: 'center', gap: 10,
          border: '1px solid rgba(0,0,0,0.06)',
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
            background: locStatus === 'got' ? '#ECFDF5' : locStatus === 'denied' ? '#FEF2F2' : '#EFF6FF',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem',
          }}>
            {locStatus === 'getting' ? '📡' : locStatus === 'got' ? '📍' : locStatus === 'denied' ? '⚠️' : '🔍'}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151' }}>
              {locStatus === 'getting' ? 'Detecting location…'
                : locStatus === 'got' ? 'GPS location ready'
                : locStatus === 'denied' ? 'Location denied — journey will start without GPS'
                : 'Locating…'}
            </div>
            {location && (
              <div style={{ fontSize: '0.62rem', color: '#9CA3AF', fontFamily: 'monospace', marginTop: 1 }}>
                {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
              </div>
            )}
          </div>
          {locStatus === 'getting' && (
            <div style={{
              width: 18, height: 18, border: '2.5px solid #E5E7EB',
              borderTopColor: mode.color, borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
          )}
          {locStatus === 'got' && (
            <div style={{
              width: 20, height: 20, background: '#ECFDF5', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M2 5.5L4.5 8L9 3" stroke="#059669" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <button
        onClick={onLaunch}
        style={{
          width: '100%', padding: '15px',
          background: `linear-gradient(135deg, ${mode.color}, ${mode.color}DD)`,
          border: 'none', borderRadius: 12, cursor: 'pointer',
          color: '#fff', fontWeight: 800, fontSize: '0.95rem', marginBottom: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          boxShadow: `0 4px 20px ${mode.glow}`,
          fontFamily: 'inherit',
          animation: locStatus === 'got' ? 'readyPulse 2s ease-in-out infinite' : 'none',
        }}
      >
        🚀 Launch Journey
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
          <polygon points="5,2 13,7.5 5,13" fill="white"/>
        </svg>
      </button>

      <button onClick={onBack} style={{
        width: '100%', padding: '11px',
        background: '#F9FAFB', border: '1.5px solid #E5E7EB',
        borderRadius: 12, cursor: 'pointer', color: '#6B7280',
        fontWeight: 700, fontSize: '0.82rem', fontFamily: 'inherit',
      }}>
        ← Change Mode
      </button>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes readyPulse {
          0%,100% { box-shadow: 0 4px 20px ${mode.glow} }
          50%      { box-shadow: 0 6px 32px ${mode.glow}, 0 0 0 6px ${mode.color}22 }
        }
      `}</style>
    </div>
  )
}

/* ── Launching animation ── */
function LaunchingStep({ mode }) {
  const rocketRef = useRef(null)

  useEffect(() => {
    gsap.fromTo(rocketRef.current,
      { y: 0, scale: 1 },
      { y: -80, scale: 1.5, opacity: 0, duration: 0.8, ease: 'power3.in' }
    )
  }, [])

  return (
    <div style={{ padding: '40px 20px', textAlign: 'center' }}>
      <div ref={rocketRef} style={{ fontSize: '3rem', marginBottom: 16 }}>🚀</div>
      <div style={{ fontWeight: 800, fontSize: '1.1rem', color: mode.color }}>
        Launching {mode.label} Journey
      </div>
      <div style={{ fontSize: '0.75rem', color: '#9CA3AF', marginTop: 6 }}>
        Setting up GPS tracking…
      </div>
    </div>
  )
}
