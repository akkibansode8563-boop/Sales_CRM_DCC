import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import dccLogo from '../assets/dcc-logo.png'

/* Rotating motivational quotes pool */
const QUOTES = [
  { text: "Every call is a chance.\nEvery visit, a victory.", tag: "Today's Mantra" },
  { text: "Champions show up\nbefore the alarm does.", tag: "Rise & Grind" },
  { text: "Your target is not a\nlimit — it's a launchpad.", tag: "Think Bigger" },
  { text: "One more visit.\nOne step closer.", tag: "Keep Pushing" },
  { text: "Great salespeople don't\nwait for opportunities.", tag: "Create Them" },
  { text: "Your effort today shapes\nyour success tomorrow.", tag: "Stay Consistent" },
  { text: "Reject rejection.\nEmbrace resilience.", tag: "Mindset Wins" },
  { text: "The field is your kingdom.\nGo rule it.", tag: "Own The Day" },
]

const SALES_FACTS = [
  "Top performers make 5× more calls than average",
  "80% of sales need 5+ follow-ups to close",
  "A smile in your voice increases conversion by 30%",
  "Early birds get 2× more face time with clients",
  "Consistent daily visits build unbreakable pipelines",
]

export default function MotivationalIntro({ user, onComplete }) {
  const containerRef = useRef(null)
  const logoRef      = useRef(null)
  const greetRef     = useRef(null)
  const nameRef      = useRef(null)
  const quoteRef     = useRef(null)
  const tagRef       = useRef(null)
  const factRef      = useRef(null)
  const barRef       = useRef(null)
  const sparkRefs    = useRef([])
  const [phase, setPhase]   = useState('intro')    // intro | quote | exit
  const [progress, setProgress] = useState(0)

  // Pick today's quote (rotates daily)
  const qIdx    = new Date().getDay() % QUOTES.length
  const quote   = QUOTES[qIdx]
  const factIdx = Math.floor(Math.random() * SALES_FACTS.length)
  const fact    = SALES_FACTS[factIdx]

  const hour = new Date().getHours()
  const greeting =
    hour < 12 ? 'Good Morning' :
    hour < 17 ? 'Good Afternoon' : 'Good Evening'

  useEffect(() => {
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })

    /* ── Phase 1: Logo burst in ── */
    tl.set(containerRef.current, { opacity: 1 })
      .fromTo(logoRef.current,
        { scale: 0, rotation: -30, opacity: 0 },
        { scale: 1, rotation: 0, opacity: 1, duration: 0.7, ease: 'back.out(1.7)' }
      )

    /* ── Phase 2: Greeting line ── */
      .fromTo(greetRef.current,
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.45 }, '-=0.1'
      )

    /* ── Phase 3: Name with color pop ── */
      .fromTo(nameRef.current,
        { y: 30, opacity: 0, scale: 0.9 },
        { y: 0, opacity: 1, scale: 1, duration: 0.55, ease: 'back.out(1.4)' }, '-=0.1'
      )

    /* ── Phase 4: Sparks burst ── */
      .to(sparkRefs.current, {
        opacity: 1, scale: 1, stagger: 0.06, duration: 0.3, ease: 'back.out(2)'
      }, '-=0.2')
      .to(sparkRefs.current, {
        opacity: 0, y: -40, stagger: 0.05, duration: 0.5, delay: 0.4
      })

    /* ── Phase 5: Quote slides up ── */
      .call(() => setPhase('quote'))
      .fromTo(tagRef.current,
        { y: 15, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.4 }, '-=0.1'
      )
      .fromTo(quoteRef.current,
        { y: 25, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6 }, '-=0.15'
      )

    /* ── Phase 6: Fact line ── */
      .fromTo(factRef.current,
        { y: 15, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.4 }, '-=0.1'
      )

    /* ── Phase 7: Progress bar fills ── */
      .fromTo(barRef.current,
        { scaleX: 0 },
        {
          scaleX: 1, duration: 2.8,
          ease: 'none',
          transformOrigin: 'left center',
          onUpdate() {
            const p = Math.round(this.progress() * 100)
            setProgress(p)
          }
        }, '-=0.1'
      )

    /* ── Phase 8: Exit ── */
      .call(() => setPhase('exit'))
      .to(containerRef.current, {
        y: -60, opacity: 0, scale: 0.96, duration: 0.55,
        ease: 'power3.in',
        onComplete: onComplete
      })

    return () => tl.kill()
  }, []) // eslint-disable-line

  const SPARKS = ['⚡','🔥','💪','🎯','✨','🚀','💰','🏆']

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'linear-gradient(135deg, #0F172A 0%, #1E3A8A 50%, #0F172A 100%)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '0 32px', opacity: 0,
        overflow: 'hidden',
      }}
    >
      {/* Background particles */}
      <BgParticles />

      {/* ── Logo ── */}
      <div ref={logoRef} style={{
        width: 72, height: 72, borderRadius: 20,
        background: 'rgba(255,255,255,0.12)',
        backdropFilter: 'blur(12px)',
        border: '1.5px solid rgba(255,255,255,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 20,
        boxShadow: '0 8px 32px rgba(37,99,235,0.4)',
      }}>
        <img src={dccLogo} alt="DCC" style={{ width: 44, height: 44, objectFit: 'contain' }} />
      </div>

      {/* ── Greeting ── */}
      <div ref={greetRef} style={{
        fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.18em',
        color: 'rgba(147,197,253,0.9)', textTransform: 'uppercase',
        marginBottom: 4, opacity: 0,
      }}>
        {greeting}
      </div>

      {/* ── Name ── */}
      <div ref={nameRef} style={{
        fontSize: 'clamp(1.6rem, 6vw, 2.2rem)',
        fontWeight: 900, color: '#FFFFFF',
        letterSpacing: '-0.02em', textAlign: 'center',
        marginBottom: 28, opacity: 0,
        textShadow: '0 0 40px rgba(96,165,250,0.5)',
        fontFamily: '"Outfit", system-ui, sans-serif',
      }}>
        {user?.full_name?.split(' ')[0] || 'Champion'} 👊
      </div>

      {/* ── Emoji sparks burst ── */}
      <div style={{ position: 'absolute', top: '30%', display: 'flex', gap: 12, fontSize: '1.4rem' }}>
        {SPARKS.map((s, i) => (
          <span
            key={i}
            ref={el => sparkRefs.current[i] = el}
            style={{
              opacity: 0, transform: 'scale(0)',
              display: 'inline-block',
              filter: 'drop-shadow(0 0 8px rgba(255,255,100,0.8))',
            }}
          >{s}</span>
        ))}
      </div>

      {/* ── Quote card ── */}
      <div style={{
        background: 'rgba(255,255,255,0.06)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 20, padding: '24px 28px',
        width: '100%', maxWidth: 380,
        textAlign: 'center', marginBottom: 20,
      }}>
        <div ref={tagRef} style={{
          fontSize: '0.62rem', fontWeight: 800,
          letterSpacing: '0.15em', textTransform: 'uppercase',
          color: '#60A5FA', marginBottom: 10, opacity: 0,
        }}>
          {quote.tag}
        </div>

        <div ref={quoteRef} style={{
          fontSize: 'clamp(1rem, 4vw, 1.25rem)',
          fontWeight: 800, color: '#FFFFFF',
          lineHeight: 1.45, letterSpacing: '-0.01em',
          whiteSpace: 'pre-line', opacity: 0,
          fontFamily: '"Outfit", system-ui, sans-serif',
        }}>
          {quote.text}
        </div>
      </div>

      {/* ── Daily fact ── */}
      <div ref={factRef} style={{
        fontSize: '0.72rem', color: 'rgba(186,230,253,0.8)',
        textAlign: 'center', maxWidth: 300, lineHeight: 1.5,
        marginBottom: 32, opacity: 0, fontStyle: 'italic',
      }}>
        💡 {fact}
      </div>

      {/* ── Progress bar ── */}
      <div style={{ width: '100%', maxWidth: 320 }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          fontSize: '0.62rem', color: 'rgba(147,197,253,0.7)',
          marginBottom: 6, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.1em',
        }}>
          <span>Loading Dashboard</span>
          <span>{progress}%</span>
        </div>
        <div style={{
          height: 4, background: 'rgba(255,255,255,0.1)',
          borderRadius: 99, overflow: 'hidden',
        }}>
          <div
            ref={barRef}
            style={{
              height: '100%', width: '100%',
              background: 'linear-gradient(90deg, #2563EB, #10B981, #2563EB)',
              backgroundSize: '200% 100%',
              borderRadius: 99,
              transformOrigin: 'left',
              scaleX: 0,
              animation: 'shimmer 1.5s linear infinite',
            }}
          />
        </div>
      </div>

      <style>{`
        @keyframes shimmer {
          0%   { background-position: 0% 50% }
          100% { background-position: 200% 50% }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px) }
          50%       { transform: translateY(-12px) }
        }
        @keyframes twinkle {
          0%, 100% { opacity: 0.2; transform: scale(0.8) }
          50%       { opacity: 1;   transform: scale(1.2) }
        }
      `}</style>
    </div>
  )
}

/* Floating background particles */
function BgParticles() {
  const DOTS = Array.from({ length: 18 }, (_, i) => ({
    size:  4 + (i % 5) * 3,
    x:     `${(i * 17 + 7) % 95}%`,
    y:     `${(i * 23 + 11) % 90}%`,
    delay: `${(i * 0.3) % 3}s`,
    dur:   `${3 + (i % 4)}s`,
    color: i % 3 === 0 ? '#60A5FA' : i % 3 === 1 ? '#34D399' : '#A78BFA',
  }))

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {DOTS.map((d, i) => (
        <div key={i} style={{
          position: 'absolute', left: d.x, top: d.y,
          width: d.size, height: d.size, borderRadius: '50%',
          background: d.color, opacity: 0.25,
          animation: `twinkle ${d.dur} ${d.delay} ease-in-out infinite`,
        }} />
      ))}
    </div>
  )
}
