import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import dccLogo from '../assets/dcc-logo-white.png'

const QUOTES = [
  { text: "Every call is a chance.\nEvery visit, a victory.",   tag: "Today's Mantra",   color: '#60A5FA' },
  { text: "Champions show up\nbefore the alarm does.",          tag: "Rise & Grind",      color: '#34D399' },
  { text: "Your target is not a\nlimit — it's a launchpad.",    tag: "Think Bigger",      color: '#A78BFA' },
  { text: "One more visit.\nOne step closer.",                  tag: "Keep Pushing",      color: '#F472B6' },
  { text: "Great salespeople don't\nwait for opportunities.",   tag: "Create Them",       color: '#FB923C' },
  { text: "Your effort today shapes\nyour success tomorrow.",   tag: "Stay Consistent",   color: '#4ADE80' },
  { text: "Reject rejection.\nEmbrace resilience.",             tag: "Mindset Wins",      color: '#38BDF8' },
  { text: "The field is your kingdom.\nGo rule it.",            tag: "Own The Day",       color: '#FBBF24' },
]
const FACTS = [
  "Top performers make 5× more calls than average",
  "80% of sales need 5+ follow-ups to close",
  "A smile in your voice increases conversion by 30%",
  "Early birds get 2× more face time with clients",
  "Consistent daily visits build unbreakable pipelines",
]
const SPARKS = ['⚡','🔥','💪','🎯','✨','🚀','💰','🏆','🎉','💥']

export default function MotivationalIntro({ user, onComplete }) {
  const wrapRef     = useRef(null)
  const bgRef       = useRef(null)
  const ringRef     = useRef(null)
  const logoRef     = useRef(null)
  const greetRef    = useRef(null)
  const nameChars   = useRef([])
  const tagRef      = useRef(null)
  const quoteLines  = useRef([])
  const factRef     = useRef(null)
  const barFillRef  = useRef(null)
  const barLabelRef = useRef(null)
  const sparkRefs   = useRef([])
  const counterRef  = useRef(null)
  const dividerRef  = useRef(null)

  const qIdx      = new Date().getDay() % QUOTES.length
  const quote     = QUOTES[qIdx]
  const fact      = FACTS[Math.floor(Math.random() * FACTS.length)]
  const firstName = user?.full_name?.split(' ')[0] || 'Champion'
  const hour      = new Date().getHours()
  const greeting  = hour < 12 ? 'Good Morning ☀️' : hour < 17 ? 'Good Afternoon 🌤️' : 'Good Evening 🌙'

  useEffect(() => {
    const tl = gsap.timeline()
    gsap.set(wrapRef.current, { opacity: 1 })
    gsap.set([ringRef.current, logoRef.current, greetRef.current,
              tagRef.current, factRef.current, barFillRef.current,
              barLabelRef.current, dividerRef.current, counterRef.current], { opacity: 0 })
    gsap.set(nameChars.current.filter(Boolean), { opacity: 0, y: 60, rotationX: -90 })
    gsap.set(quoteLines.current.filter(Boolean), { opacity: 0, x: -30 })
    gsap.set(sparkRefs.current.filter(Boolean), { opacity: 0, scale: 0 })

    // Background gradient animation
    tl.fromTo(bgRef.current,
      { backgroundPosition: '0% 50%' },
      { backgroundPosition: '100% 50%', duration: 4, ease: 'none', repeat: -1, yoyo: true }, 0)

    // Ring spins in
    tl.fromTo(ringRef.current,
      { opacity: 0, scale: 0.4, rotation: -180 },
      { opacity: 1, scale: 1, rotation: 0, duration: 0.8, ease: 'back.out(1.4)' }, 0.1)
    gsap.to(ringRef.current, { rotation: 360, duration: 10, ease: 'none', repeat: -1 })

    // Logo bounces in + floats
    tl.fromTo(logoRef.current,
      { scale: 0, rotation: -20, opacity: 0 },
      { scale: 1, rotation: 0, opacity: 1, duration: 0.6, ease: 'back.out(2)' }, 0.3)
    tl.to(logoRef.current, { y: -6, duration: 2, ease: 'sine.inOut', yoyo: true, repeat: -1 }, 1)

    // Greeting
    tl.fromTo(greetRef.current,
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }, 0.8)

    // Name chars flip in 3D
    tl.to(nameChars.current.filter(Boolean), {
      opacity: 1, y: 0, rotationX: 0, stagger: 0.04, duration: 0.5, ease: 'back.out(1.7)'
    }, 1.1)
    tl.to(nameChars.current.filter(Boolean), {
      textShadow: `0 0 20px ${quote.color}, 0 0 40px ${quote.color}88`,
      stagger: 0.02, duration: 0.3, yoyo: true, repeat: 1
    }, 1.8)

    // Spark burst
    sparkRefs.current.filter(Boolean).forEach((el, i) => {
      const angle = (i / SPARKS.length) * 360
      const rad   = angle * Math.PI / 180
      const dist  = 65 + Math.random() * 35
      tl.fromTo(el,
        { opacity: 0, scale: 0, x: 0, y: 0 },
        { opacity: 1, scale: 1.2, x: Math.cos(rad) * dist, y: Math.sin(rad) * dist, duration: 0.4, ease: 'back.out(2)' },
        1.6 + i * 0.04)
      tl.to(el,
        { opacity: 0, scale: 0, x: Math.cos(rad)*dist*1.5, y: Math.sin(rad)*dist*1.5, duration: 0.35, ease: 'power2.in' },
        2.2 + i * 0.03)
    })

    // Divider draws in
    tl.fromTo(dividerRef.current,
      { scaleX: 0, opacity: 0 },
      { scaleX: 1, opacity: 1, duration: 0.5, ease: 'power2.out', transformOrigin: 'center' }, 2.3)

    // Tag + quote lines
    tl.fromTo(tagRef.current,
      { opacity: 0, y: 12, scale: 0.9 },
      { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: 'back.out(1.5)' }, 2.6)
    tl.to(quoteLines.current.filter(Boolean), {
      opacity: 1, x: 0, stagger: 0.2, duration: 0.5, ease: 'power3.out'
    }, 2.8)

    // Fact
    tl.fromTo(factRef.current,
      { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' }, 3.4)

    // Progress bar + counter
    tl.fromTo([counterRef.current, barLabelRef.current], { opacity: 0 }, { opacity: 1, duration: 0.3 }, 3.6)
    const counter = { val: 0 }
    tl.to(counter, {
      val: 100, duration: 2.4, ease: 'power1.inOut',
      onUpdate() { if (counterRef.current) counterRef.current.textContent = Math.round(counter.val) + '%' }
    }, 3.7)
    tl.fromTo(barFillRef.current,
      { scaleX: 0 },
      { scaleX: 1, duration: 2.4, ease: 'power1.inOut', transformOrigin: 'left' }, 3.7)

    // Exit: slide up
    tl.to(wrapRef.current,
      { y: '-100vh', opacity: 0, duration: 0.55, ease: 'power3.in', onComplete: onComplete }, 6.6)

    return () => { tl.kill(); gsap.killTweensOf(ringRef.current); gsap.killTweensOf(logoRef.current) }
  }, []) // eslint-disable-line

  const nameLetters = [...firstName].map((ch, i) => (
    <span key={i} ref={el => nameChars.current[i] = el}
      style={{ display: 'inline-block', transformStyle: 'preserve-3d' }}>
      {ch === ' ' ? '\u00A0' : ch}
    </span>
  ))
  const qLines = quote.text.split('\n')

  return (
    <div ref={wrapRef} style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '0 28px', opacity: 0, overflow: 'hidden',
    }}>
      {/* Animated gradient bg */}
      <div ref={bgRef} style={{
        position: 'absolute', inset: 0, zIndex: 0,
        background: 'linear-gradient(-45deg,#020617,#0F172A,#1E1B4B,#0F172A,#0C1A3A)',
        backgroundSize: '400% 400%',
      }}/>
      {/* Grid */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
        backgroundImage: 'linear-gradient(rgba(96,165,250,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(96,165,250,0.04) 1px,transparent 1px)',
        backgroundSize: '40px 40px',
        maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%,black 40%,transparent 100%)',
        WebkitMaskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%,black 40%,transparent 100%)',
      }}/>
      {/* Radial glow */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
        background: `radial-gradient(circle at 50% 40%,${quote.color}18 0%,transparent 65%)`,
      }}/>

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 400, textAlign: 'center' }}>

        {/* Ring + Logo + Sparks */}
        <div style={{ position: 'relative', width: 100, height: 100, margin: '0 auto 22px' }}>
          <svg ref={ringRef} width="100" height="100" viewBox="0 0 100 100"
            style={{ position: 'absolute', inset: 0 }}>
            <circle cx="50" cy="50" r="46" fill="none" stroke={`${quote.color}35`} strokeWidth="1"/>
            <circle cx="50" cy="50" r="46" fill="none" stroke={quote.color} strokeWidth="1.5"
              strokeDasharray="40 250" strokeLinecap="round"/>
            <circle cx="50" cy="4" r="3.5" fill={quote.color}
              style={{ filter: `drop-shadow(0 0 4px ${quote.color})` }}/>
          </svg>
          <div ref={logoRef} style={{
            position: 'absolute', inset: '12px', borderRadius: '50%',
            background: 'rgba(255,255,255,0.07)',
            backdropFilter: 'blur(16px)',
            border: `1.5px solid ${quote.color}35`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 0 28px ${quote.color}25,inset 0 1px 0 rgba(255,255,255,0.12)`,
          }}>
            <img src={dccLogo} alt="DCC" style={{ width: 36, height: 36, objectFit: 'contain' }}/>
          </div>
          {SPARKS.map((s, i) => (
            <span key={i} ref={el => sparkRefs.current[i] = el} style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%,-50%)',
              fontSize: '1rem', pointerEvents: 'none',
              filter: `drop-shadow(0 0 5px ${quote.color})`,
            }}>{s}</span>
          ))}
        </div>

        {/* Greeting */}
        <div ref={greetRef} style={{
          fontSize: '0.7rem', fontWeight: 700,
          letterSpacing: '0.2em', color: `${quote.color}CC`,
          textTransform: 'uppercase', marginBottom: 6,
        }}>{greeting}</div>

        {/* Name — 3D char split */}
        <div style={{
          fontSize: 'clamp(2rem, 8vw, 2.8rem)', fontWeight: 900, color: '#FFFFFF',
          letterSpacing: '-0.02em', lineHeight: 1, marginBottom: 22,
          fontFamily: 'system-ui,-apple-system,sans-serif',
          perspective: '500px',
        }}>
          {nameLetters}
          <span style={{ display: 'inline-block', marginLeft: '0.12em' }}>👊</span>
        </div>

        {/* Divider */}
        <div ref={dividerRef} style={{
          height: 1, width: '55%', margin: '0 auto 18px',
          background: `linear-gradient(90deg,transparent,${quote.color},transparent)`,
          transformOrigin: 'center',
        }}/>

        {/* Quote card */}
        <div style={{
          background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(20px)',
          border: `1px solid ${quote.color}22`, borderRadius: 20,
          padding: '18px 22px', marginBottom: 14,
          boxShadow: `0 4px 24px ${quote.color}10`,
        }}>
          <div ref={tagRef} style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: `${quote.color}15`, border: `1px solid ${quote.color}35`,
            borderRadius: 99, padding: '3px 10px',
            fontSize: '0.58rem', fontWeight: 800,
            letterSpacing: '0.14em', textTransform: 'uppercase',
            color: quote.color, marginBottom: 10,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: quote.color, display: 'inline-block' }}/>
            {quote.tag}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {qLines.map((line, i) => (
              <div key={i} ref={el => quoteLines.current[i] = el} style={{
                fontSize: 'clamp(1rem, 4.5vw, 1.25rem)', fontWeight: 800,
                color: '#FFFFFF', lineHeight: 1.42, letterSpacing: '-0.01em',
                fontFamily: 'system-ui,-apple-system,sans-serif',
              }}>{line}</div>
            ))}
          </div>
        </div>

        {/* Fact */}
        <div ref={factRef} style={{
          fontSize: '0.68rem', color: 'rgba(186,230,253,0.7)',
          lineHeight: 1.5, marginBottom: 24,
          display: 'flex', alignItems: 'flex-start', gap: 6, justifyContent: 'center',
        }}>
          <span style={{ color: quote.color, flexShrink: 0 }}>💡</span>{fact}
        </div>

        {/* Progress */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
            <span ref={barLabelRef} style={{
              fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.12em',
              textTransform: 'uppercase', color: 'rgba(148,163,184,0.75)',
            }}>Loading Dashboard</span>
            <span ref={counterRef} style={{
              fontSize: '0.75rem', fontWeight: 800, color: quote.color, fontFamily: 'monospace'
            }}>0%</span>
          </div>
          <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 99, overflow: 'hidden' }}>
            <div ref={barFillRef} style={{
              height: '100%', borderRadius: 99, transformOrigin: 'left',
              background: `linear-gradient(90deg,${quote.color}80,${quote.color})`,
              boxShadow: `0 0 10px ${quote.color}70`,
            }}/>
          </div>
        </div>

      </div>
    </div>
  )
}
