// mda/js/revenue-monthly.js

(async () => {
  const supabase = window.supabaseClient;
  if (!supabase) return;

  const topbarUserName = document.getElementById('topbarUserName');
  const topbarUserInitial = document.getElementById('topbarUserInitial');
  const topbarMdaName = document.getElementById('topbarMdaName');

  const btnBackToSources = document.getElementById('btnBackToSources');
  const yearBadge = document.getElementById('yearBadge');
  const assignedMdaBadge = document.getElementById('assignedMdaBadge');

  const pageTitle = document.getElementById('pageTitle');
  const sourceCodeLabel = document.getElementById('sourceCodeLabel');
  const sourceNameLabel = document.getElementById('sourceNameLabel');
  const approvedBudgetLabel = document.getElementById('approvedBudgetLabel');
  const totalRecordedLabel = document.getElementById('totalRecordedLabel');

  const monthsTableBody = document.getElementById('monthsTableBody');

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
    // half-open interval: [YYYY-01-01, (YYYY+1)-01-01)
    return { start: `${year}-01-01`, end: `${year + 1}-01-01` };
  }

  // 1) Read query params
  const params = new URLSearchParams(window.location.search);
  const revenueSourceIdParam = params.get('revenue_source_id');
  const yearParam = params.get('year');
  const branchIdParam = params.get('branch_id'); // optional (passed from sources page)

  if (!revenueSourceIdParam) {
    if (pageTitle) pageTitle.textContent = 'Revenue source not specified.';
    return;
  }

  const revenueSourceId = parseInt(revenueSourceIdParam, 10);
  const year = parseYear(yearParam, new Date().getFullYear());
  if (yearBadge) yearBadge.textContent = String(year);

  const branchIdFromUrl = branchIdParam ? Number(branchIdParam) : null;

  // 2) Session + profile
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

  // 3) Resolve primary scope (mda_id + branch_id)
  const { data: scopes, error: scopesError } = await supabase
    .from('user_scopes')
    .select('mda_id, branch_id')
    .eq('user_id', user.id)
    .order('id', { ascending: true })
    .limit(1);

  if (scopesError || !scopes?.length || !scopes[0]?.mda_id) {
    if (pageTitle) pageTitle.textContent = 'No MDA assigned to your account.';
    if (assignedMdaBadge) assignedMdaBadge.textContent = 'No MDA';
    if (topbarMdaName) topbarMdaName.textContent = 'No MDA';
    return;
  }

  const mdaId = Number(scopes[0].mda_id);
  const branchIdFromScope = scopes[0].branch_id ? Number(scopes[0].branch_id) : null;

  // If user is branch-scoped, the URL branch_id (if present) must match that scope
  if (branchIdFromScope && branchIdFromUrl && branchIdFromUrl !== branchIdFromScope) {
    if (pageTitle) pageTitle.textContent = 'Invalid branch context for your scope.';
    return;
  }

  const effectiveBranchId = branchIdFromScope || branchIdFromUrl || null;

  // 4) Load MDA + Branch (branch optional)
  const [{ data: mda, error: mdaError }, { data: branch }] = await Promise.all([
    supabase.from('mdas').select('id, name').eq('id', mdaId).single(),
    effectiveBranchId
      ? supabase.from('mda_branches').select('id, name').eq('id', effectiveBranchId).single()
      : Promise.resolve({ data: null })
  ]);

  if (mdaError || !mda) {
    if (pageTitle) pageTitle.textContent = 'Assigned MDA not found.';
    if (assignedMdaBadge) assignedMdaBadge.textContent = 'MDA not found';
    if (topbarMdaName) topbarMdaName.textContent = 'MDA not found';
    return;
  }

  const scopeLabel = branch?.name ? `${mda.name} • ${branch.name}` : mda.name;
  if (assignedMdaBadge) assignedMdaBadge.textContent = scopeLabel;
  if (topbarMdaName) topbarMdaName.textContent = scopeLabel;

  // 5) Load revenue source and ensure it belongs to this MDA
  const { data: source, error: sourceError } = await supabase
    .from('revenue_sources')
    .select('id, code, name, mda_id, is_active')
    .eq('id', revenueSourceId)
    .single();

  if (sourceError || !source || source.mda_id !== mda.id) {
    if (pageTitle) pageTitle.textContent = 'Revenue source not found for your MDA.';
    return;
  }

  if (source.is_active === false) {
    if (pageTitle) pageTitle.textContent = 'Revenue source is inactive.';
    return;
  }

  if (pageTitle) pageTitle.textContent = `Monthly entry – ${source.name}`;
  if (sourceCodeLabel) sourceCodeLabel.textContent = `Code: ${source.code || '—'}`;
  if (sourceNameLabel) sourceNameLabel.textContent = source.name || '—';

  // 5b) Load approved budget for this source + year (NEW table)
  const { data: budgetRow, error: budgetError } = await supabase
    .from('revenue_source_budgets')
    .select('approved_budget, budget_year')
    .eq('revenue_source_id', source.id)
    .eq('budget_year', year)
    .maybeSingle();

  if (budgetError) console.error('Error loading revenue_source_budgets:', budgetError);

  const approvedBudget = budgetRow?.approved_budget ?? null;
  if (approvedBudgetLabel) approvedBudgetLabel.textContent = approvedBudget === null ? '—' : formatNaira(approvedBudget);

  // 6) Load existing revenues for this MDA, source, year (filter by branch when scoped)
  const { start: yearStart, end: yearEnd } = yearRange(year);

  let revQuery = supabase
    .from('revenues')
    .select('amount, revenue_date, branch_id')
    .eq('mda_id', mda.id)
    .eq('revenue_source_id', source.id)
    .gte('revenue_date', yearStart)
    .lt('revenue_date', yearEnd);

  if (effectiveBranchId) revQuery = revQuery.eq('branch_id', effectiveBranchId);

  const { data: revenues, error: revenuesError } = await revQuery;
  if (revenuesError) console.error('Error loading revenues for monthly view:', revenuesError);

  // 7) Aggregate by month
  const totalsByMonth = new Array(12).fill(0);
  let yearlyTotal = 0;

  if (Array.isArray(revenues)) {
    revenues.forEach((r) => {
      const d = new Date(r.revenue_date);
      if (Number.isNaN(d.getTime())) return;
      const monthIndex = d.getMonth();
      const amt = Number(r.amount) || 0;
      yearlyTotal += amt;
      totalsByMonth[monthIndex] += amt;
    });
  }

  if (totalRecordedLabel) totalRecordedLabel.textContent = formatNaira(yearlyTotal);

  // 8) Render months table
  if (monthsTableBody) {
    monthsTableBody.innerHTML = '';

    for (let i = 0; i < 12; i++) {
      const tr = document.createElement('tr');
      tr.className = 'border-t border-slate-200';

      const tdMonth = document.createElement('td');
      tdMonth.className = 'px-2 py-1.5';
      tdMonth.textContent = `${monthNames[i]} ${year}`;

      const tdCurrent = document.createElement('td');
      tdCurrent.className = 'px-2 py-1.5 text-right whitespace-nowrap';
      tdCurrent.textContent = formatNaira(totalsByMonth[i]);

      const tdAction = document.createElement('td');
      tdAction.className = 'px-2 py-1.5 text-right whitespace-nowrap';

      const btnDetail = document.createElement('button');
      btnDetail.type = 'button';
      btnDetail.className =
        'inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50';
      btnDetail.textContent = 'Record / update entries';

      btnDetail.addEventListener('click', () => {
        const monthNumber = i + 1; // 1-12

        const urlParams = new URLSearchParams({
          revenue_source_id: String(source.id),
          year: String(year),
          month: String(monthNumber),
          ...(effectiveBranchId ? { branch_id: String(effectiveBranchId) } : {})
        });

        window.location.href = `monthly-detail.html?${urlParams.toString()}`;
      });

      tdAction.appendChild(btnDetail);

      tr.appendChild(tdMonth);
      tr.appendChild(tdCurrent);
      tr.appendChild(tdAction);

      monthsTableBody.appendChild(tr);
    }
  }

  // 9) Back button (preserve selected year + branch context)
  if (btnBackToSources) {
    btnBackToSources.addEventListener('click', () => {
      const backParams = new URLSearchParams({
        year: String(year),
        ...(effectiveBranchId ? { branch_id: String(effectiveBranchId) } : {})
      });

      window.location.href = `revenue-sources.html?${backParams.toString()}`;
    });
  }
})();
