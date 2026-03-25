import { useState, useRef, useCallback } from 'react'
import dccLogo from '../assets/dcc-logo.png'

const GST_OPTIONS = [0, 5, 12, 14, 18, 28]

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
  const [step, setStep]             = useState('form')  // form | preview | sharing
  const [invoiceNo, setInvoiceNo]   = useState(() => 'PI-' + Date.now().toString().slice(-6))
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0])
  const [validDays, setValidDays]   = useState(7)
  const [billTo, setBillTo]         = useState({ name: '', address: '', phone: '', gstin: '' })
  const [lines, setLines]           = useState([emptyLine()])
  const [globalGst, setGlobalGst]   = useState(18)
  const [applyGlobalGst, setApplyGlobalGst] = useState(true)
  const [notes, setNotes]           = useState('')
  const [termsText, setTermsText]   = useState('Payment due within 7 days of invoice.')
  const previewRef = useRef(null)

  // ── Line operations ──────────────────────────────
  const updateLine = (id, field, val) =>
    setLines(ls => ls.map(l => l.id === id ? { ...l, [field]: val } : l))

  const addLine = () => setLines(ls => [...ls, emptyLine()])

  const removeLine = (id) => setLines(ls => ls.length > 1 ? ls.filter(l => l.id !== id) : ls)

  const applyGstToAll = (pct) => {
    setGlobalGst(pct)
    setLines(ls => ls.map(l => ({ ...l, gst: pct })))
  }

  // ── Totals ───────────────────────────────────────
  const totals = lines.reduce((acc, l) => {
    const c = calcLine(l)
    return {
      subtotal: acc.subtotal + c.subtotal,
      gstAmt:   acc.gstAmt   + c.gstAmt,
      total:    acc.total    + c.total,
    }
  }, { subtotal: 0, gstAmt: 0, total: 0 })

  const fmt = n => '₹' + Number(n.toFixed(2)).toLocaleString('en-IN', { minimumFractionDigits: 2 })

  // ── Generate PDF via Print API ────────────────────
  const handleGeneratePDF = useCallback(() => {
    const html = buildInvoiceHTML({
      invoiceNo, invoiceDate, validDays, billTo,
      lines, totals, notes, termsText, user, fmt,
    })
    const win = window.open('', '_blank', 'width=900,height=700')
    if (!win) { alert('Please allow pop-ups to generate PDF'); return }
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); }, 500)
  }, [invoiceNo, invoiceDate, validDays, billTo, lines, totals, notes, termsText, user, fmt])

  // ── Share on WhatsApp (text summary + link to app) ─
  const handleShareWhatsApp = useCallback(() => {
    const itemList = lines
      .filter(l => l.description || l.sku)
      .map((l, i) => {
        const c = calcLine(l)
        return `${i+1}. ${l.description || l.sku} — ${l.qty} ${l.unit} × ₹${l.unitPrice} = ${fmt(c.total)} (incl. ${l.gst}% GST)`
      }).join('\n')

    const text = [
      `🧾 *DCC Performa Invoice*`,
      `Invoice No: *${invoiceNo}*`,
      `Date: ${new Date(invoiceDate).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}`,
      `Valid for: ${validDays} days`,
      ``,
      `*Bill To:*`,
      `${billTo.name}`,
      billTo.address ? billTo.address : '',
      billTo.phone   ? `📞 ${billTo.phone}` : '',
      billTo.gstin   ? `GSTIN: ${billTo.gstin}` : '',
      ``,
      `*Items:*`,
      itemList,
      ``,
      `──────────────────`,
      `Subtotal:  ${fmt(totals.subtotal)}`,
      `GST:       ${fmt(totals.gstAmt)}`,
      `*TOTAL:    ${fmt(totals.total)}*`,
      `──────────────────`,
      notes ? `\n_${notes}_` : '',
      ``,
      `_DCC SalesForce · ${user?.full_name || ''}_`,
    ].filter(l => l !== null && l !== undefined).join('\n')

    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank')
  }, [invoiceNo, invoiceDate, validDays, billTo, lines, totals, notes, user, fmt])

  const isValid = billTo.name.trim() && lines.some(l => l.description || l.sku)

  // ── UI ───────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2100,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={e => e.target === e.currentTarget && onClose()}>

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
            <div style={{ fontSize: '0.7rem', color: '#9CA3AF', marginTop: 2 }}>
              Create & share professional quotations
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

          {/* ── Invoice Meta ── */}
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
              <Field label="Global GST %">
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {GST_OPTIONS.map(g => (
                    <button key={g} onClick={() => applyGstToAll(g)} style={{
                      padding: '4px 8px', borderRadius: 6, border: 'none',
                      background: globalGst === g ? '#2563EB' : '#F3F4F6',
                      color: globalGst === g ? '#fff' : '#374151',
                      fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer',
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
          <Section title={`Items (${lines.length})`} action={
            <button onClick={addLine} style={{
              background: '#EFF6FF', color: '#2563EB', border: 'none',
              borderRadius: 6, padding: '4px 10px', fontSize: '0.7rem',
              fontWeight: 700, cursor: 'pointer',
            }}>+ Add Item</button>
          }>
            {/* Column headers */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 1fr 24px', gap: 6, marginBottom: 6 }}>
              {['SKU', 'Description', 'Qty', 'Unit Price', 'GST%', ''].map((h, i) => (
                <div key={i} style={{ fontSize: '0.6rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
              ))}
            </div>

            {lines.map((line, idx) => {
              const c = calcLine(line)
              return (
                <div key={line.id} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 1fr 24px', gap: 6, alignItems: 'center' }}>
                    <input placeholder="SKU / Code" value={line.sku}
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
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem',
                      flexShrink: 0,
                    }}>✕</button>
                  </div>
                  {/* Line total */}
                  {(line.qty && line.unitPrice) && (
                    <div style={{ textAlign: 'right', fontSize: '0.65rem', color: '#6B7280', marginTop: 2 }}>
                      {line.qty} × ₹{line.unitPrice} + {line.gst}% GST = <strong style={{ color: '#111827' }}>{fmt(c.total)}</strong>
                    </div>
                  )}
                </div>
              )
            })}

            {/* Totals summary */}
            <div style={{
              background: '#F9FAFB', borderRadius: 10, padding: '12px 14px', marginTop: 8,
              border: '1px solid #E5E7EB',
            }}>
              <TotalRow label="Subtotal (excl. GST)" val={fmt(totals.subtotal)}/>
              <TotalRow label="Total GST" val={fmt(totals.gstAmt)}/>
              <TotalRow label="GRAND TOTAL" val={fmt(totals.total)} bold/>
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

        </div>

        {/* ── Action Buttons ── */}
        <div style={{ padding: '12px 20px 28px', borderTop: '1px solid #F3F4F6', display: 'flex', gap: 8 }}>
          {/* PDF Button */}
          <button
            onClick={handleGeneratePDF}
            disabled={!isValid}
            style={{
              flex: 1, padding: '13px 12px',
              background: isValid ? 'linear-gradient(135deg,#DC2626,#EF4444)' : '#F3F4F6',
              color: isValid ? '#fff' : '#9CA3AF',
              border: 'none', borderRadius: 12, cursor: isValid ? 'pointer' : 'not-allowed',
              fontWeight: 800, fontSize: '0.82rem', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              boxShadow: isValid ? '0 4px 16px rgba(220,38,38,0.3)' : 'none',
              transition: 'all 0.2s',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
            PDF / Print
          </button>

          {/* WhatsApp Button */}
          <button
            onClick={handleShareWhatsApp}
            disabled={!isValid}
            style={{
              flex: 1, padding: '13px 12px',
              background: isValid ? 'linear-gradient(135deg,#059669,#10B981)' : '#F3F4F6',
              color: isValid ? '#fff' : '#9CA3AF',
              border: 'none', borderRadius: 12, cursor: isValid ? 'pointer' : 'not-allowed',
              fontWeight: 800, fontSize: '0.82rem', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              boxShadow: isValid ? '0 4px 16px rgba(16,185,129,0.3)' : 'none',
              transition: 'all 0.2s',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/>
            </svg>
            Share via WhatsApp
          </button>
        </div>

      </div>
    </div>
  )
}

// ── Helper Components ─────────────────────────────────────────
function Section({ title, children, action }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{title}</div>
        {action}
      </div>
      {children}
    </div>
  )
}

function Field({ label, children, style }) {
  return (
    <div style={style}>
      <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#6B7280', marginBottom: 4, letterSpacing: '0.04em' }}>{label}</div>
      {children}
    </div>
  )
}

function TotalRow({ label, val, bold }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: bold ? '6px 0 0' : '3px 0',
      borderTop: bold ? '1.5px solid #E5E7EB' : 'none',
      marginTop: bold ? 4 : 0,
    }}>
      <span style={{ fontSize: bold ? '0.8rem' : '0.72rem', fontWeight: bold ? 800 : 500, color: bold ? '#111827' : '#6B7280' }}>{label}</span>
      <span style={{ fontSize: bold ? '0.9rem' : '0.72rem', fontWeight: bold ? 900 : 600, color: bold ? '#111827' : '#374151', fontFamily: 'monospace' }}>{val}</span>
    </div>
  )
}

const inputStyle = {
  width: '100%', padding: '8px 10px', borderRadius: 8,
  border: '1.5px solid #E5E7EB', fontSize: '0.78rem',
  fontFamily: 'inherit', color: '#111827', background: '#FAFAFA',
  outline: 'none', boxSizing: 'border-box',
  transition: 'border-color 0.15s',
}

// ── Print-quality HTML invoice ────────────────────────────────
function buildInvoiceHTML({ invoiceNo, invoiceDate, validDays, billTo, lines, totals, notes, termsText, user, fmt }) {
  const validUntil = new Date(new Date(invoiceDate).getTime() + validDays * 86400000)
    .toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  const dateFormatted = new Date(invoiceDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

  const itemRows = lines.filter(l => l.description || l.sku).map((l, i) => {
    const qty       = parseFloat(l.qty)       || 0
    const unitPrice = parseFloat(l.unitPrice) || 0
    const subtotal  = qty * unitPrice
    const gstAmt    = subtotal * (l.gst / 100)
    const total     = subtotal + gstAmt
    return `
      <tr>
        <td>${i+1}</td>
        <td><strong>${l.sku || ''}</strong>${l.sku && l.description ? '<br>' : ''}${l.description || ''}</td>
        <td style="text-align:center">${qty}</td>
        <td style="text-align:center">${l.unit}</td>
        <td style="text-align:right">₹${unitPrice.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
        <td style="text-align:right">₹${subtotal.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
        <td style="text-align:center">${l.gst}%</td>
        <td style="text-align:right">₹${gstAmt.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
        <td style="text-align:right"><strong>₹${total.toLocaleString('en-IN', {minimumFractionDigits:2})}</strong></td>
      </tr>`
  }).join('')

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Performa Invoice ${invoiceNo}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1a1a2e; background: #fff; }
  .page { max-width: 800px; margin: 0 auto; padding: 32px; }

  /* Header */
  .inv-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; padding-bottom: 20px; border-bottom: 2px solid #2563EB; }
  .company-info h1 { font-size: 22px; font-weight: 900; color: #1e3a8a; letter-spacing: -0.5px; }
  .company-info p { font-size: 11px; color: #6b7280; margin-top: 2px; }
  .inv-title { text-align: right; }
  .inv-title h2 { font-size: 20px; font-weight: 900; color: #2563EB; letter-spacing: 1px; text-transform: uppercase; }
  .inv-title .inv-no { font-size: 13px; font-weight: 700; color: #374151; margin-top: 4px; }
  .inv-title .inv-date { font-size: 11px; color: #9CA3AF; margin-top: 2px; }

  /* Bill To / From grid */
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
  .party-box { background: #F8FAFC; border-radius: 8px; padding: 14px 16px; border: 1px solid #E2E8F0; }
  .party-box h4 { font-size: 9px; font-weight: 800; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 6px; }
  .party-box .name { font-size: 13px; font-weight: 700; color: #1a1a2e; }
  .party-box .detail { font-size: 11px; color: #6b7280; margin-top: 3px; line-height: 1.5; }

  /* Table */
  .items-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  .items-table thead th { background: #1e3a8a; color: #fff; padding: 10px 8px; font-size: 10px; font-weight: 700; text-align: left; text-transform: uppercase; letter-spacing: 0.05em; }
  .items-table thead th:not(:first-child) { text-align: center; }
  .items-table thead th:last-child, .items-table thead th:nth-child(5), .items-table thead th:nth-child(6), .items-table thead th:nth-child(8) { text-align: right; }
  .items-table tbody td { padding: 9px 8px; border-bottom: 1px solid #F1F5F9; font-size: 11px; vertical-align: top; }
  .items-table tbody tr:nth-child(even) td { background: #F8FAFF; }
  .items-table tbody tr:last-child td { border-bottom: none; }

  /* Totals */
  .totals-section { display: flex; justify-content: flex-end; margin-bottom: 24px; }
  .totals-box { min-width: 260px; }
  .total-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 12px; }
  .total-row.grand { border-top: 2px solid #1e3a8a; margin-top: 6px; padding-top: 8px; }
  .total-row.grand span { font-size: 15px; font-weight: 900; color: #1e3a8a; }

  /* Footer */
  .footer-row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
  .footer-box { background: #F8FAFC; border-radius: 8px; padding: 12px 14px; border: 1px solid #E2E8F0; }
  .footer-box h4 { font-size: 9px; font-weight: 800; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 6px; }
  .footer-box p { font-size: 11px; color: #6b7280; line-height: 1.6; }

  .stamp { text-align: right; padding-top: 40px; border-top: 1px solid #E2E8F0; }
  .stamp p { font-size: 11px; color: #9CA3AF; margin-bottom: 40px; }
  .stamp .sig-line { border-top: 1px solid #374151; width: 160px; margin-left: auto; padding-top: 4px; font-size: 11px; color: #374151; font-weight: 700; }

  .validity-banner { background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 6px; padding: 8px 12px; font-size: 11px; color: #1D4ED8; margin-bottom: 20px; }
  .validity-banner strong { font-weight: 800; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { padding: 20px; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="inv-header">
    <div class="company-info">
      <h1>DCC</h1>
      <p>SalesForce · Field Sales Automation</p>
      <p style="margin-top:6px;font-size:10px;color:#9CA3AF">Prepared by: <strong style="color:#374151">${user?.full_name || ''}</strong></p>
      ${user?.territory ? `<p style="font-size:10px;color:#9CA3AF">Territory: <strong style="color:#374151">${user.territory}</strong></p>` : ''}
    </div>
    <div class="inv-title">
      <h2>Performa Invoice</h2>
      <div class="inv-no"># ${invoiceNo}</div>
      <div class="inv-date">Date: ${dateFormatted}</div>
      <div class="inv-date" style="color:#059669;font-weight:600">Valid until: ${validUntil}</div>
    </div>
  </div>

  <!-- Validity Banner -->
  <div class="validity-banner">
    ℹ️ This is a <strong>Proforma Invoice</strong>. Prices are valid for <strong>${validDays} days</strong> from the date of issue. This is not a tax invoice.
  </div>

  <!-- Parties -->
  <div class="parties">
    <div class="party-box">
      <h4>Bill To</h4>
      <div class="name">${billTo.name || '—'}</div>
      ${billTo.address ? `<div class="detail">📍 ${billTo.address}</div>` : ''}
      ${billTo.phone   ? `<div class="detail">📞 ${billTo.phone}</div>` : ''}
      ${billTo.gstin   ? `<div class="detail">GSTIN: ${billTo.gstin}</div>` : ''}
    </div>
    <div class="party-box">
      <h4>Invoice Summary</h4>
      <div class="detail">
        <strong>${lines.filter(l=>l.description||l.sku).length}</strong> line item(s)<br>
        Subtotal: ${fmt(totals.subtotal)}<br>
        GST: ${fmt(totals.gstAmt)}<br>
        <strong style="color:#1e3a8a;font-size:13px">Total: ${fmt(totals.total)}</strong>
      </div>
    </div>
  </div>

  <!-- Items Table -->
  <table class="items-table">
    <thead>
      <tr>
        <th>#</th>
        <th>SKU / Description</th>
        <th>Qty</th>
        <th>Unit</th>
        <th>Unit Price</th>
        <th>Subtotal</th>
        <th>GST</th>
        <th>GST Amt</th>
        <th>Total</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <!-- Totals -->
  <div class="totals-section">
    <div class="totals-box">
      <div class="total-row"><span>Subtotal (excl. GST)</span><span>${fmt(totals.subtotal)}</span></div>
      <div class="total-row"><span>Total GST</span><span>${fmt(totals.gstAmt)}</span></div>
      <div class="total-row grand"><span>Grand Total</span><span>${fmt(totals.total)}</span></div>
    </div>
  </div>

  <!-- Notes & Terms -->
  <div class="footer-row">
    ${notes ? `<div class="footer-box"><h4>Notes</h4><p>${notes}</p></div>` : '<div></div>'}
    <div class="footer-box"><h4>Payment Terms</h4><p>${termsText}</p></div>
  </div>

  <!-- Signature -->
  <div class="stamp">
    <p>For DCC SalesForce</p>
    <div class="sig-line">Authorised Signatory</div>
  </div>

</div>
</body>
</html>`
}
