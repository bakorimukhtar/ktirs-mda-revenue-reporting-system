// admin/js/mda-report.js
// MDA-specific report page (revenue sources + budgets + collected) with month/all-month support.

(() => {
  const sb = window.supabaseClient;
  if (!sb) throw new Error("window.supabaseClient missing");

  // ===== Branding (reuse same as reports) =====
  const LOGO_URL = "../assets/images/katsina-irs-logo.png";
  const BRAND_RED = [223, 38, 39];
  const BRAND_GREEN = [67, 140, 80];
  const BRAND_BLACK = [8, 6, 5];

  // ===== Elements =====
  const topbarUserName = document.getElementById("topbarUserName");
  const topbarUserInitial = document.getElementById("topbarUserInitial");

  const backBtn = document.getElementById("backToMdaDetailsBtn");
  const pageTitle = document.getElementById("pageTitle");
  const pageSubtitle = document.getElementById("pageSubtitle");

  const yearPicker = document.getElementById("yearPicker");
  const monthPicker = document.getElementById("monthPicker");
  const viewMode = document.getElementById("viewMode");
  const refreshBtn = document.getElementById("refreshBtn");

  const exportExcelBtn = document.getElementById("exportExcelBtn");
  const exportPdfBtn = document.getElementById("exportPdfBtn");

  const searchBox = document.getElementById("searchBox");
  const statusText = document.getElementById("statusText");

  const cardPeriod = document.getElementById("cardPeriod");
  const cardScope = document.getElementById("cardScope");
  const cardRows = document.getElementById("cardRows");
  const cardTotalCollected = document.getElementById("cardTotalCollected");
  const cardBudget = document.getElementById("cardBudget");
  const cardPerformance = document.getElementById("cardPerformance");

  const tableSubtitle = document.getElementById("tableSubtitle");
  const rowCount = document.getElementById("rowCount");
  const reportTableHead = document.getElementById("reportTableHead");
  const reportTableBody = document.getElementById("reportTableBody");

  // ===== Helpers =====
  function safeText(s) {
    return String(s ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[m]));
  }

  function formatNumber(n) {
    const v = Number(n || 0);
    return v.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function nowStamp() {
    return new Date().toLocaleString();
  }

  function mapMonthName(m) {
    const months = ["", "January","February","March","April","May","June","July","August","September","October","November","December"];
    return months[m] || "";
  }

  function getQueryParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
  }

  function debounce(fn, wait = 250) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  function chunkArray(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  function populateYearSelect(el) {
    const now = new Date().getFullYear();
    const years = [now - 1, now, now + 1, now + 2];
    el.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join("");
    el.value = String(now);
  }

  function setExportsEnabled(on) {
    if (exportExcelBtn) exportExcelBtn.disabled = !on;
    if (exportPdfBtn) exportPdfBtn.disabled = !on;
  }

  function setLoading(msg) {
    if (statusText) statusText.textContent = msg || "Loading…";
    if (tableSubtitle) tableSubtitle.textContent = msg || "Loading…";
    if (reportTableBody) {
      reportTableBody.innerHTML = `
        <tr class="text-slate-500">
          <td class="px-3 py-4 text-center" colspan="6">${safeText(msg || "Loading…")}</td>
        </tr>`;
    }
  }

  async function fetchAsDataURL(url) {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Logo fetch failed: ${res.status}`);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  // ===== Auth (admin OR officer assigned to this MDA) =====
  async function requireUser() {
    const { data: sessionData } = await sb.auth.getSession(); // frontend ok [web:156]
    const user = sessionData?.session?.user;
    if (!user) { window.location.href = "../index.html"; return null; }

    const { data: profile } = await sb
      .from("profiles")
      .select("full_name, global_role")
      .eq("user_id", user.id)
      .single();

    const name = (profile?.full_name || "").trim() || user.email || "User";
    if (topbarUserName) topbarUserName.textContent = name;
    if (topbarUserInitial) topbarUserInitial.textContent = name.charAt(0).toUpperCase();

    return { user, profile };
  }

  // ===== State =====
  const mdaId = Number(getQueryParam("id") || 0);
  if (!mdaId) {
    alert("Missing MDA id in URL. Open from MDA Details.");
    window.location.href = "mdas.html";
    return;
  }

  let mdaInfo = null;

  let selectedYear = new Date().getFullYear();
  let selectedMonth = null; // null => all months
  let selectedView = "both";

  let currentRows = [];   // by revenue source for this MDA
  let filteredRows = [];

  // ===== Load MDA details for header =====
  async function loadMdaHeader() {
    const { data, error } = await sb
      .from("mdas")
      .select("id, name, code, category, is_active")
      .eq("id", mdaId)
      .single();

    if (error) throw error;
    mdaInfo = data;

    const label = `${data.name} (${data.code})`;
    if (pageTitle) pageTitle.textContent = label;
    if (pageSubtitle) pageSubtitle.textContent = "Revenue by source for selected year/month (monthly summary).";
    if (cardScope) cardScope.textContent = label;
  }

  function getPeriodLabel() {
    const y = selectedYear;
    const m = selectedMonth ? mapMonthName(selectedMonth) : "All months";
    return `${y} • ${m}`;
  }

  function getViewLabel() {
    return selectedView === "collected" ? "Collected"
      : selectedView === "budget" ? "Budget"
      : "Collected + Budget";
  }

  // ===== Report generation (per revenue source for this MDA) =====
  async function generateReport() {
    selectedYear = Number(yearPicker?.value) || selectedYear;
    selectedMonth = monthPicker?.value ? Number(monthPicker.value) : null;
    selectedView = viewMode?.value || selectedView;

    setExportsEnabled(false);
    setLoading(`Loading report for ${selectedYear}…`);

    // 1) Load revenue sources (base rows so zeros show)
    const { data: sources, error: sErr } = await sb
      .from("revenue_sources")
      .select("id, name, code, is_active")
      .eq("is_active", true)
      .eq("mda_id", mdaId)
      .order("name", { ascending: true });

    if (sErr) throw sErr;

    const sourceIds = (sources || []).map(s => Number(s.id)).filter(Boolean);

    // 2) Load budgets for selected year for these sources
    const budgetBySource = new Map();
    if (sourceIds.length) {
      for (const ids of chunkArray(sourceIds, 200)) {
        const { data: buds, error: bErr } = await sb
          .from("revenue_source_budgets")
          .select("revenue_source_id, approved_budget, budget_year")
          .eq("budget_year", selectedYear)
          .in("revenue_source_id", ids);

        if (bErr) {
          console.warn("Budget load error:", bErr);
          continue;
        }

        (buds || []).forEach(b => {
          budgetBySource.set(String(b.revenue_source_id), Number(b.approved_budget || 0));
        });
      }
    }

    // 3) Load collected amounts (monthly summary table)
    let revQuery = sb
      .from("revenues")
      .select("revenue_source_id, amount")
      .eq("mda_id", mdaId)
      .eq("revenue_year", selectedYear);

    if (selectedMonth) revQuery = revQuery.eq("revenue_month", selectedMonth);

    const { data: revs, error: rErr } = await revQuery;
    if (rErr) throw rErr;

    // aggregate collected by source_id
    const collectedBySource = new Map();
    (revs || []).forEach(r => {
      const sid = String(r.revenue_source_id);
      const prev = collectedBySource.get(sid) || 0;
      collectedBySource.set(sid, prev + Number(r.amount || 0));
    });

    // 4) Build rows
    currentRows = (sources || []).map(s => {
      const sid = String(s.id);
      const budget = Number(budgetBySource.get(sid) || 0);
      const collected = Number(collectedBySource.get(sid) || 0);
      const variance = budget - collected;
      const perf = budget > 0 ? (collected / budget) * 100 : 0;

      return {
        revenue_source_id: Number(s.id),
        revenue_source: s.name || "",
        code: s.code || "",
        budget,
        collected,
        variance,
        performance: perf
      };
    });

    applySearchAndRender();

    // Cards
    const totalCollected = currentRows.reduce((sum, r) => sum + Number(r.collected || 0), 0);
    const totalBudget = currentRows.reduce((sum, r) => sum + Number(r.budget || 0), 0);
    const perf = totalBudget > 0 ? (totalCollected / totalBudget) * 100 : 0;

    if (cardPeriod) cardPeriod.textContent = getPeriodLabel();
    if (cardRows) cardRows.textContent = String(currentRows.length);
    if (cardTotalCollected) cardTotalCollected.textContent = formatNumber(totalCollected);
    if (cardBudget) cardBudget.textContent = formatNumber(totalBudget);
    if (cardPerformance) cardPerformance.textContent = `Performance: ${perf.toFixed(2)}%`;

    if (tableSubtitle) {
      tableSubtitle.textContent = `${mdaInfo?.name || "MDA"} • ${getViewLabel()} • ${getPeriodLabel()}`;
    }

    if (statusText) statusText.textContent = "Report loaded. You can now export.";
    setExportsEnabled(currentRows.length > 0);
  }

  function applySearchAndRender() {
    const q = (searchBox?.value || "").trim().toLowerCase();
    filteredRows = currentRows;

    if (q) {
      filteredRows = currentRows.filter(r => {
        const hay = `${r.revenue_source} ${r.code}`.toLowerCase();
        return hay.includes(q);
      });
    }

    renderTable(filteredRows);
    if (rowCount) rowCount.textContent = `${filteredRows.length} rows`;
  }

  function renderTable(rows) {
    const mode = selectedView;
    const showCollected = mode === "collected" || mode === "both";
    const showBudget = mode === "budget" || mode === "both";

    const head = [];
    head.push(`<th class="px-3 py-2 border-b border-slate-200">Revenue source</th>`);
    head.push(`<th class="px-3 py-2 border-b border-slate-200">Code</th>`);
    if (showBudget) head.push(`<th class="px-3 py-2 border-b border-slate-200 text-right">Approved budget</th>`);
    if (showCollected) head.push(`<th class="px-3 py-2 border-b border-slate-200 text-right">Collected</th>`);
    if (mode === "both") {
      head.push(`<th class="px-3 py-2 border-b border-slate-200 text-right">Variance</th>`);
      head.push(`<th class="px-3 py-2 border-b border-slate-200 text-right">Perf. (%)</th>`);
    }

    reportTableHead.innerHTML = `<tr>${head.join("")}</tr>`;

    if (!rows || rows.length === 0) {
      reportTableBody.innerHTML = `
        <tr class="text-slate-500">
          <td class="px-3 py-4 text-center" colspan="${head.length}">No rows match your search.</td>
        </tr>`;
      return;
    }

    reportTableBody.innerHTML = rows.map(r => {
      const cells = [];
      cells.push(`<td class="px-3 py-2 whitespace-nowrap">${safeText(r.revenue_source || "—")}</td>`);
      cells.push(`<td class="px-3 py-2 whitespace-nowrap">${safeText(r.code || "—")}</td>`);
      if (showBudget) cells.push(`<td class="px-3 py-2 text-right">${formatNumber(r.budget)}</td>`);
      if (showCollected) cells.push(`<td class="px-3 py-2 text-right">${formatNumber(r.collected)}</td>`);
      if (mode === "both") {
        cells.push(`<td class="px-3 py-2 text-right">${formatNumber(r.variance)}</td>`);
        cells.push(`<td class="px-3 py-2 text-right">${Number(r.performance || 0).toFixed(2)}</td>`);
      }
      return `<tr class="hover:bg-slate-50">${cells.join("")}</tr>`;
    }).join("");

    if (window.lucide) lucide.createIcons();
  }

  // ===== Excel export =====
  function exportExcel() {
    if (!window.XLSX) { alert("Excel library (XLSX) not loaded."); return; }
    const rowsToExport = filteredRows && filteredRows.length ? filteredRows : currentRows;
    if (!rowsToExport.length) return;

    const mode = selectedView;
    const showCollected = mode === "collected" || mode === "both";
    const showBudget = mode === "budget" || mode === "both";

    const totalCollected = rowsToExport.reduce((sum, r) => sum + Number(r.collected || 0), 0);
    const totalBudget = rowsToExport.reduce((sum, r) => sum + Number(r.budget || 0), 0);
    const perf = totalBudget > 0 ? (totalCollected / totalBudget) * 100 : 0;
    const variance = totalBudget - totalCollected;

    const meta = [
      ["KATSINA STATE INTERNAL REVENUE SERVICE (KTIRS)"],
      ["MDA REVENUE REPORTING SYSTEM (NTR)"],
      ["MDA REPORT (REVENUE BY SOURCE)"],
      ["MDA", `${mdaInfo?.name || ""} (${mdaInfo?.code || ""})`],
      ["Period", getPeriodLabel()],
      ["View", mode.toUpperCase()],
      ["Generated", nowStamp()],
      [],
      ["TOTAL APPROVED BUDGET", Number(totalBudget || 0)],
      ["TOTAL COLLECTED", Number(totalCollected || 0)],
      ...(mode === "both" ? [["TOTAL VARIANCE", Number(variance || 0)], ["TOTAL PERFORMANCE (%)", Number(perf.toFixed(2))]] : []),
      []
    ];

    const header = [
      "Revenue Source",
      "Code",
      ...(showBudget ? ["Approved Budget"] : []),
      ...(showCollected ? ["Collected"] : []),
      ...(mode === "both" ? ["Variance", "Performance (%)"] : [])
    ];

    const body = rowsToExport.map(r => ([
      r.revenue_source,
      r.code,
      ...(showBudget ? [Number(r.budget || 0)] : []),
      ...(showCollected ? [Number(r.collected || 0)] : []),
      ...(mode === "both" ? [Number(r.variance || 0), Number((r.performance || 0).toFixed(2))] : [])
    ]));

    const aoa = [...meta, header, ...body];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, "MDA Report");

    const ym = selectedMonth ? String(selectedMonth).padStart(2, "0") : "all";
    XLSX.writeFile(wb, `KTIRS_NTR_${mdaInfo?.code || "MDA"}_${selectedYear}_${ym}.xlsx`);
  }

  // ===== PDF export =====
  async function exportPdf() {
    const jspdfNS = window.jspdf;
    if (!jspdfNS?.jsPDF) { alert("PDF library not loaded."); return; }
    const rowsToExport = filteredRows && filteredRows.length ? filteredRows : currentRows;
    if (!rowsToExport.length) return;

    const mode = selectedView;
    const showCollected = mode === "collected" || mode === "both";
    const showBudget = mode === "budget" || mode === "both";

    const totalCollected = rowsToExport.reduce((sum, r) => sum + Number(r.collected || 0), 0);
    const totalBudget = rowsToExport.reduce((sum, r) => sum + Number(r.budget || 0), 0);
    const perf = totalBudget > 0 ? (totalCollected / totalBudget) * 100 : 0;
    const variance = totalBudget - totalCollected;

    const doc = new jspdfNS.jsPDF("p", "pt", "a4");
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const marginX = 40;
    const top = 32;

    let logoDataUrl = null;
    try { logoDataUrl = await fetchAsDataURL(LOGO_URL); } catch (e) { console.warn(e); }

    if (logoDataUrl) doc.addImage(logoDataUrl, "PNG", marginX, top, 62, 62);

    doc.setTextColor(...BRAND_BLACK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("KATSINA STATE INTERNAL REVENUE SERVICE", pageW / 2, top + 18, { align: "center" });

    doc.setFontSize(11);
    doc.text("MDA REVENUE REPORTING SYSTEM (NTR)", pageW / 2, top + 36, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("MDA REPORT (REVENUE BY SOURCE)", pageW / 2, top + 54, { align: "center" });

    doc.setDrawColor(...BRAND_RED);
    doc.setLineWidth(1);
    doc.line(marginX, top + 76, pageW - marginX, top + 76);

    doc.setFontSize(9);
    doc.setTextColor(60);
    doc.text(`MDA: ${mdaInfo?.name || ""} (${mdaInfo?.code || ""})`, marginX, top + 94);
    doc.text(`Period: ${getPeriodLabel()}`, marginX, top + 108);
    doc.text(`View: ${mode.toUpperCase()}`, marginX, top + 122);
    doc.text(`Generated: ${nowStamp()}`, marginX, top + 136);

    doc.setTextColor(...BRAND_BLACK);
    doc.setFont("helvetica", "bold");
    doc.text(`Total Approved Budget: ${formatNumber(totalBudget)}`, marginX, top + 156);
    doc.text(`Total Collected: ${formatNumber(totalCollected)}`, marginX, top + 170);
    if (mode === "both") {
      doc.text(`Total Variance: ${formatNumber(variance)}`, marginX, top + 184);
      doc.text(`Performance: ${perf.toFixed(2)}%`, marginX, top + 198);
    }

    const head = [[
      "Revenue Source",
      "Code",
      ...(showBudget ? ["Approved Budget"] : []),
      ...(showCollected ? ["Collected"] : []),
      ...(mode === "both" ? ["Variance", "Perf. (%)"] : [])
    ]];

    const body = rowsToExport.map(r => ([
      r.revenue_source,
      r.code,
      ...(showBudget ? [formatNumber(r.budget)] : []),
      ...(showCollected ? [formatNumber(r.collected)] : []),
      ...(mode === "both" ? [formatNumber(r.variance), Number(r.performance || 0).toFixed(2)] : [])
    ]));

    const headerColor =
      mode === "budget" ? BRAND_GREEN :
      mode === "collected" ? BRAND_RED :
      BRAND_RED;

    doc.autoTable({
      startY: top + 220,
      head,
      body,
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: headerColor, textColor: 255 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: marginX, right: marginX }
    });

    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text(`Page ${i} of ${pageCount}`, pageW / 2, pageH - 22, { align: "center" });
    }

    const ym = selectedMonth ? String(selectedMonth).padStart(2, "0") : "all";
    doc.save(`KTIRS_NTR_${mdaInfo?.code || "MDA"}_${selectedYear}_${ym}.pdf`);
  }

  // ===== Wiring =====
  function wireEvents() {
    if (backBtn) {
      backBtn.addEventListener("click", () => {
        window.location.href = `mda-details.html?id=${encodeURIComponent(String(mdaId))}`;
      });
    }

    if (refreshBtn) refreshBtn.addEventListener("click", generateReport);
    if (searchBox) searchBox.addEventListener("input", debounce(applySearchAndRender, 200));

    if (yearPicker) yearPicker.addEventListener("change", () => { selectedYear = Number(yearPicker.value) || selectedYear; });
    if (monthPicker) monthPicker.addEventListener("change", () => { selectedMonth = monthPicker.value ? Number(monthPicker.value) : null; });
    if (viewMode) viewMode.addEventListener("change", () => {
      selectedView = viewMode.value || selectedView;
      renderTable(filteredRows);
    });

    if (exportExcelBtn) exportExcelBtn.addEventListener("click", exportExcel);

    if (exportPdfBtn) {
      exportPdfBtn.addEventListener("click", async () => {
        exportPdfBtn.disabled = true;
        try { await exportPdf(); }
        finally { exportPdfBtn.disabled = false; }
      });
    }
  }

  // ===== Init =====
  (async () => {
    populateYearSelect(yearPicker);
    selectedYear = Number(yearPicker?.value) || selectedYear;

    setExportsEnabled(false);

    const ok = await requireUser();
    if (!ok) return;

    try {
      await loadMdaHeader();
      wireEvents();
      setLoading('Select year/month and click “Generate”.');
    } catch (e) {
      console.error(e);
      setLoading("Failed to load MDA header. Check console.");
    }

    if (window.lucide) lucide.createIcons();
  })();
})();
