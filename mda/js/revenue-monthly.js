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
  const btnSaveAll = document.getElementById('btnSaveAll');
  const saveAllStatus = document.getElementById('saveAllStatus');

  const monthNames = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
  ];

  let revenueSourceId, year, mda, source, effectiveBranchId, user;

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
    return { start: `${year}-01-01`, end: `${year + 1}-01-01` };
  }

  function setSaveAllStatus(text, tone = 'slate') {
    if (!saveAllStatus) return;
    saveAllStatus.textContent = text || '';
    const color = 
      tone === 'success' ? 'text-emerald-700'
      : tone === 'error' ? 'text-red-600'
      : 'text-slate-500';
    saveAllStatus.className = `text-[11px] ${color}`;
  }

  function setSavingAll(isSaving) {
    if (!btnSaveAll) return;
    btnSaveAll.disabled = !!isSaving;
    btnSaveAll.classList.toggle('opacity-60', !!isSaving);
    btnSaveAll.classList.toggle('cursor-not-allowed', !!isSaving);
  }

  function updateYearTotal() {
    const inputs = monthsTableBody?.querySelectorAll('input[data-month]');
    if (!inputs) return;
    
    let total = 0;
    inputs.forEach(input => {
      total += Number(input.value) || 0;
    });
    if (totalRecordedLabel) {
      totalRecordedLabel.textContent = formatNaira(total);
    }
  }

  async function saveMonth(monthNumber, amount) {
    if (Number.isNaN(amount) || amount < 0) return false;

    const lastDay = new Date(year, monthNumber, 0);
    const revenueDateStr = 
      `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;

    const row = {
      mda_id: mda.id,
      revenue_source_id: source.id,
      amount,
      revenue_date: revenueDateStr,
      created_by: user.id,
      branch_id: effectiveBranchId || null
    };

    const { error } = await supabase
      .from('revenues')
      .upsert([row], {
        onConflict: 'mda_id,revenue_source_id,branch_scope_key,revenue_year,revenue_month'
      });

    return !error;
  }

  // 1) Read query params
  const params = new URLSearchParams(window.location.search);
  const revenueSourceIdParam = params.get('revenue_source_id');
  const yearParam = params.get('year');
  const branchIdParam = params.get('branch_id');

  if (!revenueSourceIdParam) {
    if (pageTitle) pageTitle.textContent = 'Revenue source not specified.';
    return;
  }

  revenueSourceId = parseInt(revenueSourceIdParam, 10);
  year = parseYear(yearParam, new Date().getFullYear());
  if (yearBadge) yearBadge.textContent = String(year);

  const branchIdFromUrl = branchIdParam ? Number(branchIdParam) : null;

  // 2) Session + profile
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData?.session?.user) {
    window.location.href = '../index.html';
    return;
  }
  user = sessionData.session.user;

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

  if (branchIdFromScope && branchIdFromUrl && branchIdFromUrl !== branchIdFromScope) {
    if (pageTitle) pageTitle.textContent = 'Invalid branch context for your scope.';
    return;
  }

  effectiveBranchId = branchIdFromScope || branchIdFromUrl || null;

  // 4) Load MDA + Branch (branch optional)
  const [{ data: mdaData, error: mdaError }, { data: branch }] = await Promise.all([
    supabase.from('mdas').select('id, name').eq('id', mdaId).single(),
    effectiveBranchId
      ? supabase.from('mda_branches').select('id, name').eq('id', effectiveBranchId).single()
      : Promise.resolve({ data: null })
  ]);

  if (mdaError || !mdaData) {
    if (pageTitle) pageTitle.textContent = 'Assigned MDA not found.';
    if (assignedMdaBadge) assignedMdaBadge.textContent = 'MDA not found';
    if (topbarMdaName) topbarMdaName.textContent = 'MDA not found';
    return;
  }
  mda = mdaData;

  const scopeLabel = branch?.name ? `${mda.name} • ${branch.name}` : mda.name;
  if (assignedMdaBadge) assignedMdaBadge.textContent = scopeLabel;
  if (topbarMdaName) topbarMdaName.textContent = scopeLabel;

  // 5) Load revenue source and ensure it belongs to this MDA
  const { data: sourceData, error: sourceError } = await supabase
    .from('revenue_sources')
    .select('id, code, name, mda_id, is_active')
    .eq('id', revenueSourceId)
    .single();

  if (sourceError || !sourceData || sourceData.mda_id !== mda.id) {
    if (pageTitle) pageTitle.textContent = 'Revenue source not found for your MDA.';
    return;
  }

  if (sourceData.is_active === false) {
    if (pageTitle) pageTitle.textContent = 'Revenue source is inactive.';
    return;
  }
  source = sourceData;

  if (pageTitle) pageTitle.textContent = `Monthly entry – ${source.name}`;
  if (sourceCodeLabel) sourceCodeLabel.textContent = `Code: ${source.code || '—'}`;
  if (sourceNameLabel) sourceNameLabel.textContent = source.name || '—';

  // 5b) Load approved budget
  const { data: budgetRow } = await supabase
    .from('revenue_source_budgets')
    .select('approved_budget')
    .eq('revenue_source_id', source.id)
    .eq('budget_year', year)
    .maybeSingle();

  const approvedBudget = budgetRow?.approved_budget ?? null;
  if (approvedBudgetLabel) {
    approvedBudgetLabel.textContent = approvedBudget === null ? '—' : formatNaira(approvedBudget);
  }

  // 6) Load existing revenues for this year
  const { start: yearStart, end: yearEnd } = yearRange(year);

  let revQuery = supabase
    .from('revenues')
    .select('amount, revenue_date, branch_id')
    .eq('mda_id', mda.id)
    .eq('revenue_source_id', source.id)
    .gte('revenue_date', yearStart)
    .lt('revenue_date', yearEnd);

  if (effectiveBranchId) revQuery = revQuery.eq('branch_id', effectiveBranchId);

  const { data: revenues } = await revQuery;

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

  // 8) Render months table with editable inputs
  if (monthsTableBody) {
    monthsTableBody.innerHTML = '';

    for (let i = 0; i < 12; i++) {
      const tr = document.createElement('tr');
      tr.className = 'border-t border-slate-200 hover:bg-slate-50';

      // Month column
      const tdMonth = document.createElement('td');
      tdMonth.className = 'px-2 py-2';
      tdMonth.textContent = `${monthNames[i]} ${year}`;

      // Amount column - now editable input
      const tdAmount = document.createElement('td');
      tdAmount.className = 'px-2 py-2 text-right';

      const amountInput = document.createElement('input');
      amountInput.type = 'number';
      amountInput.min = '0';
      amountInput.step = '0.01';
      amountInput.dataset.month = String(i + 1); // 1-12
      amountInput.value = String(totalsByMonth[i]);
      amountInput.className = 
        'w-28 rounded-md border border-slate-300 px-2 py-1 text-right text-[11px] focus:outline-none focus:ring-1 focus:ring-slate-500 focus:border-slate-500 hover:bg-slate-50 transition-colors';
      amountInput.placeholder = '0.00';

      // Live total updates
      amountInput.addEventListener('input', updateYearTotal);

      tdAmount.appendChild(amountInput);

      // Actions column
      const tdAction = document.createElement('td');
      tdAction.className = 'px-2 py-2 text-right whitespace-nowrap space-x-1';

      // Details button (preserves original feature)
      const btnDetail = document.createElement('button');
      btnDetail.type = 'button';
      btnDetail.className =
        'inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50';
      btnDetail.innerHTML = '<i data-lucide="zoom-in"></i>Details';
      
      btnDetail.addEventListener('click', () => {
        const monthNumber = i + 1;
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
      tr.appendChild(tdAmount);
      tr.appendChild(tdAction);
      monthsTableBody.appendChild(tr);
    }

    // Trigger initial total calculation
    updateYearTotal();
  }

  // 9) Save All button
  if (btnSaveAll) {
    btnSaveAll.addEventListener('click', async () => {
      try {
        setSavingAll(true);
        setSaveAllStatus('Saving all months...', 'slate');

        const inputs = monthsTableBody.querySelectorAll('input[data-month]');
        const savePromises = [];

        inputs.forEach(input => {
          const monthNumber = Number(input.dataset.month);
          const amount = Number(input.value);
          if (amount >= 0) {
            savePromises.push(saveMonth(monthNumber, amount));
          }
        });

        const results = await Promise.all(savePromises);
        const successCount = results.filter(Boolean).length;
        const totalCount = savePromises.length;

        if (successCount === totalCount) {
          setSaveAllStatus(`Saved ${successCount} months successfully.`, 'success');
          updateYearTotal(); // Refresh display
        } else {
          setSaveAllStatus(`${successCount}/${totalCount} months saved. Some failed.`, 'warn');
        }
      } catch (err) {
        console.error('Bulk save failed:', err);
        setSaveAllStatus('Save failed. Please try again.', 'error');
      } finally {
        setSavingAll(false);
      }
    });
  }

  // 10) Back button (preserved exactly)
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
