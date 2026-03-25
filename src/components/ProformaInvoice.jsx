import { useState, useRef, useCallback } from 'react'
import dccLogo from '../assets/dcc-logo.png'

const COMPANY_NAME    = 'DCC INFOTECH PVT LTD'
const COMPANY_SUB     = 'Field Sales Automation · CRM Solutions'
const GST_OPTIONS     = [0, 5, 12, 14, 18, 28]

const emptyLine = () => ({
  id: Date.now() + Math.random(),
  sku: '', description: '', qty: '', unit: 'pcs', unitPrice: '', gst: 18,
})

function calcLine(line) {
  const qty       = parseFloat(line.qty)       || 0
  const unitPrice = parseFloat(line.unitPrice) || 0
  const subtotal  = qty * unitPrice
  const gstAmt    = subtotal * (line.gst / 100)
  const total     = subtotal + gstAmt
  return { subtotal, gstAmt, total }
}

export default function ProformaInvoice({ user, customers, onClose }) {
  const [invoiceNo,   setInvoiceNo]   = useState(() => 'PI-' + Date.now().toString().slice(-6))
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0])
  const [validDays,   setValidDays]   = useState(7)
  const [billTo,      setBillTo]      = useState({ name: '', address: '', phone: '', gstin: '' })
  const [lines,       setLines]       = useState([emptyLine()])
  const [globalGst,   setGlobalGst]   = useState(18)
  const [notes,       setNotes]       = useState('')
  const [termsText,   setTermsText]   = useState('Payment due within 7 days of invoice.')
  const [sharing,     setSharing]     = useState(false)

  // ── Line operations ──────────────────────────────
  const updateLine = (id, field, val) =>
    setLines(ls => ls.map(l => l.id === id ? { ...l, [field]: val } : l))
  const addLine    = () => setLines(ls => [...ls, emptyLine()])
  const removeLine = (id) => setLines(ls => ls.length > 1 ? ls.filter(l => l.id !== id) : ls)
  const applyGstToAll = (pct) => {
    setGlobalGst(pct)
    setLines(ls => ls.map(l => ({ ...l, gst: pct })))
  }

  // ── Totals ───────────────────────────────────────
  const totals = lines.reduce((acc, l) => {
    const c = calcLine(l)
    return { subtotal: acc.subtotal + c.subtotal, gstAmt: acc.gstAmt + c.gstAmt, total: acc.total + c.total }
  }, { subtotal: 0, gstAmt: 0, total: 0 })

  const fmt = n => '₹' + Number(n.toFixed(2)).toLocaleString('en-IN', { minimumFractionDigits: 2 })

  const isValid = billTo.name.trim() && lines.some(l => l.description || l.sku)

  // ── Share via WhatsApp as PDF ─────────────────────
  // Step 1: Open the PDF in a print window (user saves as PDF)
  // Step 2: Open WhatsApp with a message saying "PDF attached"
  const handleSharePDFWhatsApp = useCallback(() => {
    setSharing(true)

    // Build the print-quality HTML
    const html = buildInvoiceHTML({
      invoiceNo, invoiceDate, validDays, billTo,
      lines, totals, notes, termsText, user, fmt,
    })

    // Open PDF window
    const win = window.open('', '_blank', 'width=900,height=750,scrollbars=yes')
    if (!win) {
      alert('Please allow pop-ups to generate the PDF invoice.')
      setSharing(false)
      return
    }
    win.document.write(html)
    win.document.close()
    win.focus()

    // After a short delay, trigger print dialog (user → Save as PDF)
    setTimeout(() => {
      win.print()
    }, 600)

    // Build a clean WhatsApp message to accompany the PDF
    const dateFormatted = new Date(invoiceDate).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric'
    })
    const validUntil = new Date(new Date(invoiceDate).getTime() + validDays * 86400000)
      .toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

    const itemSummary = lines
      .filter(l => l.description || l.sku)
      .map((l, i) => {
        const c = calcLine(l)
        const name = [l.sku, l.description].filter(Boolean).join(' — ')
        return `  ${i+1}. ${name}\n     ${l.qty} ${l.unit} × ₹${l.unitPrice} + ${l.gst}% GST = *${fmt(c.total)}*`
      }).join('\n')

    const waText = [
      `🧾 *Performa Invoice from ${COMPANY_NAME}*`,
      ``,
      `📄 Invoice No: *${invoiceNo}*`,
      `📅 Date: ${dateFormatted}  |  Valid till: ${validUntil}`,
      ``,
      `*Bill To:*`,
      `🏢 ${billTo.name}`,
      billTo.address ? `📍 ${billTo.address}` : null,
      billTo.phone   ? `📞 ${billTo.phone}`   : null,
      billTo.gstin   ? `🔢 GSTIN: ${billTo.gstin}` : null,
      ``,
      `*Items:*`,
      itemSummary,
      ``,
      `━━━━━━━━━━━━━━━━━━━━`,
      `Subtotal (excl. GST) : ${fmt(totals.subtotal)}`,
      `GST Amount           : ${fmt(totals.gstAmt)}`,
      `*💰 Grand Total       : ${fmt(totals.total)}*`,
      `━━━━━━━━━━━━━━━━━━━━`,
      notes ? `\n📝 _${notes}_` : null,
      ``,
      `📎 _PDF invoice has been generated — please save & attach it to this chat._`,
      ``,
      `_${COMPANY_NAME} · ${user?.full_name || ''}${user?.territory ? ' · ' + user.territory : ''}_`,
    ].filter(l => l !== null).join('\n')

    // Small delay so PDF window opens first, then WhatsApp
    setTimeout(() => {
      window.open('https://wa.me/?text=' + encodeURIComponent(waText), '_blank')
      setSharing(false)
    }, 1200)
  }, [invoiceNo, invoiceDate, validDays, billTo, lines, totals, notes, termsText, user, fmt])

  // ── UI ───────────────────────────────────────────
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2100,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        width: '100%', maxWidth: 520,
        background: '#fff', borderRadius: '24px 24px 0 0',
        maxHeight: '94vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.2)',
      }}>

        {/* Drag handle */}
        <div style={{ width: 36, height: 4, background: '#E5E7EB', borderRadius: 99, margin: '12px auto 0' }}/>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px 0' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: '1rem', color: '#111827', letterSpacing: '-0.01em' }}>
              🧾 Performa Invoice
            </div>
            <div style={{ fontSize: '0.68rem', color: '#9CA3AF', marginTop: 2 }}>
              {COMPANY_NAME} · generates PDF + WhatsApp
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 30, height: 30, borderRadius: '50%', border: 'none',
            background: '#F3F4F6', cursor: 'pointer', fontSize: '1rem', color: '#6B7280',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>

        {/* Scrollable form */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 8px' }}>

          {/* Company badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'linear-gradient(135deg,#EFF6FF,#F0FDF4)',
            border: '1px solid #BFDBFE', borderRadius: 12, padding: '10px 14px', marginBottom: 18,
          }}>
            <img src={dccLogo} alt="DCC" style={{ width: 32, height: 32, objectFit: 'contain', borderRadius: 6 }}/>
            <div>
              <div style={{ fontWeight: 900, fontSize: '0.82rem', color: '#1E3A8A', letterSpacing: '0.02em' }}>{COMPANY_NAME}</div>
              <div style={{ fontSize: '0.62rem', color: '#6B7280', marginTop: 1 }}>{COMPANY_SUB}</div>
            </div>
          </div>

          {/* ── Invoice Details ── */}
          <Section title="Invoice Details">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Invoice No">
                <input value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} style={inputStyle}/>
              </Field>
              <Field label="Date">
                <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} style={inputStyle}/>
              </Field>
              <Field label="Valid for (days)">
                <input type="number" value={validDays} min={1} max={90}
                  onChange={e => setValidDays(e.target.value)} style={inputStyle}/>
              </Field>
              <Field label="Apply GST to all items">
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', paddingTop: 2 }}>
                  {GST_OPTIONS.map(g => (
                    <button key={g} onClick={() => applyGstToAll(g)} style={{
                      padding: '5px 9px', borderRadius: 7, border: 'none',
                      background: globalGst === g ? '#2563EB' : '#F3F4F6',
                      color: globalGst === g ? '#fff' : '#374151',
                      fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}>{g}%</button>
                  ))}
                </div>
              </Field>
            </div>
          </Section>

          {/* ── Bill To ── */}
          <Section title="Bill To">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Customer / Company Name *" style={{ gridColumn: '1/-1' }}>
                <input placeholder="e.g. Sharma Traders Pvt Ltd"
                  value={billTo.name} onChange={e => setBillTo(b => ({...b, name: e.target.value}))} style={inputStyle}/>
              </Field>
              <Field label="Address" style={{ gridColumn: '1/-1' }}>
                <input placeholder="Street, City, State"
                  value={billTo.address} onChange={e => setBillTo(b => ({...b, address: e.target.value}))} style={inputStyle}/>
              </Field>
              <Field label="Phone">
                <input placeholder="+91 9999999999"
                  value={billTo.phone} onChange={e => setBillTo(b => ({...b, phone: e.target.value}))} style={inputStyle}/>
              </Field>
              <Field label="GSTIN (optional)">
                <input placeholder="27AABCU9603R1ZM"
                  value={billTo.gstin} onChange={e => setBillTo(b => ({...b, gstin: e.target.value}))} style={inputStyle}/>
              </Field>
            </div>
          </Section>

          {/* ── Line Items ── */}
          <Section
            title={`Items (${lines.length})`}
            action={
              <button onClick={addLine} style={{
                background: '#EFF6FF', color: '#2563EB', border: 'none',
                borderRadius: 6, padding: '4px 10px', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer',
              }}>+ Add Item</button>
            }
          >
            {/* Column labels */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 1fr 24px', gap: 6, marginBottom: 6 }}>
              {['SKU', 'Description', 'Qty', 'Unit Price', 'GST%', ''].map((h, i) => (
                <div key={i} style={{ fontSize: '0.58rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
              ))}
            </div>

            {lines.map(line => {
              const c = calcLine(line)
              return (
                <div key={line.id} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 1fr 24px', gap: 6, alignItems: 'center' }}>
                    <input placeholder="SKU" value={line.sku}
                      onChange={e => updateLine(line.id, 'sku', e.target.value)} style={inputStyle}/>
                    <input placeholder="Product name" value={line.description}
                      onChange={e => updateLine(line.id, 'description', e.target.value)} style={inputStyle}/>
                    <input type="number" placeholder="0" min={0} value={line.qty}
                      onChange={e => updateLine(line.id, 'qty', e.target.value)} style={inputStyle}/>
                    <input type="number" placeholder="0.00" min={0} value={line.unitPrice}
                      onChange={e => updateLine(line.id, 'unitPrice', e.target.value)} style={inputStyle}/>
                    <select value={line.gst} onChange={e => updateLine(line.id, 'gst', Number(e.target.value))}
                      style={{...inputStyle, padding: '7px 4px'}}>
                      {GST_OPTIONS.map(g => <option key={g} value={g}>{g}%</option>)}
                    </select>
                    <button onClick={() => removeLine(line.id)} style={{
                      width: 22, height: 22, borderRadius: '50%', border: 'none',
                      background: '#FEF2F2', color: '#EF4444', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.75rem', flexShrink: 0,
                    }}>✕</button>
                  </div>
                  {(line.qty && line.unitPrice) && (
                    <div style={{ textAlign: 'right', fontSize: '0.63rem', color: '#6B7280', marginTop: 2 }}>
                      {line.qty} × ₹{line.unitPrice} + {line.gst}% GST =&nbsp;
                      <strong style={{ color: '#059669' }}>{fmt(c.total)}</strong>
                    </div>
                  )}
                </div>
              )
            })}

            {/* Running totals */}
            <div style={{ background: '#F0FDF4', borderRadius: 10, padding: '12px 14px', marginTop: 8, border: '1px solid #BBF7D0' }}>
              <TotalRow label="Subtotal (excl. GST)" val={fmt(totals.subtotal)}/>
              <TotalRow label="Total GST"            val={fmt(totals.gstAmt)}/>
              <TotalRow label="GRAND TOTAL"          val={fmt(totals.total)} bold/>
            </div>
          </Section>

          {/* ── Notes & Terms ── */}
          <Section title="Notes & Terms">
            <Field label="Notes for Customer">
              <textarea rows={2} placeholder="e.g. Prices subject to change without notice"
                value={notes} onChange={e => setNotes(e.target.value)}
                style={{...inputStyle, resize: 'vertical'}}/>
            </Field>
            <Field label="Payment Terms">
              <input value={termsText} onChange={e => setTermsText(e.target.value)} style={inputStyle}/>
            </Field>
          </Section>

          {/* How-it-works hint */}
          <div style={{
            background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10,
            padding: '10px 14px', marginBottom: 8,
            display: 'flex', gap: 8, alignItems: 'flex-start',
          }}>
            <span style={{ fontSize: '1rem', flexShrink: 0 }}>💡</span>
            <div style={{ fontSize: '0.68rem', color: '#92400E', lineHeight: 1.5 }}>
              <strong>How it works:</strong> Tapping the button below will&nbsp;
              <strong>open the PDF invoice</strong> in a new tab — save it using&nbsp;
              <em>Print → Save as PDF</em>. WhatsApp will then open automatically with a&nbsp;
              pre-filled message so you can attach the PDF and send it.
            </div>
          </div>

        </div>

        {/* ── Single action button ── */}
        <div style={{ padding: '12px 20px 28px', borderTop: '1px solid #F3F4F6' }}>
          <button
            onClick={handleSharePDFWhatsApp}
            disabled={!isValid || sharing}
            style={{
              width: '100%', padding: '15px',
              background: isValid && !sharing
                ? 'linear-gradient(135deg, #059669 0%, #10B981 60%, #25D366 100%)'
                : '#F3F4F6',
              color: isValid && !sharing ? '#fff' : '#9CA3AF',
              border: 'none', borderRadius: 14,
              cursor: isValid && !sharing ? 'pointer' : 'not-allowed',
              fontWeight: 800, fontSize: '0.95rem', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              boxShadow: isValid && !sharing ? '0 6px 20px rgba(16,185,129,0.35)' : 'none',
              transition: 'all 0.2s',
              letterSpacing: '-0.01em',
            }}
          >
            {sharing ? (
              <>
                <div style={{
                  width: 18, height: 18, border: '2.5px solid rgba(255,255,255,0.3)',
                  borderTopColor: '#fff', borderRadius: '50%',
                  animation: 'spin 0.7s linear infinite',
                }}/>
                Generating PDF…
              </>
            ) : (
              <>
                {/* WhatsApp icon */}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Share PDF via WhatsApp
                {/* PDF badge */}
                <span style={{
                  background: 'rgba(255,255,255,0.22)', borderRadius: 6,
                  padding: '2px 7px', fontSize: '0.65rem', fontWeight: 800,
                  letterSpacing: '0.08em', border: '1px solid rgba(255,255,255,0.3)',
                }}>PDF</span>
              </>
            )}
          </button>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>

      </div>
    </div>
  )
}

// ── Small helpers ─────────────────────────────────────────────
function Section({ title, children, action }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: '0.63rem', fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{title}</div>
        {action}
      </div>
      {children}
    </div>
  )
}
function Field({ label, children, style }) {
  return (
    <div style={style}>
      <div style={{ fontSize: '0.63rem', fontWeight: 700, color: '#6B7280', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  )
}
function TotalRow({ label, val, bold }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: bold ? '6px 0 0' : '3px 0',
      borderTop: bold ? '1.5px solid #6EE7B7' : 'none',
      marginTop: bold ? 5 : 0,
    }}>
      <span style={{ fontSize: bold ? '0.82rem' : '0.72rem', fontWeight: bold ? 800 : 500, color: bold ? '#065F46' : '#6B7280' }}>{label}</span>
      <span style={{ fontSize: bold ? '0.95rem' : '0.72rem', fontWeight: bold ? 900 : 600, color: bold ? '#059669' : '#374151', fontFamily: 'monospace' }}>{val}</span>
    </div>
  )
}

const inputStyle = {
  width: '100%', padding: '8px 10px', borderRadius: 8,
  border: '1.5px solid #E5E7EB', fontSize: '0.78rem',
  fontFamily: 'inherit', color: '#111827', background: '#FAFAFA',
  outline: 'none', boxSizing: 'border-box',
}

// ── Print-quality PDF invoice HTML ────────────────────────────
function buildInvoiceHTML({ invoiceNo, invoiceDate, validDays, billTo, lines, totals, notes, termsText, user, fmt }) {
  const validUntil = new Date(new Date(invoiceDate).getTime() + validDays * 86400000)
    .toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })
  const dateFormatted = new Date(invoiceDate)
    .toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' })

  const itemRows = lines.filter(l => l.description || l.sku).map((l, i) => {
    const qty       = parseFloat(l.qty)       || 0
    const unitPrice = parseFloat(l.unitPrice) || 0
    const subtotal  = qty * unitPrice
    const gstAmt    = subtotal * (l.gst / 100)
    const total     = subtotal + gstAmt
    return `
      <tr>
        <td class="num">${i+1}</td>
        <td>${l.sku ? `<span class="sku">${l.sku}</span><br>` : ''}${l.description || ''}</td>
        <td class="cen">${qty}</td>
        <td class="cen">${l.unit}</td>
        <td class="rt">₹${unitPrice.toLocaleString('en-IN',{minimumFractionDigits:2})}</td>
        <td class="rt">₹${subtotal.toLocaleString('en-IN',{minimumFractionDigits:2})}</td>
        <td class="cen">${l.gst}%</td>
        <td class="rt">₹${gstAmt.toLocaleString('en-IN',{minimumFractionDigits:2})}</td>
        <td class="rt bold">₹${total.toLocaleString('en-IN',{minimumFractionDigits:2})}</td>
      </tr>`
  }).join('')

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Performa Invoice ${invoiceNo} · DCC INFOTECH PVT LTD</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#1a1a2e;background:#fff}
  .page{max-width:820px;margin:0 auto;padding:36px 40px}

  /* ── Top header ── */
  .inv-header{display:flex;justify-content:space-between;align-items:flex-start;
    padding-bottom:20px;margin-bottom:24px;border-bottom:3px solid #1E3A8A}
  .co-name{font-size:20px;font-weight:900;color:#1E3A8A;letter-spacing:.5px}
  .co-sub{font-size:10.5px;color:#6B7280;margin-top:3px;letter-spacing:.3px}
  .co-prepared{font-size:10px;color:#9CA3AF;margin-top:8px}
  .co-prepared strong{color:#374151}
  .inv-badge h2{font-size:18px;font-weight:900;color:#2563EB;letter-spacing:2px;
    text-transform:uppercase;text-align:right}
  .inv-badge .no{font-size:13px;font-weight:700;color:#374151;margin-top:5px;text-align:right}
  .inv-badge .dt{font-size:11px;color:#9CA3AF;margin-top:2px;text-align:right}
  .inv-badge .valid{font-size:11px;color:#059669;font-weight:600;margin-top:2px;text-align:right}

  /* ── Banner ── */
  .banner{background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;
    padding:9px 14px;font-size:11px;color:#1D4ED8;margin-bottom:22px}
  .banner strong{font-weight:800}

  /* ── Parties ── */
  .parties{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:22px}
  .pbox{background:#F8FAFC;border-radius:8px;padding:13px 15px;border:1px solid #E2E8F0}
  .pbox-label{font-size:9px;font-weight:800;color:#94A3B8;text-transform:uppercase;
    letter-spacing:.12em;margin-bottom:6px}
  .pbox-name{font-size:13px;font-weight:700;color:#1a1a2e;margin-bottom:3px}
  .pbox-detail{font-size:11px;color:#6B7280;line-height:1.55}

  /* ── Table ── */
  table{width:100%;border-collapse:collapse;margin-bottom:18px}
  thead th{background:#1E3A8A;color:#fff;padding:9px 8px;font-size:9.5px;
    font-weight:700;text-transform:uppercase;letter-spacing:.06em;text-align:left}
  .cen{text-align:center!important}
  .rt{text-align:right!important}
  .num{text-align:center!important;color:#94A3B8;font-size:11px}
  tbody td{padding:9px 8px;border-bottom:1px solid #F1F5F9;font-size:11px;vertical-align:top}
  tbody tr:nth-child(even) td{background:#F8FAFF}
  tbody tr:last-child td{border-bottom:none}
  .sku{font-size:9.5px;font-weight:700;color:#2563EB;letter-spacing:.05em;background:#EFF6FF;
    border-radius:3px;padding:1px 5px}
  .bold{font-weight:700}

  /* ── Totals ── */
  .totals-wrap{display:flex;justify-content:flex-end;margin-bottom:22px}
  .totals{min-width:270px;background:#F8FAFC;border-radius:8px;
    padding:14px 16px;border:1px solid #E2E8F0}
  .trow{display:flex;justify-content:space-between;padding:4px 0;font-size:12px}
  .trow.grand{border-top:2px solid #1E3A8A;margin-top:7px;padding-top:9px}
  .trow.grand span:first-child{font-size:13px;font-weight:800;color:#1E3A8A}
  .trow.grand span:last-child{font-size:16px;font-weight:900;color:#1E3A8A;font-family:monospace}

  /* ── Footer ── */
  .footer{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:22px}
  .fbox{background:#F8FAFC;border-radius:8px;padding:12px 14px;border:1px solid #E2E8F0}
  .fbox h4{font-size:9px;font-weight:800;color:#94A3B8;text-transform:uppercase;
    letter-spacing:.1em;margin-bottom:6px}
  .fbox p{font-size:11px;color:#6B7280;line-height:1.6}

  /* ── Stamp ── */
  .stamp{display:flex;justify-content:space-between;align-items:flex-end;
    padding-top:20px;border-top:1px solid #E5E7EB;margin-top:8px}
  .stamp-note{font-size:10px;color:#9CA3AF;line-height:1.5}
  .stamp-sig{text-align:right}
  .stamp-sig .sig-space{height:44px;border-bottom:1px solid #374151;width:170px;margin-bottom:4px}
  .stamp-sig p{font-size:10.5px;color:#374151;font-weight:700}
  .stamp-sig small{font-size:9px;color:#9CA3AF}

  @media print{
    body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .page{padding:24px 28px}
    @page{margin:.5cm}
  }
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="inv-header">
    <div>
      <div class="co-name">DCC INFOTECH PVT LTD</div>
      <div class="co-sub">Field Sales Automation · CRM Solutions</div>
      <div class="co-prepared">
        Prepared by: <strong>${user?.full_name || '—'}</strong>
        ${user?.territory ? ` &nbsp;|&nbsp; Territory: <strong>${user.territory}</strong>` : ''}
      </div>
    </div>
    <div class="inv-badge">
      <h2>Performa Invoice</h2>
      <div class="no">Invoice # ${invoiceNo}</div>
      <div class="dt">Date: ${dateFormatted}</div>
      <div class="valid">✓ Valid until: ${validUntil}</div>
    </div>
  </div>

  <!-- Banner -->
  <div class="banner">
    ℹ️ This is a <strong>Proforma Invoice</strong> issued by <strong>DCC INFOTECH PVT LTD</strong>.
    Prices are valid for <strong>${validDays} days</strong> from the date of issue.
    This document is <strong>not a tax invoice</strong>.
  </div>

  <!-- Parties -->
  <div class="parties">
    <div class="pbox">
      <div class="pbox-label">Bill To</div>
      <div class="pbox-name">${billTo.name || '—'}</div>
      <div class="pbox-detail">
        ${billTo.address ? `📍 ${billTo.address}<br>` : ''}
        ${billTo.phone   ? `📞 ${billTo.phone}<br>` : ''}
        ${billTo.gstin   ? `GSTIN: ${billTo.gstin}` : ''}
      </div>
    </div>
    <div class="pbox">
      <div class="pbox-label">Invoice Summary</div>
      <div class="pbox-detail">
        <strong>${lines.filter(l=>l.description||l.sku).length}</strong> line item(s)<br>
        Subtotal (excl. GST): <strong>${fmt(totals.subtotal)}</strong><br>
        Total GST: <strong>${fmt(totals.gstAmt)}</strong><br>
        <span style="font-size:13px;font-weight:900;color:#1E3A8A">Grand Total: ${fmt(totals.total)}</span>
      </div>
    </div>
  </div>

  <!-- Items -->
  <table>
    <thead>
      <tr>
        <th class="cen" style="width:28px">#</th>
        <th>SKU / Description</th>
        <th class="cen">Qty</th>
        <th class="cen">Unit</th>
        <th class="rt">Unit Price</th>
        <th class="rt">Subtotal</th>
        <th class="cen">GST</th>
        <th class="rt">GST Amt</th>
        <th class="rt">Total</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <!-- Totals -->
  <div class="totals-wrap">
    <div class="totals">
      <div class="trow"><span>Subtotal (excl. GST)</span><span>${fmt(totals.subtotal)}</span></div>
      <div class="trow"><span>Total GST</span><span>${fmt(totals.gstAmt)}</span></div>
      <div class="trow grand"><span>Grand Total</span><span>${fmt(totals.total)}</span></div>
    </div>
  </div>

  <!-- Notes & Terms -->
  <div class="footer">
    <div class="fbox">
      <h4>Notes</h4>
      <p>${notes || 'No additional notes.'}</p>
    </div>
    <div class="fbox">
      <h4>Payment Terms</h4>
      <p>${termsText}</p>
    </div>
  </div>

  <!-- Stamp -->
  <div class="stamp">
    <div class="stamp-note">
      Thank you for your business.<br>
      For queries, please contact your sales representative.
    </div>
    <div class="stamp-sig">
      <div class="sig-space"></div>
      <p>For DCC INFOTECH PVT LTD</p>
      <small>Authorised Signatory</small>
    </div>
  </div>

</div>
</body>
</html>`
}
