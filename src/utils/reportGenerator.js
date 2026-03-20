// PDF Report Generator — uses browser print API (no external lib needed)
// Generates a styled printable report and triggers download

const fmt = v => v ? '₹' + Number(v).toLocaleString('en-IN') : '₹0'
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : '—'

function buildReportHTML(data, meta) {
  const { managers, period, dateFrom, dateTo, totals } = data
  const now = new Date().toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' })

  const rows = managers.map((m, i) => `
    <tr class="${i % 2 === 0 ? 'even' : 'odd'}">
      <td><strong>${m.name}</strong><br><small>${m.territory || '—'}</small></td>
      <td class="num">${m.visits}</td>
      <td class="num">${fmt(m.totalSales)}</td>
      <td class="num">${fmt(m.totalProfit)}</td>
      <td class="num">${fmt(m.totalSalesTgt)}</td>
      <td class="num ${m.salesPct >= 100 ? 'green' : m.salesPct >= 75 ? 'blue' : 'orange'}">
        <strong>${m.salesPct}%</strong>
      </td>
      <td class="num">${m.reports}</td>
    </tr>
  `).join('')

  const periodLabel = period === 'week' ? 'Weekly' : period === 'month' ? 'Monthly' : 'Yearly'

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>DCC SalesForce — ${periodLabel} Report</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #1a1a2e; background: #fff; padding: 32px; }
  .header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 28px; border-bottom: 2px solid #2563EB; padding-bottom: 16px; }
  .logo-section { display: flex; align-items: center; gap: 12px; }
  .logo-box { width: 44px; height: 44px; background: #2563EB; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 900; font-size: 14px; }
  .company { font-size: 18px; font-weight: 900; color: #2563EB; }
  .subtitle { font-size: 11px; color: #6B7280; margin-top: 2px; }
  .report-info { text-align: right; }
  .report-title { font-size: 15px; font-weight: 800; color: #111827; }
  .report-meta { font-size: 10px; color: #6B7280; margin-top: 4px; line-height: 1.6; }
  .kpi-row { display: flex; gap: 16px; margin-bottom: 24px; }
  .kpi { flex: 1; background: #F8FAFC; border: 1px solid #E5E7EB; border-radius: 10px; padding: 14px; text-align: center; }
  .kpi-val { font-size: 18px; font-weight: 900; color: #2563EB; }
  .kpi-lbl { font-size: 10px; color: #6B7280; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 4px; }
  .section-title { font-size: 12px; font-weight: 800; color: #374151; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th { background: #1E3A5F; color: #fff; padding: 9px 12px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
  th.num, td.num { text-align: right; }
  td { padding: 9px 12px; border-bottom: 1px solid #F3F4F6; font-size: 11px; }
  tr.even td { background: #F9FAFB; }
  tr.odd td { background: #fff; }
  .green { color: #059669; }
  .blue  { color: #2563EB; }
  .orange{ color: #D97706; }
  .total-row td { background: #EFF6FF !important; font-weight: 800; border-top: 2px solid #2563EB; }
  .footer { margin-top: 32px; border-top: 1px solid #E5E7EB; padding-top: 12px; display: flex; justify-content: space-between; font-size: 10px; color: #9CA3AF; }
  @media print { body { padding: 16px; } .no-print { display: none; } }
</style>
</head>
<body>
  <div class="header">
    <div class="logo-section">
      <div class="logo-box">DCC</div>
      <div>
        <div class="company">DCC SalesForce</div>
        <div class="subtitle">Field Sales Automation Platform</div>
      </div>
    </div>
    <div class="report-info">
      <div class="report-title">${periodLabel} Performance Report</div>
      <div class="report-meta">
        Period: ${fmtDate(dateFrom)} — ${fmtDate(dateTo)}<br>
        Generated: ${now}<br>
        ${meta?.filteredManager ? 'Manager: ' + meta.filteredManager : 'All Managers'}
      </div>
    </div>
  </div>

  <div class="kpi-row">
    <div class="kpi"><div class="kpi-val">${totals.visits}</div><div class="kpi-lbl">Total Visits</div></div>
    <div class="kpi"><div class="kpi-val">${fmt(totals.sales)}</div><div class="kpi-lbl">Total Sales</div></div>
    <div class="kpi"><div class="kpi-val">${fmt(totals.profit)}</div><div class="kpi-lbl">Total Profit</div></div>
    <div class="kpi"><div class="kpi-val" style="color:${totals.salesPct>=100?'#059669':totals.salesPct>=75?'#2563EB':'#D97706'}">${totals.salesPct}%</div><div class="kpi-lbl">Achievement</div></div>
    <div class="kpi"><div class="kpi-val">${totals.reports}</div><div class="kpi-lbl">Reports Filed</div></div>
  </div>

  <div class="section-title">Manager-wise Breakdown</div>
  <table>
    <thead>
      <tr>
        <th>Manager</th>
        <th class="num">Visits</th>
        <th class="num">Sales</th>
        <th class="num">Profit</th>
        <th class="num">Target</th>
        <th class="num">Achievement</th>
        <th class="num">Reports</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
      <tr class="total-row">
        <td><strong>TOTAL</strong></td>
        <td class="num">${totals.visits}</td>
        <td class="num">${fmt(totals.sales)}</td>
        <td class="num">${fmt(totals.profit)}</td>
        <td class="num">${fmt(totals.salesTgt)}</td>
        <td class="num ${totals.salesPct>=100?'green':totals.salesPct>=75?'blue':'orange'}"><strong>${totals.salesPct}%</strong></td>
        <td class="num">${totals.reports}</td>
      </tr>
    </tbody>
  </table>

  <div class="footer">
    <span>DCC SalesForce CRM &mdash; Confidential</span>
    <span>Generated on ${now}</span>
  </div>
</body>
</html>`
}

export function downloadPDFReport(analyticsData, meta = {}) {
  if (!analyticsData) return

  const html = buildReportHTML(analyticsData, meta)
  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) {
    alert('Please allow popups to download the report')
    return
  }
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => {
    win.print()
    // win.close() -- leave open so user can save as PDF
  }, 500)
}

export function downloadCSVReport(analyticsData, filename) {
  if (!analyticsData) return
  const { managers, dateFrom, dateTo } = analyticsData
  const rows = managers.map(m => ({
    Manager: m.name,
    Territory: m.territory || '',
    Period_From: dateFrom,
    Period_To: dateTo,
    Visits: m.visits,
    Sales_INR: m.totalSales,
    Profit_INR: m.totalProfit,
    Sales_Target_INR: m.totalSalesTgt,
    Achievement_Pct: m.salesPct,
    Reports_Filed: m.reports,
  }))
  const headers = Object.keys(rows[0])
  const csv = [
    headers.join(','),
    ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','))
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || `dcc_report_${dateFrom}_${dateTo}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
