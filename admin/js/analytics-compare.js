// admin/js/analytics-compare.js
(() => {
  const sb = window.supabaseClient;
  if (!sb) throw new Error("window.supabaseClient missing");

  // Topbar/sidebar
  const sidebar = document.getElementById("sidebar");
  const sidebarToggle = document.getElementById("sidebarToggle");
  const logoutBtn = document.getElementById("logoutBtn");

  const topbarUserName = document.getElementById("topbarUserName");
  const topbarUserInitial = document.getElementById("topbarUserInitial");
  const loggedInAsBadge = document.getElementById("loggedInAsBadge");
  const currentYearBadge = document.getElementById("currentYearBadge");

  // Filters
  const yearPicker = document.getElementById("yearPicker");
  const mdaA = document.getElementById("mdaA");
  const mdaB = document.getElementById("mdaB");
  const topN = document.getElementById("topN");
  const btnGenerate = document.getElementById("btnGenerate");
  const statusText = document.getElementById("statusText");

  // A summary fields
  const mdaASubtitle = document.getElementById("mdaASubtitle");
  const aApproved = document.getElementById("aApproved");
  const aCollected = document.getElementById("aCollected");
  const aVariance = document.getElementById("aVariance");
  const aPerf = document.getElementById("aPerf");
  const aHighMonth = document.getElementById("aHighMonth");
  const aHighMonthValue = document.getElementById("aHighMonthValue");
  const aLowMonth = document.getElementById("aLowMonth");
  const aLowMonthValue = document.getElementById("aLowMonthValue");

  // B summary fields
  const mdaBSubtitle = document.getElementById("mdaBSubtitle");
  const bApproved = document.getElementById("bApproved");
  const bCollected = document.getElementById("bCollected");
  const bVariance = document.getElementById("bVariance");
  const bPerf = document.getElementById("bPerf");
  const bHighMonth = document.getElementById("bHighMonth");
  const bHighMonthValue = document.getElementById("bHighMonthValue");
  const bLowMonth = document.getElementById("bLowMonth");
  const bLowMonthValue = document.getElementById("bLowMonthValue");

  // Chart subtitles
  const monthlyCompareSubtitle = document.getElementById("monthlyCompareSubtitle");
  const monthlyPerfSubtitle = document.getElementById("monthlyPerfSubtitle");
  const topSourcesASubtitle = document.getElementById("topSourcesASubtitle");
  const topSourcesBSubtitle = document.getElementById("topSourcesBSubtitle");

  // Canvases
  const monthlyCompareCanvas = document.getElementById("monthlyCompareChart");
  const monthlyPerfCanvas = document.getElementById("monthlyPerfChart");
  const topSourcesACanvas = document.getElementById("topSourcesAChart");
  const topSourcesBCanvas = document.getElementById("topSourcesBChart");

  // Table
  const monthlyTableBody = document.getElementById("monthlyTableBody");

  // State
  let allMdas = [];
  let mdaMap = new Map();

  let chartMonthly = null;
  let chartPerf = null;
  let chartTopA = null;
  let chartTopB = null;

  function safeText(s) {
    return String(s ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[m]));
  }

  function formatNumber(n) {
    const v = Number(n || 0);
    return v.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatPercent(n) {
    const v = Number(n || 0);
    return `${v.toFixed(2)}%`;
  }

  function mapMonthName(m) {
    const months = ["", "January","February","March","April","May","June","July","August","September","October","November","December"];
    return months[m] || "";
  }

  function populateYearSelect(el) {
    const now = new Date().getFullYear();
    const years = [now - 1, now, now + 1, now + 2];
    el.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join("");
    el.value = String(now);
    if (currentYearBadge) currentYearBadge.textContent = String(now);
  }

  function setupSidebar() {
    if (!sidebarToggle) return;
    sidebarToggle.addEventListener("click", () => {
      if (sidebar.classList.contains("-translate-x-full")) sidebar.classList.remove("-translate-x-full");
      else sidebar.classList.add("-translate-x-full");
    });
    window.addEventListener("resize", () => {
      if (window.innerWidth >= 640) sidebar.classList.remove("-translate-x-full");
      else sidebar.classList.add("-translate-x-full");
    });
  }

  function upsertChart(existing, canvas, config) {
    if (!canvas) return null;
    if (existing) existing.destroy(); // Chart.js API [web:246]
    return new Chart(canvas.getContext("2d"), config);
  }

  async function requireAdmin() {
    const { data: sessionData } = await sb.auth.getSession(); // Supabase JS [web:156]
    const user = sessionData?.session?.user;
    if (!user) { window.location.href = "../index.html"; return null; }

    const { data: profile } = await sb
      .from("profiles")
      .select("full_name, global_role")
      .eq("user_id", user.id)
      .single();

    if (!profile || profile.global_role !== "admin") {
      window.location.href = "../index.html";
      return null;
    }

    const name = (profile.full_name || "").trim() || user.email || "Admin User";
    if (topbarUserName) topbarUserName.textContent = name;
    if (topbarUserInitial) topbarUserInitial.textContent = name.charAt(0).toUpperCase();
    if (loggedInAsBadge) loggedInAsBadge.textContent = "Admin (KTIRS HQ)";
    return { user, profile };
  }

  async function logout() {
    await sb.auth.signOut();
    window.location.href = "../index.html";
  }

  async function loadMdas() {
    const { data, error } = await sb
      .from("mdas")
      .select("id, name, code, is_active")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) throw error;
    allMdas = data || [];
    mdaMap = new Map(allMdas.map(m => [String(m.id), m]));

    const opts = allMdas.map(m => `<option value="${m.id}">${safeText(m.name)} (${safeText(m.code)})</option>`).join("");
    mdaA.innerHTML = opts;
    mdaB.innerHTML = opts;

    if (allMdas[0]) mdaA.value = String(allMdas[0].id);
    if (allMdas[1]) mdaB.value = String(allMdas[1].id);
  }

  function getMdaLabel(id) {
    const m = mdaMap.get(String(id));
    return m ? `${m.name} (${m.code})` : `MDA ${id}`;
  }

  async function fetchRevenuesForYear(year, mdaIds) {
    const { data, error } = await sb
      .from("revenues")
      .select("mda_id, revenue_source_id, amount, revenue_month")
      .eq("revenue_year", year)
      .in("mda_id", mdaIds);

    if (error) throw error;
    return data || [];
  }

  async function fetchAnnualApprovedBudgetForMda(year, mdaId) {
    const { data, error } = await sb
      .from("revenue_source_budgets")
      .select("approved_budget, budget_year, revenue_sources!inner(mda_id)")
      .eq("budget_year", year)
      .eq("revenue_sources.mda_id", Number(mdaId));

    if (error) throw error;
    const total = (data || []).reduce((sum, r) => sum + Number(r.approved_budget || 0), 0);
    return total;
  }

  async function fetchTopSourcesForMda(year, mdaId, topLimit) {
    // Pull all revenues for that MDA/year then aggregate by revenue_source_id client-side
    const { data: revs, error: rErr } = await sb
      .from("revenues")
      .select("revenue_source_id, amount")
      .eq("revenue_year", year)
      .eq("mda_id", Number(mdaId));

    if (rErr) throw rErr;

    const sumBySource = new Map();
    (revs || []).forEach(r => {
      const sid = String(r.revenue_source_id);
      sumBySource.set(sid, (sumBySource.get(sid) || 0) + Number(r.amount || 0));
    });

    const sourceIds = Array.from(sumBySource.keys()).map(x => Number(x)).filter(Boolean);
    let sourceMap = new Map();

    if (sourceIds.length) {
      const { data: sources, error: sErr } = await sb
        .from("revenue_sources")
        .select("id, name, code")
        .in("id", sourceIds);

      if (sErr) throw sErr;
      sourceMap = new Map((sources || []).map(s => [String(s.id), s]));
    }

    const rows = Array.from(sumBySource.entries())
      .map(([sid, collected]) => {
        const s = sourceMap.get(String(sid));
        return {
          name: s?.name || `Source ${sid}`,
          code: s?.code || "",
          collected: Number(collected || 0)
        };
      })
      .sort((a, b) => b.collected - a.collected)
      .slice(0, topLimit);

    return rows;
  }

  function highestLowestMonth(series) {
    // series is [12] numbers
    const pairs = series.map((v, idx) => ({ month: idx + 1, value: Number(v || 0) }));
    const sorted = [...pairs].sort((a, b) => b.value - a.value);
    return { high: sorted[0], low: sorted[sorted.length - 1] };
  }

  function renderMonthlyTable(monthlyA, monthlyB, monthlyApprovedA, monthlyApprovedB) {
    if (!monthlyTableBody) return;

    const rows = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const aCol = Number(monthlyA[i] || 0);
      const bCol = Number(monthlyB[i] || 0);

      const aVar = monthlyApprovedA - aCol;
      const bVar = monthlyApprovedB - bCol;

      const aPerf = monthlyApprovedA > 0 ? (aCol / monthlyApprovedA) * 100 : 0;
      const bPerf = monthlyApprovedB > 0 ? (bCol / monthlyApprovedB) * 100 : 0;

      return `
        <tr class="hover:bg-slate-50">
          <td class="px-3 py-2">${safeText(mapMonthName(m))}</td>
          <td class="px-3 py-2 text-right">${formatNumber(aCol)}</td>
          <td class="px-3 py-2 text-right">${formatNumber(aVar)}</td>
          <td class="px-3 py-2 text-right">${formatPercent(aPerf)}</td>
          <td class="px-3 py-2 text-right">${formatNumber(bCol)}</td>
          <td class="px-3 py-2 text-right">${formatNumber(bVar)}</td>
          <td class="px-3 py-2 text-right">${formatPercent(bPerf)}</td>
        </tr>
      `;
    });

    monthlyTableBody.innerHTML = rows.join("");
  }

  async function generate() {
    const year = Number(yearPicker.value) || new Date().getFullYear();
    const aId = Number(mdaA.value);
    const bId = Number(mdaB.value);
    const limit = Number(topN.value || 10);

    if (!aId || !bId) return;
    if (String(aId) === String(bId)) {
      if (statusText) statusText.textContent = "Please select two different MDAs.";
      return;
    }

    if (statusText) statusText.textContent = "Generating comparison report…";

    const aLabel = getMdaLabel(aId);
    const bLabel = getMdaLabel(bId);

    if (mdaASubtitle) mdaASubtitle.textContent = `${aLabel} • ${year}`;
    if (mdaBSubtitle) mdaBSubtitle.textContent = `${bLabel} • ${year}`;

    // Pull revenues for both MDAs for the year
    const revs = await fetchRevenuesForYear(year, [aId, bId]);

    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    const monthlyA = months.map(() => 0);
    const monthlyB = months.map(() => 0);

    let totalA = 0;
    let totalB = 0;

    revs.forEach(r => {
      const idx = Number(r.revenue_month) - 1;
      if (idx < 0 || idx > 11) return;
      const amt = Number(r.amount || 0);

      if (Number(r.mda_id) === aId) { monthlyA[idx] += amt; totalA += amt; }
      if (Number(r.mda_id) === bId) { monthlyB[idx] += amt; totalB += amt; }
    });

    // Annual budgets
    const [approvedA, approvedB] = await Promise.all([
      fetchAnnualApprovedBudgetForMda(year, aId),
      fetchAnnualApprovedBudgetForMda(year, bId)
    ]);

    const varianceA = approvedA - totalA;
    const varianceB = approvedB - totalB;
    const perfA = approvedA > 0 ? (totalA / approvedA) * 100 : 0;
    const perfB = approvedB > 0 ? (totalB / approvedB) * 100 : 0;

    // Update KPI fields
    aApproved.textContent = formatNumber(approvedA);
    aCollected.textContent = formatNumber(totalA);
    aVariance.textContent = formatNumber(varianceA);
    aPerf.textContent = formatPercent(perfA);

    bApproved.textContent = formatNumber(approvedB);
    bCollected.textContent = formatNumber(totalB);
    bVariance.textContent = formatNumber(varianceB);
    bPerf.textContent = formatPercent(perfB);

    // Highest/lowest month (collected)
    const aHL = highestLowestMonth(monthlyA);
    const bHL = highestLowestMonth(monthlyB);

    aHighMonth.textContent = mapMonthName(aHL.high.month);
    aHighMonthValue.textContent = `Collected: ${formatNumber(aHL.high.value)}`;

    aLowMonth.textContent = mapMonthName(aHL.low.month);
    aLowMonthValue.textContent = `Collected: ${formatNumber(aHL.low.value)}`;

    bHighMonth.textContent = mapMonthName(bHL.high.month);
    bHighMonthValue.textContent = `Collected: ${formatNumber(bHL.high.value)}`;

    bLowMonth.textContent = mapMonthName(bHL.low.month);
    bLowMonthValue.textContent = `Collected: ${formatNumber(bHL.low.value)}`;

    // Monthly performance series using (annual approved / 12)
    const monthlyApprovedA = approvedA / 12;
    const monthlyApprovedB = approvedB / 12;

    const perfSeriesA = monthlyA.map(v => monthlyApprovedA > 0 ? (v / monthlyApprovedA) * 100 : 0);
    const perfSeriesB = monthlyB.map(v => monthlyApprovedB > 0 ? (v / monthlyApprovedB) * 100 : 0);

    // Render charts
    if (monthlyCompareSubtitle) monthlyCompareSubtitle.textContent = `${aLabel} vs ${bLabel} • ${year}`;
    chartMonthly = upsertChart(chartMonthly, monthlyCompareCanvas, {
      type: "line",
      data: {
        labels: months.map(m => mapMonthName(m).slice(0, 3)),
        datasets: [
          {
            label: aLabel,
            data: monthlyA,
            borderColor: "#0b4f3c",
            backgroundColor: "rgba(11,79,60,0.12)",
            tension: 0.25,
            fill: true
          },
          {
            label: bLabel,
            data: monthlyB,
            borderColor: "#16324f",
            backgroundColor: "rgba(22,50,79,0.10)",
            tension: 0.25,
            fill: true
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: "bottom" }
        },
        scales: {
          y: { ticks: { callback: (v) => Number(v).toLocaleString("en-NG") } }
        }
      }
    });

    if (monthlyPerfSubtitle) monthlyPerfSubtitle.textContent = `${aLabel} vs ${bLabel} • ${year} (monthly budget = annual/12)`;
    chartPerf = upsertChart(chartPerf, monthlyPerfCanvas, {
      type: "line",
      data: {
        labels: months.map(m => mapMonthName(m).slice(0, 3)),
        datasets: [
          {
            label: `${aLabel} Perf (%)`,
            data: perfSeriesA,
            borderColor: "#0b4f3c",
            backgroundColor: "rgba(11,79,60,0.10)",
            tension: 0.25,
            fill: true
          },
          {
            label: `${bLabel} Perf (%)`,
            data: perfSeriesB,
            borderColor: "#16324f",
            backgroundColor: "rgba(22,50,79,0.08)",
            tension: 0.25,
            fill: true
          }
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: "bottom" } },
        scales: { y: { ticks: { callback: (v) => `${Number(v).toFixed(0)}%` } } }
      }
    });

    // Top sources (each MDA)
    const [topA, topB] = await Promise.all([
      fetchTopSourcesForMda(year, aId, limit),
      fetchTopSourcesForMda(year, bId, limit)
    ]);

    if (topSourcesASubtitle) topSourcesASubtitle.textContent = `${aLabel} • Top ${limit} • ${year}`;
    chartTopA = upsertChart(chartTopA, topSourcesACanvas, {
      type: "bar",
      data: {
        labels: topA.slice().reverse().map(r => (r.code ? r.code : r.name).slice(0, 18)),
        datasets: [{
          label: "Collected",
          data: topA.slice().reverse().map(r => r.collected),
          backgroundColor: "rgba(11,79,60,0.75)"
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { ticks: { callback: (v) => Number(v).toLocaleString("en-NG") } } }
      }
    });

    if (topSourcesBSubtitle) topSourcesBSubtitle.textContent = `${bLabel} • Top ${limit} • ${year}`;
    chartTopB = upsertChart(chartTopB, topSourcesBCanvas, {
      type: "bar",
      data: {
        labels: topB.slice().reverse().map(r => (r.code ? r.code : r.name).slice(0, 18)),
        datasets: [{
          label: "Collected",
          data: topB.slice().reverse().map(r => r.collected),
          backgroundColor: "rgba(22,50,79,0.75)"
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { ticks: { callback: (v) => Number(v).toLocaleString("en-NG") } } }
      }
    });

    // Table
    renderMonthlyTable(monthlyA, monthlyB, monthlyApprovedA, monthlyApprovedB);

    if (statusText) statusText.textContent = "Comparison report generated.";
  }

  // init
  (async () => {
    setupSidebar();
    populateYearSelect(yearPicker);

    const ok = await requireAdmin();
    if (!ok) return;

    await loadMdas();

    if (logoutBtn) logoutBtn.addEventListener("click", logout);
    if (btnGenerate) btnGenerate.addEventListener("click", generate);

    if (window.lucide) lucide.createIcons();
  })();
})();
