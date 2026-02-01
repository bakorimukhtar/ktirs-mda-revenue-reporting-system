// admin/js/analytics.js
(() => {
  const sb = window.supabaseClient;
  if (!sb) throw new Error("window.supabaseClient missing");

  // Sidebar/topbar
  const sidebar = document.getElementById("sidebar");
  const sidebarToggle = document.getElementById("sidebarToggle");
  const logoutBtn = document.getElementById("logoutBtn");
  const topbarUserName = document.getElementById("topbarUserName");
  const topbarUserInitial = document.getElementById("topbarUserInitial");
  const loggedInAsBadge = document.getElementById("loggedInAsBadge");
  const currentYearBadge = document.getElementById("currentYearBadge");

  // Filters
  const yearPicker = document.getElementById("yearPicker");
  const monthPicker = document.getElementById("monthPicker");
  const rankMetric = document.getElementById("rankMetric");
  const rankN = document.getElementById("rankN");
  const btnGenerateOverall = document.getElementById("btnGenerateOverall");
  const statusText = document.getElementById("statusText");

  // KPIs
  const kpiActiveMdas = document.getElementById("kpiActiveMdas");
  const kpiTotalBudget = document.getElementById("kpiTotalBudget");
  const kpiTotalCollected = document.getElementById("kpiTotalCollected");
  const kpiPerformance = document.getElementById("kpiPerformance");

  // Highlights
  const highestMdaName = document.getElementById("highestMdaName");
  const highestMdaValue = document.getElementById("highestMdaValue");
  const lowestMdaName = document.getElementById("lowestMdaName");
  const lowestMdaValue = document.getElementById("lowestMdaValue");
  const spreadValue = document.getElementById("spreadValue");
  const spreadHint = document.getElementById("spreadHint");

  // Chart subtitles + canvases
  const overallMonthlySubtitle = document.getElementById("overallMonthlySubtitle");
  const topMdasSubtitle = document.getElementById("topMdasSubtitle");
  const bottomMdasSubtitle = document.getElementById("bottomMdasSubtitle");

  const overallMonthlyCanvas = document.getElementById("overallMonthlyChart");
  const topMdasCanvas = document.getElementById("topMdasChart");
  const bottomMdasCanvas = document.getElementById("bottomMdasChart");

  // Table
  const rankingTableBody = document.getElementById("rankingTableBody");

  // Charts
  let overallMonthlyChart = null;
  let topMdasChart = null;
  let bottomMdasChart = null;

  // Data cache
  let mdas = []; // [{id,name,code}]
  let mdaMap = new Map(); // id -> {name,code}

  // ----------------- helpers -----------------
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

  function currency(n) {
    // You can switch to ₦ formatting if you want; leaving numeric format for reliability.
    return formatNumber(n);
  }

  function getMdaLabel(mdaId) {
    const m = mdaMap.get(String(mdaId));
    if (!m) return `MDA ${mdaId}`;
    return `${m.name} (${m.code})`;
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
    if (existing) existing.destroy(); // must destroy before reusing canvas [web:246]
    return new Chart(canvas.getContext("2d"), config);
  }

  function metricLabel(metric) {
    if (metric === "performance") return "Performance (%)";
    if (metric === "variance") return "Variance (Approved - Collected)";
    return "Collected amount";
  }

  function metricValueText(metric, row) {
    if (metric === "performance") return formatPercent(row.performance);
    if (metric === "variance") return currency(row.variance);
    return currency(row.collected);
  }

  function metricRaw(metric, row) {
    if (metric === "performance") return Number(row.performance || 0);
    if (metric === "variance") return Number(row.variance || 0);
    return Number(row.collected || 0);
  }

  // ----------------- auth -----------------
  async function requireAdmin() {
    const { data: sessionData } = await sb.auth.getSession(); // ok for SPA storage-based session [web:156]
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

  // ----------------- data fetchers -----------------
  async function loadActiveMdas() {
    const { data, error } = await sb
      .from("mdas")
      .select("id, name, code, is_active")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) throw error;
    mdas = data || [];
    mdaMap = new Map(mdas.map(m => [String(m.id), { name: m.name, code: m.code }]));
    if (kpiActiveMdas) kpiActiveMdas.textContent = String(mdas.length);
  }

  async function fetchRevenues(year, month /* optional */) {
    let q = sb
      .from("revenues")
      .select("mda_id, amount, revenue_month")
      .eq("revenue_year", year);

    if (month) q = q.eq("revenue_month", month);

    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  async function fetchAllBudgetsForYear(year) {
    // Fetch budgets joined to revenue_sources to map budget -> mda_id
    // (We need mda totals, not just overall sum)
    const { data, error } = await sb
      .from("revenue_source_budgets")
      .select("approved_budget, revenue_source_id, budget_year, revenue_sources!inner(mda_id)")
      .eq("budget_year", year);

    if (error) throw error;

    // Normalize into [{mda_id, approved_budget}]
    return (data || []).map(r => ({
      mda_id: r.revenue_sources?.mda_id,
      approved_budget: Number(r.approved_budget || 0)
    })).filter(r => r.mda_id != null);
  }

  // ----------------- renderers -----------------
  function renderRankingTable(rows, limit) {
    if (!rankingTableBody) return;

    const shown = rows.slice(0, limit);
    if (!shown.length) {
      rankingTableBody.innerHTML = `<tr><td colspan="6" class="px-3 py-4 text-center text-slate-500">No data yet.</td></tr>`;
      return;
    }

    rankingTableBody.innerHTML = shown.map((r, idx) => `
      <tr class="hover:bg-slate-50">
        <td class="px-3 py-2">${idx + 1}</td>
        <td class="px-3 py-2">${safeText(getMdaLabel(r.mda_id))}</td>
        <td class="px-3 py-2 text-right">${currency(r.approved)}</td>
        <td class="px-3 py-2 text-right">${currency(r.collected)}</td>
        <td class="px-3 py-2 text-right">${currency(r.variance)}</td>
        <td class="px-3 py-2 text-right">${formatPercent(r.performance)}</td>
      </tr>
    `).join("");
  }

  function buildBarConfig(labels, values, title, colorRGBA) {
    return {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: title,
          data: values,
          backgroundColor: colorRGBA
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false } // Chart.js legend config [web:238]
        },
        scales: {
          y: {
            ticks: { callback: (v) => Number(v).toLocaleString("en-NG") }
          }
        }
      }
    };
  }

  // ----------------- main generator -----------------
  async function generateAnalytics() {
    const year = Number(yearPicker?.value) || new Date().getFullYear();
    const month = monthPicker?.value ? Number(monthPicker.value) : null;
    const metric = rankMetric?.value || "collected";
    const n = Number(rankN?.value || 10);

    if (statusText) statusText.textContent = "Loading analytics…";

    // Revenues for selected period (for ranking + KPIs)
    const revRows = await fetchRevenues(year, month);

    // Budgets for year (for approved totals and performance/variance)
    const budgetRows = await fetchAllBudgetsForYear(year);

    // Aggregate collected by MDA
    const collectedByMda = new Map();
    let totalCollected = 0;
    revRows.forEach(r => {
      const id = String(r.mda_id);
      const amt = Number(r.amount || 0);
      totalCollected += amt;
      collectedByMda.set(id, (collectedByMda.get(id) || 0) + amt);
    });

    // Aggregate approved budget by MDA
    const approvedByMda = new Map();
    let totalApproved = 0;
    budgetRows.forEach(b => {
      const id = String(b.mda_id);
      const amt = Number(b.approved_budget || 0);
      totalApproved += amt;
      approvedByMda.set(id, (approvedByMda.get(id) || 0) + amt);
    });

    // KPIs
    if (kpiTotalCollected) kpiTotalCollected.textContent = currency(totalCollected);
    if (kpiTotalBudget) kpiTotalBudget.textContent = currency(totalApproved);

    const overallPerf = totalApproved > 0 ? (totalCollected / totalApproved) * 100 : 0;
    if (kpiPerformance) kpiPerformance.textContent = formatPercent(overallPerf);

    // Build per-MDA rows (include MDAs even if no revenue rows came in)
    const rows = mdas.map(m => {
      const mda_id = String(m.id);
      const approved = Number(approvedByMda.get(mda_id) || 0);
      const collected = Number(collectedByMda.get(mda_id) || 0);
      const variance = approved - collected;
      const performance = approved > 0 ? (collected / approved) * 100 : 0;
      return { mda_id, approved, collected, variance, performance };
    });

    // Sorting rules:
    // - collected: higher is better
    // - performance: higher is better
    // - variance: smaller variance is better? User asked highest/lowest; we interpret "highest variance" meaning biggest shortfall.
    //   We'll rank variance with higher = worse (more budget left), but still allow top/bottom charts to reflect metric value.
    const sortedDesc = [...rows].sort((a, b) => metricRaw(metric, b) - metricRaw(metric, a));
    const sortedAsc = [...rows].sort((a, b) => metricRaw(metric, a) - metricRaw(metric, b));

    const highest = sortedDesc[0];
    const lowest = sortedAsc[0];

    // Highlights
    if (highestMdaName) highestMdaName.textContent = highest ? getMdaLabel(highest.mda_id) : "—";
    if (highestMdaValue) highestMdaValue.textContent = highest ? `${metricLabel(metric)}: ${metricValueText(metric, highest)}` : "—";

    if (lowestMdaName) lowestMdaName.textContent = lowest ? getMdaLabel(lowest.mda_id) : "—";
    if (lowestMdaValue) lowestMdaValue.textContent = lowest ? `${metricLabel(metric)}: ${metricValueText(metric, lowest)}` : "—";

    if (highest && lowest) {
      const spread = metricRaw(metric, highest) - metricRaw(metric, lowest);
      if (spreadValue) {
        spreadValue.textContent =
          metric === "performance" ? formatPercent(spread) : currency(spread);
      }
      if (spreadHint) {
        spreadHint.textContent = `Range by ${metricLabel(metric)} for ${month ? mapMonthName(month) : "all months"} ${year}.`;
      }
    } else {
      if (spreadValue) spreadValue.textContent = "—";
      if (spreadHint) spreadHint.textContent = "—";
    }

    // Monthly totals (always 12 months for the year)
    const revYear = await fetchRevenues(year, null);
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    const monthlyTotals = months.map(() => 0);

    revYear.forEach(r => {
      const idx = Number(r.revenue_month) - 1;
      if (idx < 0 || idx > 11) return;
      monthlyTotals[idx] += Number(r.amount || 0);
    });

    if (overallMonthlySubtitle) overallMonthlySubtitle.textContent = `All MDAs • ${year}`;
    overallMonthlyChart = upsertChart(overallMonthlyChart, overallMonthlyCanvas, {
      type: "line",
      data: {
        labels: months.map(m => mapMonthName(m).slice(0, 3)),
        datasets: [{
          label: "Total collected",
          data: monthlyTotals,
          borderColor: "#0b4f3c",
          backgroundColor: "rgba(11,79,60,0.12)",
          tension: 0.25,
          fill: true
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: "bottom" } }, // legend options [web:238]
        scales: {
          y: { ticks: { callback: (v) => Number(v).toLocaleString("en-NG") } }
        }
      }
    });

    // Top chart (metric)
    const topRows = sortedDesc.slice(0, n).reverse();
    if (topMdasSubtitle) topMdasSubtitle.textContent = `${metricLabel(metric)} • ${month ? mapMonthName(month) : "All months"} • ${year}`;

    topMdasChart = upsertChart(topMdasChart, topMdasCanvas, buildBarConfig(
      topRows.map(r => getMdaLabel(r.mda_id).slice(0, 22)),
      topRows.map(r => metricRaw(metric, r)),
      "Top MDAs",
      "rgba(22,50,79,0.80)"
    ));

    // Bottom chart (metric)
    const bottomRows = sortedAsc.slice(0, n).reverse();
    if (bottomMdasSubtitle) bottomMdasSubtitle.textContent = `${metricLabel(metric)} • ${month ? mapMonthName(month) : "All months"} • ${year}`;

    bottomMdasChart = upsertChart(bottomMdasChart, bottomMdasCanvas, buildBarConfig(
      bottomRows.map(r => getMdaLabel(r.mda_id).slice(0, 22)),
      bottomRows.map(r => metricRaw(metric, r)),
      "Bottom MDAs",
      "rgba(223,38,39,0.75)"
    ));

    // Ranking table should follow the selected metric (desc)
    renderRankingTable(sortedDesc, Math.max(10, n));

    if (statusText) statusText.textContent = "Analytics loaded.";
  }

  // ----------------- init -----------------
  (async () => {
    setupSidebar();
    populateYearSelect(yearPicker);

    const ok = await requireAdmin();
    if (!ok) return;

    try {
      await loadActiveMdas();
    } catch (e) {
      console.error(e);
      if (statusText) statusText.textContent = "Failed to load MDAs.";
    }

    if (logoutBtn) logoutBtn.addEventListener("click", logout);

    if (btnGenerateOverall) btnGenerateOverall.addEventListener("click", generateAnalytics);

    // Optional: auto-run once after load
    // await generateAnalytics();

    if (window.lucide) lucide.createIcons();
  })();
})();
