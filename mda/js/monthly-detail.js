// mda/js/monthly-detail.js

(async () => {
  const supabase = window.supabaseClient;
  if (!supabase) return;

  // -------------------------
  // DOM helpers
  // -------------------------
  const el = (id) => document.getElementById(id);

  const topbarUserName = el('topbarUserName');
  const topbarUserInitial = el('topbarUserInitial');
  const topbarMdaName = el('topbarMdaName');

  const detailHeading = el('detailHeading');
  const detailSubheading = el('detailSubheading');
  const reportingMonthLabel = el('reportingMonthLabel');
  const assignedMdaBadge = el('assignedMdaBadge');
  const btnBackToMonthly = el('btnBackToMonthly');
  const saveStatus = el('saveStatus');

  const sourceCodeLabel = el('sourceCodeLabel');
  const sourceNameLabel = el('sourceNameLabel');
  const approvedBudgetLabel = el('approvedBudgetLabel');
  const monthTotalLabel = el('monthTotalLabel');

  const currentRecordedLabel = el('currentRecordedLabel');
  const monthAmountInput = el('monthAmountInput');
  const btnSaveMonth = el('btnSaveMonth');

  // Daily UI
  const calendarGrid = el('calendarGrid');

  const selectedDateLabel = el('selectedDateLabel'); // desktop panel
  const dayAmountInput = el('dayAmountInput');
  const btnSaveDay = el('btnSaveDay');
  const daySaveStatus = el('daySaveStatus');
  const manualNote = el('manualNote');
  const monthRunningTotalLabel = el('monthRunningTotalLabel');

  // Mobile drawer
  const btnOpenDayPanel = el('btnOpenDayPanel');
  const dayPanelOverlay = el('dayPanelOverlay');
  const btnCloseDayPanel = el('btnCloseDayPanel');
  const selectedDateLabelMobile = el('selectedDateLabelMobile');
  const dayAmountInputMobile = el('dayAmountInputMobile');
  const btnSaveDayMobile = el('btnSaveDayMobile');
  const daySaveStatusMobile = el('daySaveStatusMobile');
  const manualNoteMobile = el('manualNoteMobile');

  const monthNames = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
  ];

  // -------------------------
  // Utils
  // -------------------------
  function formatNaira(n) {
    const val = Number(n) || 0;
    return '₦' + val.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function parseYear(v, fallbackYear) {
    const n = Number(String(v || '').trim());
    if (!Number.isFinite(n) || n < 1900 || n > 2200) return fallbackYear;
    return n;
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function toDateStr(y, m, d) {
    return `${y}-${pad2(m)}-${pad2(d)}`;
  }

  function monthRange(year, monthNumber) {
    const start = `${year}-${pad2(monthNumber)}-01`;
    const nextMonth = new Date(year, monthNumber, 1); // monthNumber is 1-12 -> this becomes next month
    const endExclusive = `${nextMonth.getFullYear()}-${pad2(nextMonth.getMonth() + 1)}-01`;
    return { start, endExclusive };
  }

  function lastDayOfMonthStr(year, monthNumber) {
    const lastDay = new Date(year, monthNumber, 0);
    return `${lastDay.getFullYear()}-${pad2(lastDay.getMonth() + 1)}-${pad2(lastDay.getDate())}`;
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

  function setSavingMonth(isSaving) {
    if (!btnSaveMonth) return;
    btnSaveMonth.disabled = !!isSaving;
    btnSaveMonth.classList.toggle('opacity-60', !!isSaving);
    btnSaveMonth.classList.toggle('cursor-not-allowed', !!isSaving);
  }

  function setSavingDay(isSaving) {
    const btns = [btnSaveDay, btnSaveDayMobile].filter(Boolean);
    btns.forEach(b => {
      b.disabled = !!isSaving;
      b.classList.toggle('opacity-60', !!isSaving);
      b.classList.toggle('cursor-not-allowed', !!isSaving);
    });
  }

  function setDayStatus(text, tone = 'slate') {
    const els = [daySaveStatus, daySaveStatusMobile].filter(Boolean);
    const color =
      tone === 'success' ? 'text-emerald-700'
      : tone === 'warn' ? 'text-amber-700'
      : tone === 'error' ? 'text-red-600'
      : 'text-slate-500';
    els.forEach(e => {
      e.textContent = text || '';
      e.className = `mt-2 text-[11px] ${color}`;
    });
  }

  function setManualNoteVisible(isManual) {
    if (manualNote) manualNote.classList.toggle('hidden', !isManual);
    if (manualNoteMobile) manualNoteMobile.classList.toggle('hidden', !isManual);
  }

  function openMobilePanel() {
    if (!dayPanelOverlay) return;
    dayPanelOverlay.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  }

  function closeMobilePanel() {
    if (!dayPanelOverlay) return;
    dayPanelOverlay.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  }

  // -------------------------
  // Read query params
  // -------------------------
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
    detailSubheading.textContent = 'Record daily amounts (recommended) or enter a single monthly total.';
  }

  const revenueDateStr = lastDayOfMonthStr(year, monthNumber); // monthly summary uses last day
  const { start: monthStart, endExclusive: nextMonthStart } = monthRange(year, monthNumber);

  // -------------------------
  // Session + profile
  // -------------------------
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

  // -------------------------
  // Resolve primary scope
  // -------------------------
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

  if (branchIdFromScope && branchIdFromUrl && branchIdFromUrl !== branchIdFromScope) {
    if (detailHeading) detailHeading.textContent = 'Invalid branch context for your scope.';
    return;
  }

  const effectiveBranchId = branchIdFromScope || branchIdFromUrl || null;

  // -------------------------
  // Load MDA + Branch
  // -------------------------
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

  // -------------------------
  // Load revenue source (validate belongs to MDA)
  // -------------------------
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

  // -------------------------
  // Approved budget
  // -------------------------
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

  // -------------------------
  // Month summary loader
  // -------------------------
  function setMonthUi(amount) {
    if (monthTotalLabel) monthTotalLabel.textContent = formatNaira(amount);
    if (monthRunningTotalLabel) monthRunningTotalLabel.textContent = formatNaira(amount);
    if (currentRecordedLabel) currentRecordedLabel.textContent = formatNaira(amount);
    if (monthAmountInput) monthAmountInput.value = String(Number(amount) || 0);
  }

  async function loadMonthSummaryRow() {
    let q = supabase
      .from('revenues')
      .select('id, amount, is_manual, branch_id')
      .eq('mda_id', mda.id)
      .eq('revenue_source_id', source.id)
      .eq('revenue_year', year)
      .eq('revenue_month', monthNumber)
      .limit(1);

    if (effectiveBranchId) q = q.eq('branch_id', effectiveBranchId);
    else q = q.is('branch_id', null);

    const { data, error } = await q;
    if (error) {
      console.error('Error loading month summary:', error);
      return { amount: 0, is_manual: false };
    }

    const row = Array.isArray(data) && data.length ? data[0] : null;
    return {
      amount: row ? Number(row.amount) || 0 : 0,
      is_manual: row ? !!row.is_manual : false
    };
  }

  async function reloadMonthSummary() {
    const ms = await loadMonthSummaryRow();
    setMonthUi(ms.amount);
    setManualNoteVisible(ms.is_manual);
    return ms;
  }

  // -------------------------
  // Daily entries state + calendar
  // -------------------------
  const dayAmountMap = new Map(); // 'YYYY-MM-DD' -> amount
  let selectedDateStr = null;
  let selectedDay = null;

  function daysInMonth(year, monthNumber) {
    return new Date(year, monthNumber, 0).getDate();
  }

  function firstDow(year, monthNumber) {
    return new Date(year, monthNumber - 1, 1).getDay(); // 0=Sun
  }

  function isToday(dateStr) {
    const t = new Date();
    const todayStr = `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`;
    return dateStr === todayStr;
  }

  function cellTone({ hasRecord, isSelected, isTodayCell }) {
    if (isSelected) return 'border-slate-900 ring-1 ring-slate-900 bg-slate-50';
    if (isTodayCell) return 'border-blue-600 bg-blue-50';
    if (hasRecord) return 'border-emerald-200 bg-emerald-50 hover:bg-emerald-50';
    return 'border-slate-200 bg-white hover:bg-slate-50';
  }

  function renderCalendar() {
    if (!calendarGrid) return;
    calendarGrid.innerHTML = '';

    const lead = firstDow(year, monthNumber);
    const dim = daysInMonth(year, monthNumber);

    // leading blanks
    for (let i = 0; i < lead; i++) {
      const blank = document.createElement('div');
      blank.className = 'h-16 rounded-md border border-transparent';
      calendarGrid.appendChild(blank);
    }

    for (let d = 1; d <= dim; d++) {
      const dateStr = toDateStr(year, monthNumber, d);
      const amt = dayAmountMap.get(dateStr);
      const hasRecord = (Number(amt) || 0) > 0;
      const selected = selectedDateStr === dateStr;
      const todayCell = isToday(dateStr);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className =
        'h-16 rounded-md border px-2 py-1 text-left transition ' +
        cellTone({ hasRecord, isSelected: selected, isTodayCell: todayCell });

      const dotClass = selected ? 'bg-slate-900' : (todayCell ? 'bg-blue-600' : (hasRecord ? 'bg-emerald-600' : 'bg-slate-300'));

      btn.innerHTML = `
        <div class="flex items-center justify-between">
          <div class="text-xs font-semibold text-slate-900">${d}</div>
          <span class="cal-dot ${dotClass}"></span>
        </div>
        <div class="mt-1 text-[10px] ${hasRecord ? 'text-emerald-800' : 'text-slate-400'}">
          ${hasRecord ? formatNaira(amt) : 'No record'}
        </div>
      `;

      btn.addEventListener('click', () => {
        selectedDay = d;
        selectedDateStr = dateStr;

        // Fill panel labels + inputs
        if (selectedDateLabel) selectedDateLabel.textContent = dateStr;
        if (selectedDateLabelMobile) selectedDateLabelMobile.textContent = dateStr;

        const existing = dayAmountMap.get(dateStr);
        if (dayAmountInput) dayAmountInput.value = existing !== undefined ? String(existing) : '';
        if (dayAmountInputMobile) dayAmountInputMobile.value = existing !== undefined ? String(existing) : '';

        setDayStatus('');

        // On mobile, open drawer
        if (window.innerWidth < 1024) openMobilePanel();

        renderCalendar();
      });

      calendarGrid.appendChild(btn);
    }
  }

  async function loadDailyEntries() {
    let q = supabase
      .from('revenue_daily_entries')
      .select('revenue_date, amount, branch_id')
      .eq('mda_id', mda.id)
      .eq('revenue_source_id', source.id)
      .gte('revenue_date', monthStart)
      .lt('revenue_date', nextMonthStart); // date range filters are supported via .gte/.lt. [web:41]

    if (effectiveBranchId) q = q.eq('branch_id', effectiveBranchId);
    else q = q.is('branch_id', null);

    const { data, error } = await q;
    if (error) {
      console.error('Error loading daily entries:', error);
      return;
    }

    dayAmountMap.clear();
    (data || []).forEach(r => {
      if (!r?.revenue_date) return;
      dayAmountMap.set(r.revenue_date, Number(r.amount) || 0);
    });
  }

  // -------------------------
  // Save daily via RPC
  // -------------------------
  async function saveDailyAmount(amount) {
    if (!selectedDateStr) {
      setDayStatus('Select a day on the calendar first.', 'warn');
      return false;
    }

    if (!Number.isFinite(amount) || amount < 0) {
      setDayStatus('Invalid amount. Enter 0 or greater.', 'warn');
      return false;
    }

    try {
      setSavingDay(true);
      setDayStatus('Saving...', 'slate');

      // supabase.rpc calls a Postgres function with arguments. [web:31]
      const { data, error } = await supabase.rpc('record_daily_revenue', {
        p_mda_id: mda.id,
        p_revenue_source_id: source.id,
        p_branch_id: effectiveBranchId,
        p_revenue_date: selectedDateStr,
        p_amount: amount,
        p_created_by: user.id
      });

      if (error) throw error;

      // Update local map immediately
      dayAmountMap.set(selectedDateStr, amount);

      // Update month total from RPC response (function returns table)
      const ret = Array.isArray(data) ? data[0] : data;
      const monthTotal = ret?.month_total ?? null;
      const monthIsManual = !!ret?.month_is_manual;

      if (monthTotal !== null) {
        if (monthTotalLabel) monthTotalLabel.textContent = formatNaira(monthTotal);
        if (monthRunningTotalLabel) monthRunningTotalLabel.textContent = formatNaira(monthTotal);
        if (currentRecordedLabel) currentRecordedLabel.textContent = formatNaira(monthTotal);
      }

      setManualNoteVisible(monthIsManual);

      setDayStatus(
        monthIsManual
          ? 'Saved daily amount (monthly manual total was not changed).'
          : 'Saved daily amount (month total updated).',
        'success'
      );

      renderCalendar();
      return true;
    } catch (err) {
      console.error('Daily save failed:', err);
      try { console.error('Daily save error JSON:', JSON.stringify(err, null, 2)); } catch (_) {}
      setDayStatus(`Failed to save day: ${err?.message || 'Please try again.'}`, 'error');
      return false;
    } finally {
      setSavingDay(false);
    }
  }

  // -------------------------
  // Monthly save (manual)
  // -------------------------
  async function saveMonthlyTotal() {
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
      setSavingMonth(true);
      setStatus('Saving...', 'slate');

      // Mark monthly record as manual so daily rollups won’t overwrite it.
      const row = {
        mda_id: mda.id,
        revenue_source_id: source.id,
        amount,
        revenue_date: revenueDateStr,
        created_by: user.id,
        branch_id: effectiveBranchId || null,
        is_manual: true
      };

      const { error: upsertError } = await supabase
        .from('revenues')
        .upsert([row], {
          onConflict: 'mda_id,revenue_source_id,branch_scope_key,revenue_year,revenue_month'
        });

      if (upsertError) throw upsertError;

      const ms = await reloadMonthSummary();
      setStatus('Saved successfully.', 'success');

      // If user made it manual, show note
      setManualNoteVisible(ms.is_manual);
    } catch (err) {
      console.error('Monthly save failed:', err);
      try { console.error('Monthly save error JSON:', JSON.stringify(err, null, 2)); } catch (_) {}
      setStatus(`Failed to save: ${err?.message || 'Please try again.'}`, 'error');
    } finally {
      setSavingMonth(false);
    }
  }

  // -------------------------
  // Initial load
  // -------------------------
  setStatus('');

  // Load month summary first (so the page has totals immediately)
  await reloadMonthSummary();

  // Load daily entries + render calendar
  await loadDailyEntries();
  renderCalendar();

  // Default selection: today (if inside the month), otherwise day 1
  const t = new Date();
  const todayStr = `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`;
  if (todayStr.startsWith(`${year}-${pad2(monthNumber)}-`)) {
    selectedDateStr = todayStr;
    selectedDay = Number(todayStr.slice(-2));
  } else {
    selectedDay = 1;
    selectedDateStr = toDateStr(year, monthNumber, 1);
  }

  // Fill selected labels/inputs
  if (selectedDateLabel) selectedDateLabel.textContent = selectedDateStr;
  if (selectedDateLabelMobile) selectedDateLabelMobile.textContent = selectedDateStr;

  const existing = dayAmountMap.get(selectedDateStr);
  if (dayAmountInput) dayAmountInput.value = existing !== undefined ? String(existing) : '';
  if (dayAmountInputMobile) dayAmountInputMobile.value = existing !== undefined ? String(existing) : '';

  renderCalendar();

  // -------------------------
  // Events
  // -------------------------
  if (btnSaveMonth) btnSaveMonth.addEventListener('click', saveMonthlyTotal);

  if (btnSaveDay) {
    btnSaveDay.addEventListener('click', async () => {
      const amount = Number((dayAmountInput?.value || '').trim());
      await saveDailyAmount(amount);
    });
  }

  if (btnSaveDayMobile) {
    btnSaveDayMobile.addEventListener('click', async () => {
      const amount = Number((dayAmountInputMobile?.value || '').trim());
      const ok = await saveDailyAmount(amount);
      if (ok) closeMobilePanel();
    });
  }

  if (btnOpenDayPanel) btnOpenDayPanel.addEventListener('click', openMobilePanel);

  if (btnCloseDayPanel) btnCloseDayPanel.addEventListener('click', closeMobilePanel);

  if (dayPanelOverlay) {
    // click backdrop to close
    dayPanelOverlay.addEventListener('click', (e) => {
      const clickedBackdrop = e.target === dayPanelOverlay || e.target?.classList?.contains('bg-slate-900/50');
      if (clickedBackdrop) closeMobilePanel();
    });
  }

  // Back button -> revenue-monthly.html
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
