// mda/js/monthly-detail.js

(async () => {
  const supabase = window.supabaseClient;
  if (!supabase) return;

  const topbarUserName = document.getElementById('topbarUserName');
  const topbarUserInitial = document.getElementById('topbarUserInitial');
  const topbarMdaName = document.getElementById('topbarMdaName');

  const detailHeading = document.getElementById('detailHeading');
  const detailSubheading = document.getElementById('detailSubheading');
  const reportingMonthLabel = document.getElementById('reportingMonthLabel');
  const assignedMdaBadge = document.getElementById('assignedMdaBadge');
  const btnBackToMonthly = document.getElementById('btnBackToMonthly');
  const saveStatus = document.getElementById('saveStatus');

  const sourceCodeLabel = document.getElementById('sourceCodeLabel');
  const sourceNameLabel = document.getElementById('sourceNameLabel');
  const approvedBudgetLabel = document.getElementById('approvedBudgetLabel');
  const monthTotalLabel = document.getElementById('monthTotalLabel');

  const currentRecordedLabel = document.getElementById('currentRecordedLabel');
  const monthAmountInput = document.getElementById('monthAmountInput');
  const btnSaveMonth = document.getElementById('btnSaveMonth');

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

  function setStatus(text, tone = 'slate') {
    if (!saveStatus) return;
    saveStatus.textContent = text || '';
    const color =
      tone === 'success' ? 'text-emerald-700'
      : tone === 'warn' ? 'text-amber-700'
      : tone === 'error' ? 'text-red-600'
      : 'text-slate-600';
    saveStatus.className = `mt-1 text-[11px] ${color}`;
  }

  function setSaving(isSaving) {
    if (!btnSaveMonth) return;
    btnSaveMonth.disabled = !!isSaving;
    btnSaveMonth.classList.toggle('opacity-60', !!isSaving);
    btnSaveMonth.classList.toggle('cursor-not-allowed', !!isSaving);
  }

  // 1) Read query params
  const params = new URLSearchParams(window.location.search);
  const revenueSourceIdParam = params.get('revenue_source_id');
  const yearParam = params.get('year');
  const monthParam = params.get('month'); // "1".."12"
  const branchIdParam = params.get('branch_id'); // optional

  if (!revenueSourceIdParam || !monthParam) {
    if (detailHeading) detailHeading.textContent = 'Missing revenue source or month.';
    return;
  }

  const revenueSourceId = Number(revenueSourceIdParam);
  const year = parseYear(yearParam, new Date().getFullYear());
  const monthNumber = Number(monthParam);
  const monthIndex = monthNumber - 1;

  if (!Number.isFinite(revenueSourceId) || revenueSourceId <= 0) {
    if (detailHeading) detailHeading.textContent = 'Invalid revenue source.';
    return;
  }
  if (!Number.isFinite(monthNumber) || monthNumber < 1 || monthNumber > 12) {
    if (detailHeading) detailHeading.textContent = 'Invalid month.';
    return;
  }

  const monthName = monthNames[monthIndex] || 'Month';
  const monthLabel = `${monthName} ${year}`;

  if (reportingMonthLabel) reportingMonthLabel.textContent = monthLabel;
  if (detailHeading) detailHeading.textContent = `NTR entry for ${monthLabel}`;
  if (detailSubheading) {
    detailSubheading.textContent =
      'Record your total Non-Tax Revenue (NTR) for this month and revenue source.';
  }

  // Use last day of month as the revenue_date (this drives generated revenue_year/revenue_month)
  const lastDay = new Date(year, monthNumber, 0);
  const revenueDateStr =
    `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;

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
    if (detailHeading) detailHeading.textContent = 'No MDA assigned to your account.';
    if (assignedMdaBadge) assignedMdaBadge.textContent = 'No MDA';
    if (topbarMdaName) topbarMdaName.textContent = 'No MDA';
    return;
  }

  const mdaId = Number(scopes[0].mda_id);
  const branchIdFromScope = scopes[0].branch_id ? Number(scopes[0].branch_id) : null;
  const branchIdFromUrl = branchIdParam ? Number(branchIdParam) : null;

  // If branch-scoped, URL must match
  if (branchIdFromScope && branchIdFromUrl && branchIdFromUrl !== branchIdFromScope) {
    if (detailHeading) detailHeading.textContent = 'Invalid branch context for your scope.';
    return;
  }

  const effectiveBranchId = branchIdFromScope || branchIdFromUrl || null;

  // 4) Load MDA + Branch (optional)
  const [{ data: mda, error: mdaError }, { data: branch }] = await Promise.all([
    supabase.from('mdas').select('id, name').eq('id', mdaId).single(),
    effectiveBranchId
      ? supabase.from('mda_branches').select('id, name').eq('id', effectiveBranchId).single()
      : Promise.resolve({ data: null })
  ]);

  if (mdaError || !mda) {
    if (detailHeading) detailHeading.textContent = 'Assigned MDA not found.';
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
    if (detailHeading) detailHeading.textContent = 'Revenue source not found for your MDA.';
    return;
  }

  if (source.is_active === false) {
    if (detailHeading) detailHeading.textContent = 'Revenue source is inactive.';
    return;
  }

  if (sourceCodeLabel) sourceCodeLabel.textContent = `Code: ${source.code || '—'}`;
  if (sourceNameLabel) sourceNameLabel.textContent = source.name || '—';

  // 5b) Load approved budget for this source + year
  const { data: budgetRow, error: budgetError } = await supabase
    .from('revenue_source_budgets')
    .select('approved_budget')
    .eq('revenue_source_id', source.id)
    .eq('budget_year', year)
    .maybeSingle();

  if (budgetError) console.error('Error loading revenue_source_budgets:', budgetError);

  const approvedBudget = budgetRow?.approved_budget ?? null;
  if (approvedBudgetLabel) {
    approvedBudgetLabel.textContent = approvedBudget === null ? '—' : formatNaira(approvedBudget);
  }

  function setMonthUi(amount) {
    if (monthTotalLabel) monthTotalLabel.textContent = formatNaira(amount);
    if (currentRecordedLabel) currentRecordedLabel.textContent = formatNaira(amount);
    if (monthAmountInput) monthAmountInput.value = String(Number(amount) || 0);
  }

  // 6) Load current month value
  // Since revenue_year/revenue_month/branch_scope_key are GENERATED in your DB,
  // we can filter by them safely, but we do NOT insert them. [web:374]
  async function loadCurrentMonthValue() {
    let q = supabase
      .from('revenues')
      .select('id, amount, revenue_year, revenue_month, branch_scope_key, branch_id')
      .eq('mda_id', mda.id)
      .eq('revenue_source_id', source.id)
      .eq('revenue_year', year)
      .eq('revenue_month', monthNumber)
      .limit(1);

    if (effectiveBranchId) q = q.eq('branch_id', effectiveBranchId);
    else q = q.is('branch_id', null);

    const { data, error } = await q;
    if (error) {
      console.error('Error loading month value:', error);
      return 0;
    }

    const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
    return row ? Number(row.amount) || 0 : 0;
  }

  async function reload() {
    const amount = await loadCurrentMonthValue();
    setMonthUi(amount);
    return amount;
  }

  setStatus('');
  await reload();

  // 7) Save (UPSERT)
  if (btnSaveMonth) {
    btnSaveMonth.addEventListener('click', async () => {
      const raw = (monthAmountInput?.value || '').trim();
      if (raw === '') {
        setStatus('Please enter an amount (use 0 to clear).', 'warn');
        return;
      }

      const amount = Number(raw);
      if (Number.isNaN(amount) || amount < 0) {
        setStatus('Invalid amount. Enter a value of 0 or greater.', 'warn');
        return;
      }

      try {
        setSaving(true);
        setStatus('Saving...', 'slate');

        // IMPORTANT:
        // Do NOT send generated columns (revenue_year, revenue_month, branch_scope_key).
        // Postgres computes them from revenue_date / branch_id. [web:374]
        const row = {
          mda_id: mda.id,
          revenue_source_id: source.id,
          amount,
          revenue_date: revenueDateStr,
          created_by: user.id,
          branch_id: effectiveBranchId || null
        };

        const { error: upsertError } = await supabase
          .from('revenues')
          .upsert([row], {
            onConflict: 'mda_id,revenue_source_id,branch_scope_key,revenue_year,revenue_month'
          });

        if (upsertError) throw upsertError;

        await reload();
        setStatus('Saved successfully.', 'success');
      } catch (err) {
        console.error('Save failed:', err);
        try { console.error('Save error JSON:', JSON.stringify(err, null, 2)); } catch (_) {}
        setStatus(`Failed to save: ${err?.message || 'Please try again.'}`, 'error');
      } finally {
        setSaving(false);
      }
    });
  }

  // 8) Back button -> revenue-monthly.html
  if (btnBackToMonthly) {
    btnBackToMonthly.addEventListener('click', () => {
      const urlParams = new URLSearchParams({
        revenue_source_id: String(source.id),
        year: String(year),
        ...(effectiveBranchId ? { branch_id: String(effectiveBranchId) } : {})
      });
      window.location.href = `revenue-monthly.html?${urlParams.toString()}`;
    });
  }
})();
