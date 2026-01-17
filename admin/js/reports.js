// admin/js/reports.js - FIXED VERSION

const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const logoutBtn = document.getElementById('logoutBtn');

if (sidebar && sidebarToggle) {
  sidebarToggle.addEventListener('click', () => {
    const isHidden = sidebar.classList.contains('-translate-x-full');
    if (isHidden) sidebar.classList.remove('-translate-x-full');
    else sidebar.classList.add('-translate-x-full');
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    const supabase = window.supabaseClient;
    if (!supabase) {
      window.location.href = '../index.html';
      return;
    }
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Logout error:', error);
        alert('Unable to log out right now. Please try again.');
        return;
      }
      window.location.href = '../index.html';
    } catch (e) {
      console.error('Unexpected logout error:', e);
      window.location.href = '../index.html';
    }
  });
}

// DOM refs
const reportYearBadge = document.getElementById('reportYearBadge');
const reportYearSelect = document.getElementById('reportYear');
const reportMonthSelect = document.getElementById('reportMonth');
const reportZoneSelect = document.getElementById('reportZone');
const reportLgaSelect = document.getElementById('reportLga');
const reportStatus = document.getElementById('reportStatus');
const reportSummary = document.getElementById('reportSummary');
const reportTableBody = document.getElementById('reportTableBody');

const btnGenerateReport = document.getElementById('btnGenerateReport');
const btnExportExcel = document.getElementById('btnExportExcel');
const btnExportPdf = document.getElementById('btnExportPdf');

let allZones = [];
let allLgas = [];
let allMdas = [];
let allMdaBudgets = []; // Store MDA budgets for calculations
let currentReportRows = [];

// Helpers
function formatCurrency(value) {
  const num = Number(value || 0);
  return '₦' + num.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function mapMonthName(m) {
  const months = [
    '', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return months[m] || '';
}

// Main load
(async () => {
  const supabase = window.supabaseClient;
  if (!supabase) return;

  // 1) Auth
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session || !sessionData.session.user) {
    window.location.href = '../index.html';
    return;
  }
  const user = sessionData.session.user;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('full_name, global_role')
    .eq('user_id', user.id)
    .single();

  if (profileError || !profile || profile.global_role !== 'admin') {
    window.location.href = '../index.html';
    return;
  }

  const name =
    profile.full_name && profile.full_name.trim().length > 0
      ? profile.full_name.trim()
      : user.email || 'Admin User';
  const initial = name.charAt(0).toUpperCase();

  const topbarUserName = document.getElementById('topbarUserName');
  const topbarUserInitial = document.getElementById('topbarUserInitial');
  if (topbarUserName) topbarUserName.textContent = name;
  if (topbarUserInitial) topbarUserInitial.textContent = initial;

  // 2) Load zones, LGAs, MDAs
  const { data: zones, error: zonesError } = await supabase
    .from('zones')
    .select('id, name')
    .order('name', { ascending: true });

  const { data: lgas, error: lgasError } = await supabase
    .from('lgas')
    .select('id, name, zone_id')
    .order('name', { ascending: true });

  const { data: mdas, error: mdasError } = await supabase
    .from('mdas')
    .select('id, name, code')
    .order('name', { ascending: true });

  if (zonesError) console.error('Error loading zones:', zonesError);
  if (lgasError) console.error('Error loading LGAs:', lgasError);
  if (mdasError) console.error('Error loading MDAs:', mdasError);

  allZones = zones || [];
  allLgas = lgas || [];
  allMdas = mdas || [];

  // Populate selects
  if (reportZoneSelect) {
    allZones.forEach((z) => {
      const opt = document.createElement('option');
      opt.value = String(z.id);
      opt.textContent = z.name;
      reportZoneSelect.appendChild(opt);
    });
  }

  if (reportLgaSelect) {
    allLgas.forEach((l) => {
      const opt = document.createElement('option');
      opt.value = String(l.id);
      opt.textContent = l.name;
      reportLgaSelect.appendChild(opt);
    });
  }

  // 3) Load years
  const { data: yearRows, error: yearError } = await supabase
    .from('revenues')
    .select('revenue_date')
    .limit(1000);

  if (yearError) {
    console.error('Error loading revenues years:', yearError);
  }

  const yearsSet = new Set();
  (yearRows || []).forEach((r) => {
    const d = r.revenue_date ? new Date(r.revenue_date) : null;
    if (d && !isNaN(d.getTime())) {
      yearsSet.add(d.getFullYear());
    }
  });

  const years = Array.from(yearsSet).sort((a, b) => b - a);
  const currentYear = new Date().getFullYear();
  if (!yearsSet.has(currentYear)) years.unshift(currentYear);

  if (reportYearSelect) {
    years.forEach((y) => {
      const opt = document.createElement('option');
      opt.value = String(y);
      opt.textContent = String(y);
      reportYearSelect.appendChild(opt);
    });
    reportYearSelect.value = String(currentYear);
  }
  if (reportYearBadge) {
    reportYearBadge.textContent = String(currentYear);
  }

  // 4) Load MDA budgets
  const { data: mdaBudgetsData, error: budgetsError } = await supabase
    .from('mda_budgets')
    .select('mda_id, year, approved_ntr')
    .order('year', { ascending: false });

  if (budgetsError) {
    console.error('Error loading MDA budgets:', budgetsError);
  }
  allMdaBudgets = mdaBudgetsData || [];

  // Initial button state
  if (btnExportExcel) btnExportExcel.disabled = true;
  if (btnExportPdf) btnExportPdf.disabled = true;
})();

// Generate report
if (btnGenerateReport) {
  btnGenerateReport.addEventListener('click', async () => {
    const supabase = window.supabaseClient;
    if (!supabase) return;

    const year = reportYearSelect && reportYearSelect.value
      ? Number(reportYearSelect.value)
      : null;
    const month = reportMonthSelect && reportMonthSelect.value
      ? Number(reportMonthSelect.value)
      : null;
    const zoneId = reportZoneSelect && reportZoneSelect.value
      ? Number(reportZoneSelect.value)
      : null;
    const lgaId = reportLgaSelect && reportLgaSelect.value
      ? Number(reportLgaSelect.value)
      : null;

    if (!year) {
      reportStatus.textContent = 'Please select a year.';
      return;
    }

    reportStatus.textContent = 'Loading report data...';
    if (btnExportExcel) btnExportExcel.disabled = true;
    if (btnExportPdf) btnExportPdf.disabled = true;

    try {
      let query = supabase
        .from('revenues')
        .select(`
          id,
          amount,
          revenue_date,
          mda_id,
          zone_id,
          lga_id,
          mdas ( name, code ),
          zones ( name ),
          lgas ( name ),
          revenue_sources ( id, name, code )
        `)
        .order('revenue_date', { ascending: true });

      query = query.gte('revenue_date', `${year}-01-01`).lte('revenue_date', `${year}-12-31`);

      if (month) {
        const monthStr = month.toString().padStart(2, '0');
        const start = `${year}-${monthStr}-01`;
        const endDate = new Date(year, month, 0).getDate();
        const end = `${year}-${monthStr}-${endDate.toString().padStart(2, '0')}`;
        query = query.gte('revenue_date', start).lte('revenue_date', end);
      }

      if (zoneId) query = query.eq('zone_id', zoneId);
      if (lgaId) query = query.eq('lga_id', lgaId);

      const { data, error } = await query;
      if (error) {
        console.error('Report query error:', error);
        reportStatus.textContent = 'Unable to load report data. Please try again.';
        renderReportTable([]);
        return;
      }

      currentReportRows = data || [];
      renderReportTable(currentReportRows);

      const total = currentReportRows.reduce(
        (sum, r) => sum + Number(r.amount || 0),
        0
      );
      const monthLabel = month ? mapMonthName(month) : 'All months';
      const zoneLabel = zoneId
        ? (allZones.find((z) => z.id === zoneId)?.name || `Zone ${zoneId}`)
        : 'All zones';
      const lgaLabel = lgaId
        ? (allLgas.find((l) => l.id === lgaId)?.name || `LGA ${lgaId}`)
        : 'All LGAs';

      reportSummary.textContent =
        `Total records: ${currentReportRows.length.toString()} • Total amount: ${formatCurrency(total)} • ` +
        `${year}, ${monthLabel}, ${zoneLabel}, ${lgaLabel}.`;
      reportStatus.textContent = 'Report loaded. You can now export as Excel or PDF.';

      if (btnExportExcel) btnExportExcel.disabled = currentReportRows.length === 0;
      if (btnExportPdf) btnExportPdf.disabled = currentReportRows.length === 0;
    } catch (err) {
      console.error('Unexpected report error:', err);
      reportStatus.textContent = 'Unexpected error while loading report.';
      renderReportTable([]);
    }
  });
}

// Render table
function renderReportTable(rows) {
  if (!reportTableBody) return;

  reportTableBody.innerHTML = '';

  if (!rows || rows.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.className = 'px-3 py-4 text-center text-slate-500';
    td.textContent = 'No data to display.';
    tr.appendChild(td);
    reportTableBody.appendChild(tr);
    return;
  }

  rows.forEach((r) => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50';

    const date = r.revenue_date ? new Date(r.revenue_date) : null;
    const dateLabel = date && !isNaN(date.getTime())
      ? date.toLocaleDateString('en-NG')
      : '';

    const zoneName = r.zones?.name || '';
    const lgaName = r.lgas?.name || '';
    const mdaName = r.mdas?.name || '';
    const sourceName = r.revenue_sources?.name || '';

    const tdDate = document.createElement('td');
    tdDate.className = 'px-3 py-2 align-middle';
    tdDate.textContent = dateLabel;
    tr.appendChild(tdDate);

    const tdZone = document.createElement('td');
    tdZone.className = 'px-3 py-2 align-middle';
    tdZone.textContent = zoneName || '—';
    tr.appendChild(tdZone);

    const tdLga = document.createElement('td');
    tdLga.className = 'px-3 py-2 align-middle';
    tdLga.textContent = lgaName || '—';
    tr.appendChild(tdLga);

    const tdMda = document.createElement('td');
    tdMda.className = 'px-3 py-2 align-middle';
    tdMda.textContent = mdaName || '—';
    tr.appendChild(tdMda);

    const tdSource = document.createElement('td');
    tdSource.className = 'px-3 py-2 align-middle';
    tdSource.textContent = sourceName || '—';
    tr.appendChild(tdSource);

    const tdAmount = document.createElement('td');
    tdAmount.className = 'px-3 py-2 align-middle text-right';
    tdAmount.textContent = formatCurrency(r.amount);
    tr.appendChild(tdAmount);

    reportTableBody.appendChild(tr);
  });
}

// Excel export - Professional format with CORRECT MDA budget calculations
if (btnExportExcel) {
  btnExportExcel.addEventListener('click', async () => {
    if (!currentReportRows || currentReportRows.length === 0) return;
    if (typeof XLSX === 'undefined') {
      alert('Excel export library not loaded.');
      return;
    }

    const year = reportYearSelect && reportYearSelect.value
      ? Number(reportYearSelect.value)
      : new Date().getFullYear();
    const month = reportMonthSelect && reportMonthSelect.value
      ? Number(reportMonthSelect.value)
      : null;
    const zoneId = reportZoneSelect && reportZoneSelect.value
      ? Number(reportZoneSelect.value)
      : null;
    const lgaId = reportLgaSelect && reportLgaSelect.value
      ? Number(reportLgaSelect.value)
      : null;

    const monthLabel = month ? mapMonthName(month) : 'All months';
    const zoneLabel = zoneId
      ? (allZones.find((z) => z.id === zoneId)?.name || `Zone ${zoneId}`)
      : 'All zones';
    const lgaLabel = lgaId
      ? (allLgas.find((l) => l.id === lgaId)?.name || `LGA ${lgaId}`)
      : 'All LGAs';

    reportStatus.textContent = 'Preparing Excel export...';

    // Build budget map for this year
    const budgetByMda = {};
    allMdaBudgets.forEach((b) => {
      if (b.year === year) {
        budgetByMda[b.mda_id] = Number(b.approved_ntr || 0);
      }
    });

    // Calculate totals
    const totalCollected = currentReportRows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const uniqueMdas = [...new Set(currentReportRows.map((r) => r.mda_id))];
    const totalApprovedBudget = uniqueMdas.reduce((sum, mdaId) => sum + (budgetByMda[mdaId] || 0), 0);
    const variance = totalApprovedBudget - totalCollected;
    const performance = totalApprovedBudget > 0 ? (totalCollected / totalApprovedBudget) * 100 : 0;

    const wb = XLSX.utils.book_new();

    // ===== SHEET 1: SUMMARY =====
    const summaryData = [
      ['KATSINA STATE INTERNAL REVENUE SERVICE'],
      ['REVENUE OPERATIONAL DIRECTORATE'],
      ['NON TAX REVENUE DEPARTMENT'],
      ['NTR REVENUE REPORT'],
      [],
      ['REPORT PARAMETERS', ''],
      ['Reporting Year', year],
      ['Month(s)', monthLabel],
      ['Zone(s)', zoneLabel],
      ['LGA(s)', lgaLabel],
      [],
      ['SUMMARY METRICS', ''],
      ['Total Approved Budget (MDA Level)', totalApprovedBudget],
      ['Total Collected', totalCollected],
      ['Variance (Budget - Collected)', variance],
      ['Performance (%)', performance.toFixed(2)],
      ['Total Records', currentReportRows.length],
      [],
      ['Report Generated', new Date().toLocaleString('en-NG')]
    ];

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    summarySheet['!cols'] = [{ wch: 35 }, { wch: 20 }];

    // Style headers
    const styles = {
      header: {
        font: { bold: true, size: 13, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '16324F' }, patternType: 'solid' },
        alignment: { horizontal: 'left', vertical: 'center' }
      },
      sectionTitle: {
        font: { bold: true, size: 11, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '0B4F3C' }, patternType: 'solid' },
        alignment: { horizontal: 'left', vertical: 'center' }
      },
      labelBold: {
        font: { bold: true, size: 11, color: { rgb: '16324F' } },
        alignment: { horizontal: 'left' }
      },
      value: {
        font: { size: 11, color: { rgb: '000000' } },
        alignment: { horizontal: 'right' },
        numFmt: '#,##0.00'
      }
    };

    [0, 1, 2, 3].forEach((i) => {
      if (summarySheet['A' + (i + 1)]) {
        summarySheet['A' + (i + 1)].s = styles.header;
      }
    });

    [6, 12].forEach((i) => {
      if (summarySheet['A' + (i + 1)]) {
        summarySheet['A' + (i + 1)].s = styles.sectionTitle;
      }
    });

    for (let i = 7; i <= 18; i++) {
      if (summarySheet['A' + i]) summarySheet['A' + i].s = styles.labelBold;
      if (summarySheet['B' + i] && i >= 12 && i <= 17) {
        if (!summarySheet['B' + i]) summarySheet['B' + i] = {};
        summarySheet['B' + i].s = styles.value;
      }
    }

    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

    // ===== SHEET 2: REVENUE BY SOURCE =====
    const sourceMap = {};
    currentReportRows.forEach((r) => {
      const sourceKey = r.revenue_sources?.name || 'Unknown';
      if (!sourceMap[sourceKey]) {
        sourceMap[sourceKey] = {
          code: r.revenue_sources?.code || '',
          total: 0,
          count: 0
        };
      }
      sourceMap[sourceKey].total += Number(r.amount || 0);
      sourceMap[sourceKey].count += 1;
    });

    const sourceData = [
      ['Revenue Source', 'Code', 'Total Collected (₦)', 'Number of Records', 'Average Per Record (₦)']
    ];
    Object.keys(sourceMap)
      .sort()
      .forEach((source) => {
        const item = sourceMap[source];
        sourceData.push([
          source,
          item.code,
          item.total,
          item.count,
          item.count > 0 ? item.total / item.count : 0
        ]);
      });
    sourceData.push([]);
    sourceData.push(['TOTAL', '', totalCollected, currentReportRows.length, totalCollected / (currentReportRows.length || 1)]);

    const sourceSheet = XLSX.utils.aoa_to_sheet(sourceData);
    sourceSheet['!cols'] = [{ wch: 35 }, { wch: 12 }, { wch: 18 }, { wch: 15 }, { wch: 18 }];

    // Header style for source sheet
    const sourceHeaderStyle = {
      font: { bold: true, size: 11, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '0B4F3C' }, patternType: 'solid' },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true }
    };

    const sourceTotalStyle = {
      font: { bold: true, size: 11, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '16324F' }, patternType: 'solid' },
      numFmt: '#,##0.00'
    };

    ['A1', 'B1', 'C1', 'D1', 'E1'].forEach((cell) => {
      if (sourceSheet[cell]) sourceSheet[cell].s = sourceHeaderStyle;
    });

    const totalRowIdx = Object.keys(sourceMap).length + 3;
    ['A', 'B', 'C', 'D', 'E'].forEach((col) => {
      const cell = col + totalRowIdx;
      if (sourceSheet[cell]) sourceSheet[cell].s = sourceTotalStyle;
    });

    for (let i = 2; i < totalRowIdx; i++) {
      if (sourceSheet['C' + i]) sourceSheet['C' + i].numFmt = '#,##0.00';
      if (sourceSheet['E' + i]) sourceSheet['E' + i].numFmt = '#,##0.00';
    }

    XLSX.utils.book_append_sheet(wb, sourceSheet, 'By Revenue Source');

    // ===== SHEET 3: REVENUE BY MDA =====
    const mdaMap = {};
    currentReportRows.forEach((r) => {
      const mdaId = r.mda_id;
      const mdaName = r.mdas?.name || 'Unknown MDA';
      if (!mdaMap[mdaName]) {
        mdaMap[mdaName] = {
          id: mdaId,
          collected: 0,
          count: 0
        };
      }
      mdaMap[mdaName].collected += Number(r.amount || 0);
      mdaMap[mdaName].count += 1;
    });

    const mdaData = [
      ['MDA Name', 'Approved Budget (₦)', 'Total Collected (₦)', 'Variance (₦)', 'Performance (%)']
    ];
    Object.keys(mdaMap)
      .sort()
      .forEach((mdaName) => {
        const item = mdaMap[mdaName];
        const approved = budgetByMda[item.id] || 0;
        const mdaVariance = approved - item.collected;
        const mdaPerf = approved > 0 ? (item.collected / approved) * 100 : 0;
        mdaData.push([
          mdaName,
          approved,
          item.collected,
          mdaVariance,
          mdaPerf.toFixed(2)
        ]);
      });
    mdaData.push([]);
    mdaData.push(['TOTAL', totalApprovedBudget, totalCollected, variance, performance.toFixed(2)]);

    const mdaSheet = XLSX.utils.aoa_to_sheet(mdaData);
    mdaSheet['!cols'] = [{ wch: 35 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 12 }];

    const mdaHeaderStyle = {
      font: { bold: true, size: 11, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '0B4F3C' }, patternType: 'solid' },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true }
    };

    const mdaTotalStyle = {
      font: { bold: true, size: 11, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '16324F' }, patternType: 'solid' },
      numFmt: '#,##0.00'
    };

    ['A1', 'B1', 'C1', 'D1', 'E1'].forEach((cell) => {
      if (mdaSheet[cell]) mdaSheet[cell].s = mdaHeaderStyle;
    });

    const mdaTotalRowIdx = Object.keys(mdaMap).length + 3;
    ['A', 'B', 'C', 'D', 'E'].forEach((col) => {
      const cell = col + mdaTotalRowIdx;
      if (mdaSheet[cell]) mdaSheet[cell].s = mdaTotalStyle;
    });

    for (let i = 2; i < mdaTotalRowIdx; i++) {
      if (mdaSheet['B' + i]) mdaSheet['B' + i].numFmt = '#,##0.00';
      if (mdaSheet['C' + i]) mdaSheet['C' + i].numFmt = '#,##0.00';
      if (mdaSheet['D' + i]) mdaSheet['D' + i].numFmt = '#,##0.00';
    }

    XLSX.utils.book_append_sheet(wb, mdaSheet, 'By MDA');

    // ===== SHEET 4: DETAILED TRANSACTIONS =====
    const detailedData = currentReportRows.map((r) => {
      const date = r.revenue_date ? new Date(r.revenue_date) : null;
      return {
        'Date': date && !isNaN(date.getTime()) ? date.toISOString().substring(0, 10) : '',
        'Zone': r.zones?.name || '',
        'LGA': r.lgas?.name || '',
        'MDA': r.mdas?.name || '',
        'Revenue Source': r.revenue_sources?.name || '',
        'Code': r.revenue_sources?.code || '',
        'Amount (₦)': Number(r.amount || 0)
      };
    });

    const detailedSheet = XLSX.utils.json_to_sheet(detailedData);
    detailedSheet['!cols'] = [
      { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 30 }, { wch: 35 }, { wch: 12 }, { wch: 15 }
    ];

    const detailedHeaderStyle = {
      font: { bold: true, size: 11, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '0B4F3C' }, patternType: 'solid' },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true }
    };

    ['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1'].forEach((cell) => {
      if (detailedSheet[cell]) detailedSheet[cell].s = detailedHeaderStyle;
    });

    for (let i = 2; i <= currentReportRows.length + 1; i++) {
      if (detailedSheet['G' + i]) {
        detailedSheet['G' + i].numFmt = '#,##0.00';
      }
    }

    XLSX.utils.book_append_sheet(wb, detailedSheet, 'Detailed Transactions');

    // Write file
    XLSX.writeFile(wb, `ktirs-ntr-report-${year}-${String(month || 'all').padStart(2, '0')}.xlsx`);
    reportStatus.textContent = 'Excel export completed successfully.';
  });
}

// PDF export stub
if (btnExportPdf) {
  btnExportPdf.addEventListener('click', () => {
    if (!currentReportRows || currentReportRows.length === 0) return;
    alert('PDF export will use the templates/report.html layout (to be implemented).');
  });
}
