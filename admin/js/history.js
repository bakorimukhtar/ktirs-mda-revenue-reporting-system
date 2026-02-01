// admin/js/history.js
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
  const searchInput = document.getElementById("searchInput");
  const yearFilter = document.getElementById("yearFilter");
  const monthFilter = document.getElementById("monthFilter");
  const mdaFilter = document.getElementById("mdaFilter");
  const sortBy = document.getElementById("sortBy");
  const sortDir = document.getElementById("sortDir");
  const pageSizeEl = document.getElementById("pageSize");
  const btnApply = document.getElementById("btnApply");
  const btnReset = document.getElementById("btnReset");

  // Table/pagination
  const historyBody = document.getElementById("historyBody");
  const statusText = document.getElementById("statusText");
  const totalCountEl = document.getElementById("totalCount");

  const btnPrev = document.getElementById("btnPrev");
  const btnNext = document.getElementById("btnNext");
  const pageNumber = document.getElementById("pageNumber");
  const pageTotal = document.getElementById("pageTotal");
  const pageBadge = document.getElementById("pageBadge");
  const rangeText = document.getElementById("rangeText");

  // Local cache
  let mdas = [];
  let mdaMap = new Map();
  let sourceMap = new Map();
  let profileMap = new Map();

  // Pagination state
  let page = 1;
  let totalCount = 0;

  function safeText(s) {
    return String(s ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[m]));
  }

  function formatNumber(n) {
    const v = Number(n || 0);
    return v.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtDate(d) {
    if (!d) return "—";
    try { return new Date(d).toLocaleString("en-GB"); } catch { return String(d); }
  }

  function populateYearSelect(el) {
    const now = new Date().getFullYear();
    const years = [now - 1, now, now + 1, now + 2];
    el.innerHTML = `<option value="">All</option>` + years.map(y => `<option value="${y}">${y}</option>`).join("");
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

  async function requireAdmin() {
    // Use getUser for verified user (recommended) [web:156]
    const { data: userData } = await sb.auth.getUser();
    const user = userData?.user;
    if (!user) { window.location.href = "../index.html"; return null; }

    const { data: profile } = await sb
      .from("profiles")
      .select("full_name, email, global_role")
      .eq("user_id", user.id)
      .single();

    if (!profile || profile.global_role !== "admin") {
      window.location.href = "../index.html";
      return null;
    }

    const name = (profile.full_name || "").trim() || profile.email || user.email || "Admin User";
    if (topbarUserName) topbarUserName.textContent = name;
    if (topbarUserInitial) topbarUserInitial.textContent = name.charAt(0).toUpperCase();
    if (loggedInAsBadge) loggedInAsBadge.textContent = "Admin (KTIRS HQ)";
    return { user, profile };
  }

  async function logout() {
    await sb.auth.signOut();
    window.location.href = "../index.html";
  }

  async function loadLookups() {
    // MDAs
    const { data: mdasData, error: mErr } = await sb
      .from("mdas")
      .select("id, name, code, is_active")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (mErr) throw mErr;
    mdas = mdasData || [];
    mdaMap = new Map(mdas.map(m => [String(m.id), m]));

    // Fill MDA dropdown
    mdaFilter.innerHTML = `<option value="">All MDAs</option>` + mdas.map(m =>
      `<option value="${m.id}">${safeText(m.name)} (${safeText(m.code)})</option>`
    ).join("");

    // Sources (for display + search)
    const { data: srcData, error: sErr } = await sb
      .from("revenue_sources")
      .select("id, name, code, mda_id, is_active")
      .order("name", { ascending: true });

    if (sErr) throw sErr;
    sourceMap = new Map((srcData || []).map(s => [String(s.id), s]));

    // Profiles (for display + search)
    const { data: pData, error: pErr } = await sb
      .from("profiles")
      .select("user_id, email, full_name");

    if (pErr) throw pErr;
    profileMap = new Map((pData || []).map(p => [String(p.user_id), p]));
  }

  function buildSearchMatches(search) {
    const q = (search || "").trim().toLowerCase();
    if (!q) return { mdaIds: null, sourceIds: null, userIds: null };

    const mdaIds = mdas
      .filter(m => `${m.name} ${m.code}`.toLowerCase().includes(q))
      .map(m => String(m.id));

    const sourceIds = Array.from(sourceMap.values())
      .filter(s => `${s.name} ${s.code || ""}`.toLowerCase().includes(q))
      .map(s => String(s.id));

    const userIds = Array.from(profileMap.entries())
      .filter(([,p]) => `${p.email || ""} ${p.full_name || ""}`.toLowerCase().includes(q))
      .map(([user_id]) => String(user_id));

    return { mdaIds, sourceIds, userIds };
  }

  async function fetchPage() {
    const pageSize = Number(pageSizeEl.value || 20);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const year = yearFilter.value ? Number(yearFilter.value) : null;
    const month = monthFilter.value ? Number(monthFilter.value) : null;
    const mdaId = mdaFilter.value ? Number(mdaFilter.value) : null;

    const sortColumn = sortBy.value || "created_at";
    const ascending = (sortDir.value || "desc") === "asc";

    const search = searchInput.value || "";
    const matches = buildSearchMatches(search);

    if (statusText) statusText.textContent = "Loading…";

    // We must always order for consistent pagination. [web:260]
    let q = sb
      .from("revenues")
      .select("id, mda_id, revenue_source_id, amount, revenue_date, created_by, created_at, revenue_year, revenue_month", { count: "exact" })
      .order(sortColumn, { ascending })
      .range(from, to); // pagination slice [web:259]

    if (year) q = q.eq("revenue_year", year);
    if (month) q = q.eq("revenue_month", month);
    if (mdaId) q = q.eq("mda_id", mdaId);

    // Search behavior:
    // - If user typed something, we try to match it against cached lookup values and filter by IDs.
    // - If nothing matches, we show empty results (accurate behavior).
    if (search.trim()) {
      const anyMatch =
        (matches.mdaIds?.length || 0) +
        (matches.sourceIds?.length || 0) +
        (matches.userIds?.length || 0);

      if (!anyMatch) {
        totalCount = 0;
        renderRows([]);
        updatePagination(pageSize);
        if (statusText) statusText.textContent = "No results for current search.";
        return;
      }

      // Apply OR filter across foreign-key ids using PostgREST "or" filter.
      // Example patterns are discussed in Supabase community for multi-field OR logic. [web:265]
      const parts = [];
      if (matches.mdaIds?.length) parts.push(`mda_id.in.(${matches.mdaIds.join(",")})`);
      if (matches.sourceIds?.length) parts.push(`revenue_source_id.in.(${matches.sourceIds.join(",")})`);
      if (matches.userIds?.length) parts.push(`created_by.in.(${matches.userIds.join(",")})`);
      q = q.or(parts.join(","));
    }

    const { data, error, count } = await q;
    if (error) {
      console.error(error);
      if (statusText) statusText.textContent = "Failed to load history.";
      return;
    }

    totalCount = Number(count || 0);
    if (totalCountEl) totalCountEl.textContent = String(totalCount);

    renderRows(data || []);
    updatePagination(pageSize);

    if (statusText) statusText.textContent = "Loaded.";
  }

  function renderRows(rows) {
    if (!historyBody) return;

    if (!rows.length) {
      historyBody.innerHTML = `<tr><td colspan="7" class="px-3 py-6 text-center text-slate-500">No records found.</td></tr>`;
      return;
    }

    historyBody.innerHTML = rows.map(r => {
      const mda = mdaMap.get(String(r.mda_id));
      const src = sourceMap.get(String(r.revenue_source_id));
      const prof = profileMap.get(String(r.created_by));

      const mdaTxt = mda ? `${mda.name} (${mda.code})` : `MDA ${r.mda_id}`;
      const srcTxt = src ? `${src.name}${src.code ? ` (${src.code})` : ""}` : `Source ${r.revenue_source_id}`;
      const userTxt = prof ? (prof.full_name ? `${prof.full_name} (${prof.email})` : prof.email) : (r.created_by || "—");

      return `
        <tr class="hover:bg-slate-50">
          <td class="px-3 py-2">
            <span class="inline-flex items-center rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-[11px]">Revenue entry</span>
          </td>
          <td class="px-3 py-2">${safeText(mdaTxt)}</td>
          <td class="px-3 py-2">${safeText(srcTxt)}</td>
          <td class="px-3 py-2">${safeText(userTxt)}</td>
          <td class="px-3 py-2">${safeText(r.revenue_date || "—")}</td>
          <td class="px-3 py-2 text-right font-medium">${formatNumber(r.amount)}</td>
          <td class="px-3 py-2">${safeText(fmtDate(r.created_at))}</td>
        </tr>
      `;
    }).join("");
  }

  function updatePagination(pageSize) {
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

    if (page > totalPages) page = totalPages;

    if (pageNumber) pageNumber.textContent = String(page);
    if (pageTotal) pageTotal.textContent = String(totalPages);
    if (pageBadge) pageBadge.textContent = `Page ${page}`;

    const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
    const to = Math.min(page * pageSize, totalCount);

    if (rangeText) rangeText.textContent = `Showing ${from}–${to} of ${totalCount}`;

    if (btnPrev) btnPrev.disabled = page <= 1;
    if (btnNext) btnNext.disabled = page >= totalPages;

    if (btnPrev) btnPrev.classList.toggle("opacity-50", btnPrev.disabled);
    if (btnNext) btnNext.classList.toggle("opacity-50", btnNext.disabled);
  }

  function resetFilters() {
    searchInput.value = "";
    populateYearSelect(yearFilter);
    monthFilter.value = "";
    mdaFilter.value = "";
    sortBy.value = "created_at";
    sortDir.value = "desc";
    pageSizeEl.value = "20";
    page = 1;
  }

  // Init
  (async () => {
    setupSidebar();
    populateYearSelect(yearFilter);

    const ok = await requireAdmin();
    if (!ok) return;

    try {
      await loadLookups();
    } catch (e) {
      console.error(e);
      if (statusText) statusText.textContent = "Failed to load lookup data.";
      return;
    }

    // Default run
    page = 1;
    await fetchPage();

    // Events
    if (logoutBtn) logoutBtn.addEventListener("click", logout);

    if (btnApply) btnApply.addEventListener("click", async () => {
      page = 1;
      await fetchPage();
    });

    if (btnReset) btnReset.addEventListener("click", async () => {
      resetFilters();
      await fetchPage();
    });

    if (btnPrev) btnPrev.addEventListener("click", async () => {
      if (page > 1) page -= 1;
      await fetchPage();
    });

    if (btnNext) btnNext.addEventListener("click", async () => {
      page += 1;
      await fetchPage();
    });

    // Enter key triggers apply
    searchInput.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") {
        page = 1;
        await fetchPage();
      }
    });

    // Changing any of these should auto reset to page 1
    [yearFilter, monthFilter, mdaFilter, sortBy, sortDir, pageSizeEl].forEach(el => {
      el.addEventListener("change", async () => {
        page = 1;
        await fetchPage();
      });
    });

    if (window.lucide) lucide.createIcons();
  })();
})();
