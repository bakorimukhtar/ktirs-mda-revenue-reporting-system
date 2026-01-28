// admin/js/reports.js (NTR - Revenue by Source with All MDAs + branded PDF)
// UPDATED: budgets come from revenue_source_budgets (per year), not revenue_sources
(() => {
  const sb = window.supabaseClient;
  if (!sb) throw new Error('window.supabaseClient missing');

  // ===== CONFIG (PDF branding matches your sample) =====
  const LOGO_URL = "../assets/images/katsina-irs-logo.png";

  const BRAND_RED = [223, 38, 39];   // #df2627
  const BRAND_GREEN = [67, 140, 80]; // #438c50
  const BRAND_BLACK = [8, 6, 5];     // #080605

  // ===== Elements =====
  const sidebar = document.getElementById('sidebar');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');
  const logoutBtn = document.getElementById('logoutBtn');

  const topbarUserName = document.getElementById('topbarUserName');
  const topbarUserInitial = document.getElementById('topbarUserInitial');

  const yearPicker = document.getElementById('yearPicker');
  const monthPicker = document.getElementById('monthPicker');
  const viewMode = document.getElementById('viewMode');

  const mdaFilter = document.getElementById('mdaFilter');
  const searchBox = document.getElementById('searchBox');
  const refreshBtn = document.getElementById('refreshBtn');

  const exportExcelBtn = document.getElementById('exportExcelBtn');
  const exportPdfBtn = document.getElementById('exportPdfBtn');

  const statusText = document.getElementById('statusText');
  const cardPeriod = document.getElementById('cardPeriod');
  const cardScope = document.getElementById('cardScope');
  const cardRows = document.getElementById('cardRows');
  const cardTotalCollected = document.getElementById('cardTotalCollected');
  const cardBudget = document.getElementById('cardBudget');
  const cardPerformance = document.getElementById('cardPerformance');

  const tableSubtitle = document.getElementById('tableSubtitle');
  const rowCount = document.getElementById('rowCount');
  const reportTableHead = document.getElementById('reportTableHead');
  const reportTableBody = document.getElementById('reportTableBody');

  // ===== Helpers =====
  function safeText(s) {
    return String(s ?? '').replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[m]));
  }

  // Numbers only (avoid ₦ encoding issues)
  function formatNumber(n) {
    const v = Number(n || 0);
    return v.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function nowStamp() {
    return new Date().toLocaleString();
  }

  function mapMonthName(m) {
    const months = ['', 'January','February','March','April','May','June','July','August','September','October','November','December'];
    return months[m] || '';
  }

  async function fetchAsDataURL(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Logo fetch failed: ${res.status}`);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  function debounce(fn, wait = 250) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  function setExportsEnabled(on) {
    if (exportExcelBtn) exportExcelBtn.disabled = !on;
    if (exportPdfBtn) exportPdfBtn.disabled = !on;
  }

  function setLoading(msg) {
    if (statusText) statusText.textContent = msg || 'Loading…';
    if (tableSubtitle) tableSubtitle.textContent = msg || 'Loading…';
    if (reportTableBody) {
      reportTableBody.innerHTML = `
        <tr class="text-slate-500">
          <td class="px-3 py-4 text-center" colspan="8">${safeText(msg || 'Loading…')}</td>
        </tr>`;
    }
  }

  function populateYearSelect(el) {
    const now = new Date().getFullYear();
    const years = [now - 1, now, now + 1, now + 2];
    el.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
    el.value = String(now);
  }

  // ===== State =====
  let selectedYear = new Date().getFullYear();
  let selectedMonth = null;          // null => all months
  let selectedView = 'both';         // collected | budget | both
  let selectedMda = 'all';           // 'all' or numeric as string

  let allMdas = [];
  let currentRows = [];              // full rows from report (includes zeros)
  let filteredRows = [];

  // Source budget state (from revenue_source_budgets)
  let sourceBudgetById = new Map();  // revenue_source_id -> approved_budget for selectedYear

  // ===== Auth =====
  async function requireAdmin() {
    const { data: sessionData } = await sb.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user) { window.location.href = '../index.html'; return null; }

    const { data: profile } = await sb
      .from('profiles')
      .select('full_name, global_role')
      .eq('user_id', user.id)
      .single();

    if (!profile || profile.global_role !== 'admin') {
      window.location.href = '../index.html';
      return null;
    }

    const name = (profile.full_name || '').trim() || user.email || 'Admin User';
    if (topbarUserName) topbarUserName.textContent = name;
    if (topbarUserInitial) topbarUserInitial.textContent = name.charAt(0).toUpperCase();
    return { user, profile };
  }

  // ===== Sidebar =====
  function openSidebar() {
    if (!sidebar) return;
    sidebar.classList.remove('-translate-x-full');
    if (sidebarBackdrop) sidebarBackdrop.classList.remove('hidden');
  }
  function closeSidebar() {
    if (!sidebar) return;
    sidebar.classList.add('-translate-x-full');
    if (sidebarBackdrop) sidebarBackdrop.classList.add('hidden');
  }
  function setupSidebar() {
    if (sidebarToggle) sidebarToggle.addEventListener('click', () => {
      if (sidebar.classList.contains('-translate-x-full')) openSidebar();
      else closeSidebar();
    });
    if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', closeSidebar);
    window.addEventListener('resize', () => {
      if (window.innerWidth >= 640) {
        if (sidebarBackdrop) sidebarBackdrop.classList.add('hidden');
        if (sidebar) sidebar.classList.remove('-translate-x-full');
      } else {
        if (sidebar) sidebar.classList.add('-translate-x-full');
      }
    });
  }

  async function logout() {
    await sb.auth.signOut();
    window.location.href = '../index.html';
  }

  // ===== Data loaders =====
  async function loadMdas() {
    const { data, error } = await sb
      .from('mdas')
      .select('id, name, code, is_active')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) throw error;
    allMdas = data || [];

    if (mdaFilter) {
      const opts = [
        `<option value="all">All MDAs</option>`,
        ...allMdas.map(m => `<option value="${m.id}">${safeText(m.name)} (${safeText(m.code)})</option>`)
      ];
      mdaFilter.innerHTML = opts.join('');
      mdaFilter.value = 'all';
    }
  }

  async function loadSourceBudgetsForYear(year, revenueSourceIds) {
    sourceBudgetById = new Map();
    if (!Array.isArray(revenueSourceIds) || revenueSourceIds.length === 0) return;

    // PostgREST has URL length limits; chunk to be safe
    const chunkSize = 200;
    const chunks = [];
    for (let i = 0; i < revenueSourceIds.length; i += chunkSize) {
      chunks.push(revenueSourceIds.slice(i, i + chunkSize));
    }

    for (const ids of chunks) {
      const { data, error } = await sb
        .from('revenue_source_budgets')
        .select('revenue_source_id, approved_budget, budget_year')
        .eq('budget_year', year)
        .in('revenue_source_id', ids);

      if (error) {
        console.warn('Budget load error:', error);
        continue;
      }

      (data || []).forEach(b => {
        sourceBudgetById.set(String(b.revenue_source_id), Number(b.approved_budget || 0));
      });
    }
  }

  function getMdaLabel(mdaValue) {
    if (mdaValue === 'all') return 'All MDAs';
    const m = allMdas.find(x => String(x.id) === String(mdaValue));
    return m ? `${m.name} (${m.code})` : `MDA ${mdaValue}`;
  }

  function getPeriodLabel() {
    const y = selectedYear;
    const m = selectedMonth ? mapMonthName(selectedMonth) : 'All months';
    return `${y} • ${m}`;
  }

  function getViewLabel() {
    return selectedView === 'collected' ? 'Collected'
      : selectedView === 'budget' ? 'Budget'
      : 'Collected + Budget';
  }

  // ===== Report generation =====
  async function generateReport() {
    selectedYear = Number(yearPicker?.value) || selectedYear;
    selectedMonth = monthPicker?.value ? Number(monthPicker.value) : null;
    selectedView = viewMode?.value || selectedView;
    selectedMda = mdaFilter?.value || 'all';

    if (!selectedYear) {
      if (statusText) statusText.textContent = 'Please select a year.';
      return;
    }

    setExportsEnabled(false);
    setLoading(`Loading report for ${selectedYear}…`);

    // 1) Load revenue sources (base rows to keep zeros)
    let sourcesQuery = sb
      .from('revenue_sources')
      .select(`
        id,
        mda_id,
        name,
        code,
        is_active,
        mdas ( id, name, code )
      `)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (selectedMda !== 'all') sourcesQuery = sourcesQuery.eq('mda_id', Number(selectedMda));

    const { data: sources, error: sErr } = await sourcesQuery;
    if (sErr) {
      console.error(sErr);
      setLoading('Failed to load revenue sources.');
      return;
    }

    const sourceIds = (sources || []).map(s => Number(s.id)).filter(Boolean);

    // 2) Load budgets for selected year (per revenue source)
    await loadSourceBudgetsForYear(selectedYear, sourceIds);

    // 3) Load revenues filtered by year/month/(mda)
    // NOTE: This aggregates across HQ + all branches (if branches exist).
    let revQuery = sb
      .from('revenues')
      .select('mda_id, revenue_source_id, amount')
      .eq('revenue_year', selectedYear);

    if (selectedMonth) revQuery = revQuery.eq('revenue_month', selectedMonth);
    if (selectedMda !== 'all') revQuery = revQuery.eq('mda_id', Number(selectedMda));

    const { data: revs, error: rErr } = await revQuery;
    if (rErr) {
      console.error(rErr);
      setLoading('Failed to load revenues.');
      return;
    }

    // 4) Aggregate revenues
    // key: for All MDAs => `${mda_id}:${source_id}`; for single => `${source_id}`
    const totals = new Map(); // key -> { total, count }
    (revs || []).forEach(r => {
      const mdaId = String(r.mda_id);
      const sid = String(r.revenue_source_id);
      const key = (selectedMda === 'all') ? `${mdaId}:${sid}` : sid;

      const prev = totals.get(key) || { total: 0, count: 0 };
      prev.total += Number(r.amount || 0);
      prev.count += 1;
      totals.set(key, prev);
    });

    // 5) Build rows (left join effect)
    currentRows = (sources || []).map(s => {
      const mdaId = String(s.mda_id);
      const sid = String(s.id);
      const key = (selectedMda === 'all') ? `${mdaId}:${sid}` : sid;

      const agg = totals.get(key) || { total: 0, count: 0 };

      // Budget is now from revenue_source_budgets per year
      const sourceBudget = Number(sourceBudgetById.get(sid) || 0);

      const variance = sourceBudget - agg.total;
      const perf = sourceBudget > 0 ? (agg.total / sourceBudget) * 100 : 0;

      return {
        mda_id: Number(s.mda_id),
        mda_name: s.mdas?.name || '',
        mda_code: s.mdas?.code || '',
        revenue_source: s.name,
        code: s.code,
        record_count: agg.count,
        collected: agg.total,
        budget: sourceBudget,
        variance,
        performance: perf
      };
    });

    // Default sort
    currentRows.sort((a, b) => {
      if (selectedMda === 'all') {
        const m = `${a.mda_name}`.localeCompare(`${b.mda_name}`);
        if (m !== 0) return m;
      }
      return `${a.revenue_source}`.localeCompare(`${b.revenue_source}`);
    });

    applySearchAndRender();

    // Cards + subtitles
    const totalCollected = currentRows.reduce((sum, r) => sum + Number(r.collected || 0), 0);
    const totalBudget = currentRows.reduce((sum, r) => sum + Number(r.budget || 0), 0);
    const perf = totalBudget > 0 ? (totalCollected / totalBudget) * 100 : 0;

    if (cardPeriod) cardPeriod.textContent = getPeriodLabel();
    if (cardScope) cardScope.textContent = getMdaLabel(selectedMda);
    if (cardRows) cardRows.textContent = String(currentRows.length);
    if (cardTotalCollected) cardTotalCollected.textContent = formatNumber(totalCollected);
    if (cardBudget) cardBudget.textContent = formatNumber(totalBudget);
    if (cardPerformance) cardPerformance.textContent = `Performance: ${perf.toFixed(2)}%`;

    if (tableSubtitle) {
      tableSubtitle.textContent = `${getMdaLabel(selectedMda)} • ${getViewLabel()} • ${getPeriodLabel()}`;
    }

    if (statusText) statusText.textContent = 'Report loaded. You can now export.';
    setExportsEnabled(currentRows.length > 0);
  }

  function applySearchAndRender() {
    const q = (searchBox?.value || '').trim().toLowerCase();
    filteredRows = currentRows;

    if (q) {
      filteredRows = currentRows.filter(r => {
        const hay = `${r.mda_name} ${r.mda_code} ${r.revenue_source} ${r.code}`.toLowerCase();
        return hay.includes(q);
      });
    }

    renderTable(filteredRows);
    if (rowCount) rowCount.textContent = `${filteredRows.length} rows`;
  }

  function renderTable(rows) {
    const showMda = (selectedMda === 'all');
    const mode = selectedView;

    const showCollected = mode === 'collected' || mode === 'both';
    const showBudget = mode === 'budget' || mode === 'both';

    const head = [];
    if (showMda) head.push(`<th class="px-3 py-2 border-b border-slate-200">MDA</th>`);
    head.push(`<th class="px-3 py-2 border-b border-slate-200">Revenue source</th>`);
    head.push(`<th class="px-3 py-2 border-b border-slate-200">Code</th>`);
    head.push(`<th class="px-3 py-2 border-b border-slate-200 text-right">Records</th>`);
    if (showBudget) head.push(`<th class="px-3 py-2 border-b border-slate-200 text-right">Budget</th>`);
    if (showCollected) head.push(`<th class="px-3 py-2 border-b border-slate-200 text-right">Collected</th>`);
    if (mode === 'both') {
      head.push(`<th class="px-3 py-2 border-b border-slate-200 text-right">Variance</th>`);
      head.push(`<th class="px-3 py-2 border-b border-slate-200 text-right">Perf. (%)</th>`);
    }

    reportTableHead.innerHTML = `<tr>${head.join('')}</tr>`;

    if (!rows || rows.length === 0) {
      reportTableBody.innerHTML = `
        <tr class="text-slate-500">
          <td class="px-3 py-4 text-center" colspan="${head.length}">No rows match your search.</td>
        </tr>`;
      return;
    }

    const bodyHtml = rows.map(r => {
      const cells = [];

      if (showMda) {
        const mdaLabel = (r.mda_name ? `${r.mda_name} (${r.mda_code})` : `MDA ${r.mda_id}`);
        cells.push(`<td class="px-3 py-2 whitespace-nowrap">${safeText(mdaLabel)}</td>`);
      }

      cells.push(`<td class="px-3 py-2 whitespace-nowrap">${safeText(r.revenue_source || '—')}</td>`);
      cells.push(`<td class="px-3 py-2 whitespace-nowrap">${safeText(r.code || '—')}</td>`);
      cells.push(`<td class="px-3 py-2 text-right">${Number(r.record_count || 0).toLocaleString('en-NG')}</td>`);

      if (showBudget) cells.push(`<td class="px-3 py-2 text-right">${formatNumber(r.budget)}</td>`);
      if (showCollected) cells.push(`<td class="px-3 py-2 text-right">${formatNumber(r.collected)}</td>`);

      if (mode === 'both') {
        cells.push(`<td class="px-3 py-2 text-right">${formatNumber(r.variance)}</td>`);
        cells.push(`<td class="px-3 py-2 text-right">${Number(r.performance || 0).toFixed(2)}</td>`);
      }

      return `<tr class="hover:bg-slate-50">${cells.join('')}</tr>`;
    }).join('');

    reportTableBody.innerHTML = bodyHtml;
    if (window.lucide) lucide.createIcons();
  }

  // ===== Excel export =====
  function exportExcel() {
    if (!window.XLSX) { alert('Excel library (XLSX) not loaded.'); return; }
    if (!currentRows.length) return;

    const showMda = (selectedMda === 'all');
    const mode = selectedView;
    const showCollected = mode === 'collected' || mode === 'both';
    const showBudget = mode === 'budget' || mode === 'both';

    const meta = [
      ['KATSINA STATE INTERNAL REVENUE SERVICE (KTIRS)'],
      ['MDA REVENUE REPORTING SYSTEM (NTR)'],
      ['REVENUE BY SOURCE REPORT'],
      ['Scope', getMdaLabel(selectedMda)],
      ['Period', getPeriodLabel()],
      ['View', mode.toUpperCase()],
      ['Generated', nowStamp()],
      []
    ];

    const header = [
      ...(showMda ? ['MDA'] : []),
      'Revenue Source',
      'Code',
      'Records',
      ...(showBudget ? ['Budget'] : []),
      ...(showCollected ? ['Collected'] : []),
      ...(mode === 'both' ? ['Variance', 'Performance (%)'] : [])
    ];

    const rows = currentRows.map(r => ([
      ...(showMda ? [`${r.mda_name} (${r.mda_code})`] : []),
      r.revenue_source,
      r.code,
      Number(r.record_count || 0),
      ...(showBudget ? [Number(r.budget || 0)] : []),
      ...(showCollected ? [Number(r.collected || 0)] : []),
      ...(mode === 'both' ? [Number(r.variance || 0), Number((r.performance || 0).toFixed(2))] : [])
    ]));

    const aoa = [...meta, header, ...rows];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, 'Revenue by Source');

    const ym = selectedMonth ? String(selectedMonth).padStart(2, '0') : 'all';
    XLSX.writeFile(wb, `KTIRS_NTR_RevenueBySource_${selectedYear}_${ym}.xlsx`);
  }

  // ===== PDF export (branding same style) =====
  async function exportPdf() {
    const jspdfNS = window.jspdf;
    if (!jspdfNS?.jsPDF) { alert('PDF library not loaded.'); return; }
    if (!currentRows.length) return;

    const showMda = (selectedMda === 'all');
    const mode = selectedView;
    const showCollected = mode === 'collected' || mode === 'both';
    const showBudget = mode === 'budget' || mode === 'both';

    const doc = new jspdfNS.jsPDF('p', 'pt', 'a4');
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const marginX = 40;

    let logoDataUrl = null;
    try { logoDataUrl = await fetchAsDataURL(LOGO_URL); } catch (e) { console.warn(e); }

    const top = 32;

    // Header
    if (logoDataUrl) doc.addImage(logoDataUrl, 'PNG', marginX, top, 62, 62);

    doc.setTextColor(...BRAND_BLACK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('KATSINA STATE INTERNAL REVENUE SERVICE', pageW / 2, top + 18, { align: 'center' });

    doc.setFontSize(11);
    doc.text('MDA REVENUE REPORTING SYSTEM (NTR)', pageW / 2, top + 36, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('REVENUE BY SOURCE REPORT', pageW / 2, top + 54, { align: 'center' });

    doc.setDrawColor(...BRAND_RED);
    doc.setLineWidth(1);
    doc.line(marginX, top + 76, pageW - marginX, top + 76);

    doc.setFontSize(9);
    doc.setTextColor(60);
    doc.text(`Scope: ${getMdaLabel(selectedMda)}`, marginX, top + 94);
    doc.text(`Period: ${getPeriodLabel()}`, marginX, top + 108);
    doc.text(`View: ${mode.toUpperCase()}`, marginX, top + 122);
    doc.text(`Generated: ${nowStamp()}`, marginX, top + 136);

    // Build columns
    const head = [[
      ...(showMda ? ['MDA'] : []),
      'Revenue Source',
      'Code',
      'Records',
      ...(showBudget ? ['Budget'] : []),
      ...(showCollected ? ['Collected'] : []),
      ...(mode === 'both' ? ['Variance', 'Perf. (%)'] : [])
    ]];

    const body = currentRows.map(r => ([
      ...(showMda ? [`${r.mda_name} (${r.mda_code})`] : []),
      r.revenue_source,
      r.code,
      String(Number(r.record_count || 0)),
      ...(showBudget ? [formatNumber(r.budget)] : []),
      ...(showCollected ? [formatNumber(r.collected)] : []),
      ...(mode === 'both' ? [formatNumber(r.variance), Number(r.performance || 0).toFixed(2)] : [])
    ]));

    const headerColor =
      mode === 'budget' ? BRAND_GREEN :
      mode === 'collected' ? BRAND_RED :
      BRAND_RED;

    doc.autoTable({
      startY: top + 160,
      head,
      body,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: headerColor, textColor: 255 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: marginX, right: marginX }
    });

    // Footer page numbers
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text(`Page ${i} of ${pageCount}`, pageW / 2, pageH - 22, { align: 'center' });
    }

    const ym = selectedMonth ? String(selectedMonth).padStart(2, '0') : 'all';
    doc.save(`KTIRS_NTR_RevenueBySource_${selectedYear}_${ym}.pdf`);
  }

  // ===== Events =====
  function wireEvents() {
    if (logoutBtn) logoutBtn.addEventListener('click', logout);

    if (yearPicker) yearPicker.addEventListener('change', () => { selectedYear = Number(yearPicker.value) || selectedYear; });
    if (monthPicker) monthPicker.addEventListener('change', () => { selectedMonth = monthPicker.value ? Number(monthPicker.value) : null; });
    if (viewMode) viewMode.addEventListener('change', () => {
      selectedView = viewMode.value || selectedView;
      renderTable(filteredRows);
    });

    if (mdaFilter) mdaFilter.addEventListener('change', () => { selectedMda = mdaFilter.value || 'all'; });

    if (searchBox) searchBox.addEventListener('input', debounce(() => applySearchAndRender(), 200));

    if (refreshBtn) refreshBtn.addEventListener('click', generateReport);

    if (exportExcelBtn) exportExcelBtn.addEventListener('click', exportExcel);

    if (exportPdfBtn) {
      exportPdfBtn.addEventListener('click', async () => {
        exportPdfBtn.disabled = true;
        try { await exportPdf(); }
        finally { exportPdfBtn.disabled = false; }
      });
    }
  }

  // ===== Init =====
  (async () => {
    setupSidebar();
    populateYearSelect(yearPicker);

    selectedYear = Number(yearPicker?.value) || selectedYear;
    selectedMonth = monthPicker?.value ? Number(monthPicker.value) : null;
    selectedView = viewMode?.value || selectedView;

    setExportsEnabled(false);

    const ok = await requireAdmin();
    if (!ok) return;

    try {
      await loadMdas();
      setLoading('Select Year and click “Generate”.');
      wireEvents();
    } catch (e) {
      console.error(e);
      setLoading('Failed to initialize report. Check console for details.');
    }

    if (window.lucide) lucide.createIcons();
  })();
})();
