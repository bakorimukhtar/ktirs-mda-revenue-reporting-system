// mda/js/revenue-sources.js

(async () => {
  const supabase = window.supabaseClient;
  if (!supabase) return;

  const topbarUserName = document.getElementById('topbarUserName');
  const topbarUserInitial = document.getElementById('topbarUserInitial');
  const topbarMdaName = document.getElementById('topbarMdaName');
  const btnLogout = document.getElementById('btnLogout');

  const mdaNameHeading = document.getElementById('mdaNameHeading');
  const assignedMdaBadge = document.getElementById('assignedMdaBadge');
  const budgetYearLabel = document.getElementById('budgetYearLabel');
  const budgetYearPicker = document.getElementById('budgetYearPicker');
  const sourcesTableBody = document.getElementById('sourcesTableBody');
  const pageMessage = document.getElementById('pageMessage');

  // Modal elements
  const sourceModal = document.getElementById('sourceModal');
  const btnCloseModal = document.getElementById('btnCloseModal');
  const modalSourceTitle = document.getElementById('modalSourceTitle');
  const modalSourceSubtitle = document.getElementById('modalSourceSubtitle');
  const modalApprovedBudget = document.getElementById('modalApprovedBudget');
  const modalTotalRecorded = document.getElementById('modalTotalRecorded');
  const modalCoverageText = document.getElementById('modalCoverageText');
  const modalMonthsBody = document.getElementById('modalMonthsBody');
  const btnOpenMonthlyEntry = document.getElementById('btnOpenMonthlyEntry');

  const monthNames = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
  ];

  function formatNaira(n) {
    const val = Number(n) || 0;
    return '₦' + val.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function parseYear(v, fallbackYear) {
    const n = Number(String(v || '').trim());
    if (!Number.isFinite(n) || n < 1900 || n > 2200) return fallbackYear;
    return n;
  }

  function yearRange(year) {
    // Use half-open interval: [year-01-01, nextYear-01-01)
    return {
      start: `${year}-01-01`,
      end: `${year + 1}-01-01`,
    };
  }

  function setYearUI(year) {
    if (budgetYearPicker) budgetYearPicker.value = String(year);
    if (budgetYearLabel) budgetYearLabel.textContent = String(year);
  }

  function setMsg(msg) {
    if (pageMessage) pageMessage.textContent = msg || '';
  }

  function closeSourceModal() {
    if (!sourceModal) return;
    sourceModal.classList.add('hidden');
    sourceModal.classList.remove('flex');
    window.__currentSource = null;
  }

  // ----------------------------
  // 1) Session + profile
  // ----------------------------
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData?.session?.user) {
    window.location.href = '../index.html';
    return;
  }
  const user = sessionData.session.user;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('full_name, email, global_role')
    .eq('user_id', user.id)
    .single();

  if (profileError || !profile || profile.global_role !== 'mda_user') {
    window.location.href = '../index.html';
    return;
  }

  const displayName =
    profile.full_name && profile.full_name.trim().length > 0
      ? profile.full_name.trim()
      : profile.email || 'MDA Officer';

  if (topbarUserName) topbarUserName.textContent = displayName;
  if (topbarUserInitial) topbarUserInitial.textContent = displayName.charAt(0).toUpperCase();

  // ----------------------------
  // 2) Resolve primary scope (mda_id + branch_id)
  // ----------------------------
  const { data: scopes, error: scopesError } = await supabase
    .from('user_scopes')
    .select('mda_id, branch_id')
    .eq('user_id', user.id)
    .order('id', { ascending: true })
    .limit(1);

  if (scopesError || !scopes?.length || !scopes[0]?.mda_id) {
    if (mdaNameHeading) mdaNameHeading.textContent = 'No MDA assigned';
    if (assignedMdaBadge) assignedMdaBadge.textContent = 'No MDA';
    if (topbarMdaName) topbarMdaName.textContent = 'No MDA';
    return;
  }

  const mdaId = Number(scopes[0].mda_id);
  const branchId = scopes[0].branch_id ? Number(scopes[0].branch_id) : null;

  // ----------------------------
  // 3) Load MDA + Branch (optional)
  // ----------------------------
  const [{ data: mda, error: mdaError }, { data: branch }] = await Promise.all([
    supabase.from('mdas').select('id, name').eq('id', mdaId).single(),
    branchId
      ? supabase.from('mda_branches').select('id, name').eq('id', branchId).single()
      : Promise.resolve({ data: null, error: null })
  ]);

  if (mdaError || !mda) {
    if (mdaNameHeading) mdaNameHeading.textContent = 'Assigned MDA not found';
    if (assignedMdaBadge) assignedMdaBadge.textContent = 'MDA not found';
    if (topbarMdaName) topbarMdaName.textContent = 'MDA not found';
    return;
  }

  const scopeLabel = branch?.name ? `${mda.name} • ${branch.name}` : mda.name;

  if (mdaNameHeading) mdaNameHeading.textContent = mda.name;
  if (assignedMdaBadge) assignedMdaBadge.textContent = scopeLabel;
  if (topbarMdaName) topbarMdaName.textContent = scopeLabel;

  // ----------------------------
  // 4) Year selection (default current year)
  // ----------------------------
  const defaultYear = new Date().getFullYear();
  let selectedYear = parseYear(budgetYearPicker?.value, defaultYear);
  setYearUI(selectedYear);

  // ----------------------------
  // Data caches used by modal/monthly entry
  // ----------------------------
  let currentSources = []; // sources with computed approved_budget for selectedYear
  let revenuesBySource = new Map(); // sourceId -> revenues[]
  let budgetsBySourceId = new Map(); // sourceId -> approved_budget

  async function loadSources() {
    const { data: sources, error } = await supabase
      .from('revenue_sources')
      .select('id, code, name, is_active')
      .eq('mda_id', mda.id)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) console.error('Error loading revenue_sources', error);
    return sources || [];
  }

  async function loadBudgetsForYear(sourceIds, year) {
    budgetsBySourceId = new Map();
    if (!Array.isArray(sourceIds) || sourceIds.length === 0) return budgetsBySourceId;

    const { data: budgets, error } = await supabase
      .from('revenue_source_budgets')
      .select('revenue_source_id, approved_budget, budget_year')
      .eq('budget_year', year)
      .in('revenue_source_id', sourceIds);

    if (error) console.error('Error loading revenue_source_budgets', error);

    (budgets || []).forEach((b) => {
      budgetsBySourceId.set(String(b.revenue_source_id), b.approved_budget);
    });

    return budgetsBySourceId;
  }

  async function loadRevenuesForYear(year) {
    const { start, end } = yearRange(year);

    let q = supabase
      .from('revenues')
      .select('revenue_source_id, amount, revenue_date, branch_id')
      .eq('mda_id', mda.id)
      .gte('revenue_date', start)
      .lt('revenue_date', end);

    if (branchId) q = q.eq('branch_id', branchId);

    const { data: revenues, error } = await q;
    if (error) console.error('Error loading revenues', error);

    revenuesBySource = new Map();
    (revenues || []).forEach((r) => {
      const key = String(r.revenue_source_id);
      if (!revenuesBySource.has(key)) revenuesBySource.set(key, []);
      revenuesBySource.get(key).push(r);
    });

    return revenues || [];
  }

  function renderTable() {
    if (!sourcesTableBody) return;
    sourcesTableBody.innerHTML = '';

    if (!currentSources || currentSources.length === 0) {
      const tr = document.createElement('tr');
      tr.className = 'border-t border-slate-200';
      const td = document.createElement('td');
      td.colSpan = 5;
      td.className = 'px-2 py-4 text-center text-slate-500';
      td.textContent = 'No revenue sources found for your MDA.';
      tr.appendChild(td);
      sourcesTableBody.appendChild(tr);
      setMsg('');
      return;
    }

    let totalApproved = 0;
    let totalRecordedAll = 0;

    currentSources.forEach((src) => {
      const srcRevs = revenuesBySource.get(String(src.id)) || [];
      const totalRecorded = srcRevs.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
      const approved = Number(src.approved_budget) || 0;

      totalApproved += approved;
      totalRecordedAll += totalRecorded;

      const tr = document.createElement('tr');
      tr.className = 'border-t border-slate-200';

      const tdCode = document.createElement('td');
      tdCode.className = 'px-2 py-1.5 whitespace-nowrap';
      tdCode.textContent = src.code || '—';

      const tdName = document.createElement('td');
      tdName.className = 'px-2 py-1.5';
      tdName.textContent = src.name || '—';

      const tdApproved = document.createElement('td');
      tdApproved.className = 'px-2 py-1.5 text-right whitespace-nowrap';
      tdApproved.textContent = approved ? formatNaira(approved) : '—';

      const tdRecorded = document.createElement('td');
      tdRecorded.className = 'px-2 py-1.5 text-right whitespace-nowrap';
      tdRecorded.textContent = formatNaira(totalRecorded);

      const tdActions = document.createElement('td');
      tdActions.className = 'px-2 py-1.5 text-right whitespace-nowrap';

      const btnDetails = document.createElement('button');
      btnDetails.type = 'button';
      btnDetails.className =
        'inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50';
      btnDetails.textContent = 'Details / Monthly';
      btnDetails.addEventListener('click', () => {
        openSourceModal(src, srcRevs);
      });

      tdActions.appendChild(btnDetails);

      tr.appendChild(tdCode);
      tr.appendChild(tdName);
      tr.appendChild(tdApproved);
      tr.appendChild(tdRecorded);
      tr.appendChild(tdActions);

      sourcesTableBody.appendChild(tr);
    });

    setMsg(
      `Year ${selectedYear} • Approved: ${formatNaira(totalApproved)} • Recorded: ${formatNaira(totalRecordedAll)}`
    );

    if (window.lucide) window.lucide.createIcons();
  }

  // ----------------------------
  // Modal open (monthly totals)
  // ----------------------------
  function openSourceModal(source, sourceRevenues) {
    if (!sourceModal) return;

    const approved = Number(source.approved_budget) || 0;
    const totalRecorded = (sourceRevenues || []).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

    if (modalSourceTitle) modalSourceTitle.textContent = source.name || '—';
    if (modalSourceSubtitle) {
      modalSourceSubtitle.textContent = `Code: ${source.code || '—'} • Year: ${selectedYear}`;
    }
    if (modalApprovedBudget) modalApprovedBudget.textContent = approved ? formatNaira(approved) : '—';
    if (modalTotalRecorded) modalTotalRecorded.textContent = formatNaira(totalRecorded);

    // totals per month (1..12)
    const totals = new Array(12).fill(0);
    (sourceRevenues || []).forEach((r) => {
      if (!r.revenue_date) return;
      const d = new Date(r.revenue_date);
      const m = d.getMonth(); // 0..11
      totals[m] += Number(r.amount) || 0;
    });

    const monthsWithData = totals.filter((t) => t > 0).length;
    if (modalCoverageText) {
      modalCoverageText.textContent =
        monthsWithData > 0
          ? `${monthsWithData} month(s) recorded in ${selectedYear}.`
          : 'No records captured yet.';
    }

    if (modalMonthsBody) {
      modalMonthsBody.innerHTML = '';
      for (let i = 0; i < 12; i++) {
        const tr = document.createElement('tr');
        tr.className = 'border-t border-slate-200';

        const tdMonth = document.createElement('td');
        tdMonth.className = 'px-2 py-1.5';
        tdMonth.textContent = monthNames[i];

        const tdTotal = document.createElement('td');
        tdTotal.className = 'px-2 py-1.5 text-right whitespace-nowrap';
        tdTotal.textContent = formatNaira(totals[i]);

        tr.appendChild(tdMonth);
        tr.appendChild(tdTotal);
        modalMonthsBody.appendChild(tr);
      }
    }

    // Store context for monthly entry
    window.__currentSource = source;

    sourceModal.classList.remove('hidden');
    sourceModal.classList.add('flex');

    if (window.lucide) window.lucide.createIcons();
  }

  // ----------------------------
  // Refresh view for selected year
  // ----------------------------
  async function refreshYearView(nextYear) {
    selectedYear = parseYear(nextYear, defaultYear);
    setYearUI(selectedYear);

    // Close modal if open to avoid mismatch when switching year
    closeSourceModal();

    setMsg('Loading...');

    const sources = await loadSources();
    const sourceIds = sources.map((s) => s.id);

    await Promise.all([
      loadBudgetsForYear(sourceIds, selectedYear),
      loadRevenuesForYear(selectedYear),
    ]);

    // Attach approved_budget for selected year (from budgets table)
    currentSources = sources.map((s) => ({
      ...s,
      approved_budget: budgetsBySourceId.has(String(s.id)) ? budgetsBySourceId.get(String(s.id)) : null,
      budget_year: selectedYear,
    }));

    renderTable();
  }

  // ----------------------------
  // Events
  // ----------------------------
  if (btnCloseModal) btnCloseModal.addEventListener('click', closeSourceModal);
  if (sourceModal) {
    sourceModal.addEventListener('click', (e) => {
      if (e.target === sourceModal) closeSourceModal();
    });
  }

  if (btnOpenMonthlyEntry) {
    btnOpenMonthlyEntry.addEventListener('click', () => {
      const source = window.__currentSource;
      if (!source) return;

      const params = new URLSearchParams({
        revenue_source_id: String(source.id),
        year: String(selectedYear),
        ...(branchId ? { branch_id: String(branchId) } : {})
      });

      window.location.href = `revenue-monthly.html?${params.toString()}`;
    });
  }

  if (budgetYearPicker) {
    budgetYearPicker.addEventListener('change', async () => {
      await refreshYearView(budgetYearPicker.value);
    });
  }

  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      await supabase.auth.signOut();
      window.location.href = '../index.html';
    });
  }

  // ----------------------------
  // Initial render
  // ----------------------------
  await refreshYearView(selectedYear);
})();
