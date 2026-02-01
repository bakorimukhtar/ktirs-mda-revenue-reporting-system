const topbarUserName = document.getElementById('topbarUserName');
const topbarUserInitial = document.getElementById('topbarUserInitial');

const mdaNameHeading = document.getElementById('mdaNameHeading');
const mdaCodeCategory = document.getElementById('mdaCodeCategory');
const mdaStatusBadge = document.getElementById('mdaStatusBadge');

const cardApprovedBudget = document.getElementById('cardApprovedBudget');
const cardCollected = document.getElementById('cardCollected');
const cardPerformance = document.getElementById('cardPerformance');

const revenueSourcesTableBody = document.getElementById('revenueSourcesTableBody');
const branchTableBody = document.getElementById('branchTableBody');
const officersTableBody = document.getElementById('officersTableBody');
const pageMessage = document.getElementById('pageMessage');

const btnGenerateReport = document.getElementById('btnGenerateReport');
const btnAddRevenueSource = document.getElementById('btnAddRevenueSource');

// Year filter (from updated HTML)
const budgetYearPicker = document.getElementById('budgetYearPicker');
const budgetYearBadge = document.getElementById('budgetYearBadge');

// Modal elements
const revenueSourceModal = document.getElementById('revenueSourceModal');
const revenueSourceModalTitle = document.getElementById('revenueSourceModalTitle');
const revenueSourceModalClose = document.getElementById('revenueSourceModalClose');
const revenueSourceForm = document.getElementById('revenueSourceForm');
const revenueSourceIdInput = document.getElementById('revenueSourceId');
const revenueSourceNameInput = document.getElementById('revenueSourceName');
const revenueSourceCodeInput = document.getElementById('revenueSourceCode');
const revenueSourceBudgetInput = document.getElementById('revenueSourceBudget');
const revenueSourceYearInput = document.getElementById('revenueSourceYear');
const revenueSourceSubmitBtn = document.getElementById('revenueSourceSubmitBtn');
const revenueSourceSubmitLabel = document.getElementById('revenueSourceSubmitLabel');
const revenueSourceResetBtn = document.getElementById('revenueSourceResetBtn');
const revenueSourceFormMessage = document.getElementById('revenueSourceFormMessage');

// In-memory data
let currentMdaId = null;
let selectedYear = new Date().getFullYear();

let currentMda = null;
let revenueSources = []; // each item will get `approved_budget` for selectedYear (computed)
let revenuesBySource = {};
let revenuesByBranch = {}; // branch_id -> sum(amount); 'hq' for no-branch
let branchLookup = {}; // branch_id -> { id, name, code }
let scopesCache = [];
let profilesCache = [];

// -------------------- Helpers --------------------
function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

function formatCurrency(value) {
  const num = Number(value || 0);
  return '₦' + num.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPercent(numerator, denominator) {
  const num = Number(numerator || 0);
  const den = Number(denominator || 0);
  if (!den || den === 0) return '0%';
  const pct = (num / den) * 100;
  return pct.toFixed(1) + '%';
}

function parseYear(v, fallbackYear) {
  const n = Number(String(v || '').trim());
  if (!Number.isFinite(n) || n < 1900 || n > 2200) return fallbackYear;
  return n;
}

function yearRange(year) {
  const start = `${year}-01-01`;
  const end = `${year + 1}-01-01`;
  return { start, end };
}

function setSelectedYear(year) {
  selectedYear = parseYear(year, new Date().getFullYear());
  if (budgetYearPicker) budgetYearPicker.value = String(selectedYear);
  if (budgetYearBadge) budgetYearBadge.textContent = String(selectedYear);
}

function setPageMessage(msg) {
  if (pageMessage) pageMessage.textContent = msg || '';
}

function setRevenueModalMessage(msg) {
  if (revenueSourceFormMessage) revenueSourceFormMessage.textContent = msg || '';
}

function setRevenueModalBtn(loading) {
  if (!revenueSourceSubmitBtn || !revenueSourceSubmitLabel) return;
  revenueSourceSubmitBtn.disabled = !!loading;
  revenueSourceSubmitLabel.textContent = revenueSourceIdInput?.value
    ? (loading ? 'Updating...' : 'Update source')
    : (loading ? 'Saving...' : 'Save source');
}

// -------------------- Modal --------------------
function showRevenueSourceModal(mode, source) {
  if (!revenueSourceModal) return;
  setRevenueModalMessage('');

  if (mode === 'create') {
    if (revenueSourceModalTitle) revenueSourceModalTitle.textContent = 'Add revenue source';
    if (revenueSourceIdInput) revenueSourceIdInput.value = '';
    if (revenueSourceNameInput) revenueSourceNameInput.value = '';
    if (revenueSourceCodeInput) revenueSourceCodeInput.value = '';
    if (revenueSourceBudgetInput) revenueSourceBudgetInput.value = '';
    if (revenueSourceYearInput) revenueSourceYearInput.value = String(selectedYear);
    if (revenueSourceSubmitLabel) revenueSourceSubmitLabel.textContent = 'Save source';
  } else if (mode === 'edit' && source) {
    if (revenueSourceModalTitle) revenueSourceModalTitle.textContent = 'Edit revenue source';
    if (revenueSourceIdInput) revenueSourceIdInput.value = String(source.id);
    if (revenueSourceNameInput) revenueSourceNameInput.value = source.name || '';
    if (revenueSourceCodeInput) revenueSourceCodeInput.value = source.code || '';

    // These are computed for the currently selectedYear
    if (revenueSourceBudgetInput) {
      revenueSourceBudgetInput.value =
        source.approved_budget === null || source.approved_budget === undefined
          ? ''
          : String(source.approved_budget);
    }
    if (revenueSourceYearInput) revenueSourceYearInput.value = String(selectedYear);

    if (revenueSourceSubmitLabel) revenueSourceSubmitLabel.textContent = 'Update source';
  }

  revenueSourceModal.classList.remove('hidden');
  revenueSourceModal.classList.add('flex');

  if (window.lucide) window.lucide.createIcons();
}

function closeRevenueSourceModal() {
  if (!revenueSourceModal) return;
  revenueSourceModal.classList.add('hidden');
  revenueSourceModal.classList.remove('flex');
}

// -------------------- Data loading --------------------
async function requireAdmin(supabase) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;

  if (sessionError || !user) {
    window.location.href = '../index.html';
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('full_name, global_role, email, user_id')
    .eq('user_id', user.id)
    .single();

  if (profileError || !profile || profile.global_role !== 'admin') {
    window.location.href = '../index.html';
    return null;
  }

  const name =
    profile.full_name && profile.full_name.trim().length > 0
      ? profile.full_name.trim()
      : user.email || 'Admin User';

  if (topbarUserName) topbarUserName.textContent = name;
  if (topbarUserInitial) topbarUserInitial.textContent = name.charAt(0).toUpperCase();

  return { user, profile };
}

async function loadMda(supabase) {
  const { data: mda, error } = await supabase
    .from('mdas')
    .select('id, name, code, category, is_active')
    .eq('id', currentMdaId)
    .single();

  if (error || !mda) {
    console.error('Error loading MDA:', error);
    setPageMessage('Unable to load MDA. Return to registry and try again.');
    return null;
  }

  currentMda = mda;

  if (mdaNameHeading) mdaNameHeading.textContent = mda.name || '—';
  const categoryLabel = mda.category || 'MDA';
  if (mdaCodeCategory) mdaCodeCategory.textContent = `${mda.code || '—'} • ${categoryLabel}`;

  if (mdaStatusBadge) {
    if (mda.is_active) {
      mdaStatusBadge.textContent = 'Active';
      mdaStatusBadge.className =
        'inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 px-2.5 py-1 text-[11px] font-medium';
    } else {
      mdaStatusBadge.textContent = 'Inactive';
      mdaStatusBadge.className =
        'inline-flex items-center rounded-full bg-slate-50 text-slate-600 border border-slate-200 px-2.5 py-1 text-[11px] font-medium';
    }
  }

  return mda;
}

async function loadBranches(supabase) {
  const { data: branches, error } = await supabase
    .from('mda_branches')
    .select('id, name, code, is_active')
    .eq('mda_id', currentMdaId)
    .order('name', { ascending: true });

  if (error) console.error('Error loading branches:', error);

  branchLookup = {};
  (branches || []).forEach((b) => {
    branchLookup[b.id] = b;
  });
}

async function loadOfficers(supabase) {
  const { data: scopes, error: scopesError } = await supabase
    .from('user_scopes')
    .select('id, user_id, mda_id, branch_id')
    .eq('mda_id', currentMdaId);

  if (scopesError) console.error('Error loading MDA scopes:', scopesError);
  scopesCache = scopes || [];

  let officersProfiles = [];
  if (scopesCache.length > 0) {
    const userIds = [...new Set(scopesCache.map((s) => s.user_id))];
    const { data: profilesForMda, error: profilesError } = await supabase
      .from('profiles')
      .select('user_id, email, full_name, global_role')
      .in('user_id', userIds);

    if (profilesError) console.error('Error loading officer profiles:', profilesError);
    else officersProfiles = profilesForMda || [];
  }

  profilesCache = officersProfiles;
}

async function loadRevenueSources(supabase) {
  const { data: sources, error } = await supabase
    .from('revenue_sources')
    .select('id, name, code, is_active')
    .eq('mda_id', currentMdaId)
    .order('name', { ascending: true });

  if (error) console.error('Error loading revenue sources:', error);
  revenueSources = sources || [];
}

async function loadBudgetsForSelectedYear(supabase) {
  const ids = (revenueSources || []).map((s) => s.id);
  const budgetMap = new Map();

  if (ids.length > 0) {
    const { data: budgets, error } = await supabase
      .from('revenue_source_budgets')
      .select('revenue_source_id, budget_year, approved_budget')
      .eq('budget_year', selectedYear)
      .in('revenue_source_id', ids);

    if (error) console.error('Error loading revenue_source_budgets:', error);

    (budgets || []).forEach((b) => {
      budgetMap.set(b.revenue_source_id, b);
    });
  }

  // Attach computed approved_budget for selectedYear onto each source for rendering/modal edit
  revenueSources = (revenueSources || []).map((s) => {
    const b = budgetMap.get(s.id);
    return {
      ...s,
      approved_budget: b ? b.approved_budget : null,
      budget_year: selectedYear,
    };
  });
}

async function loadRevenuesForSelectedYear(supabase) {
  const { start, end } = yearRange(selectedYear);

  // Filter by revenue_date range (works even if revenue_year is null)
  const { data: revenues, error } = await supabase
    .from('revenues')
    .select('amount, revenue_source_id, branch_id, revenue_date')
    .eq('mda_id', currentMdaId)
    .gte('revenue_date', start)
    .lt('revenue_date', end);

  if (error) console.error('Error loading revenues:', error);

  revenuesBySource = {};
  revenuesByBranch = {};

  (revenues || []).forEach((r) => {
    const amt = Number(r.amount || 0);

    if (!revenuesBySource[r.revenue_source_id]) revenuesBySource[r.revenue_source_id] = 0;
    revenuesBySource[r.revenue_source_id] += amt;

    const key = r.branch_id ? String(r.branch_id) : 'hq';
    if (!revenuesByBranch[key]) revenuesByBranch[key] = 0;
    revenuesByBranch[key] += amt;
  });
}

// -------------------- Rendering --------------------
function renderOfficersTable(scopes, profiles) {
  if (!officersTableBody) return;

  officersTableBody.innerHTML = '';

  if (!scopes || scopes.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.className = 'px-3 py-4 text-center text-slate-500';
    td.textContent = 'No officers currently assigned to this MDA.';
    tr.appendChild(td);
    officersTableBody.appendChild(tr);
    return;
  }

  const profileByUserId = {};
  (profiles || []).forEach((p) => {
    profileByUserId[p.user_id] = p;
  });

  scopes.forEach((scope) => {
    const profile = profileByUserId[scope.user_id];
    if (!profile) return;

    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50';

    const tdName = document.createElement('td');
    tdName.className = 'px-3 py-2 align-middle';
    tdName.textContent = profile.full_name || profile.email || '—';
    tr.appendChild(tdName);

    const tdEmail = document.createElement('td');
    tdEmail.className = 'px-3 py-2 align-middle text-slate-700';
    tdEmail.textContent = profile.email || '—';
    tr.appendChild(tdEmail);

    const tdRole = document.createElement('td');
    tdRole.className = 'px-3 py-2 align-middle';
    tdRole.textContent = profile.global_role === 'admin' ? 'Administrator' : 'MDA user';
    tr.appendChild(tdRole);

    const tdAssignment = document.createElement('td');
    tdAssignment.className = 'px-3 py-2 align-middle text-right text-[11px] text-slate-600';

    let assignment = 'MDA-wide (no specific branch)';
    if (scope.branch_id) {
      const branch = branchLookup[scope.branch_id];
      assignment = branch ? `Branch: ${branch.name}` : `Branch ID ${scope.branch_id}`;
    }

    tdAssignment.textContent = assignment;
    tr.appendChild(tdAssignment);

    officersTableBody.appendChild(tr);
  });
}

function renderRevenueSourcesTable() {
  if (!revenueSourcesTableBody) return;

  revenueSourcesTableBody.innerHTML = '';

  if (!revenueSources || revenueSources.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.className = 'px-3 py-4 text-center text-slate-500';
    td.textContent = 'No revenue sources defined for this MDA yet.';
    tr.appendChild(td);
    revenueSourcesTableBody.appendChild(tr);

    // Cards fall back to zero
    if (cardApprovedBudget) cardApprovedBudget.textContent = formatCurrency(0);
    if (cardCollected) cardCollected.textContent = formatCurrency(0);
    if (cardPerformance) cardPerformance.textContent = '0%';

    return;
  }

  let totalApproved = 0;
  let totalCollected = 0;

  revenueSources.forEach((src) => {
    const collected = revenuesBySource[src.id] || 0;
    const approved = src.approved_budget === null || src.approved_budget === undefined
      ? 0
      : Number(src.approved_budget || 0);

    totalApproved += approved;
    totalCollected += collected;

    const variance = approved - collected;

    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50';

    const tdName = document.createElement('td');
    tdName.className = 'px-3 py-2 align-middle';
    tdName.textContent = src.name || '—';
    tr.appendChild(tdName);

    const tdCode = document.createElement('td');
    tdCode.className = 'px-3 py-2 align-middle text-slate-700';
    tdCode.textContent = src.code || '—';
    tr.appendChild(tdCode);

    const tdApproved = document.createElement('td');
    tdApproved.className = 'px-3 py-2 align-middle text-right';
    tdApproved.textContent = approved ? formatCurrency(approved) : '—';
    tr.appendChild(tdApproved);

    const tdCollected = document.createElement('td');
    tdCollected.className = 'px-3 py-2 align-middle text-right';
    tdCollected.textContent = collected ? formatCurrency(collected) : '₦0.00';
    tr.appendChild(tdCollected);

    const tdVariance = document.createElement('td');
    tdVariance.className = 'px-3 py-2 align-middle text-right';
    tdVariance.textContent = formatCurrency(variance);
    tr.appendChild(tdVariance);

    const tdActions = document.createElement('td');
    tdActions.className = 'px-3 py-2 align-middle text-right text-[11px] space-x-2';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className =
      'inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => showRevenueSourceModal('edit', src));

    tdActions.appendChild(editBtn);
    tr.appendChild(tdActions);

    revenueSourcesTableBody.appendChild(tr);
  });

  if (cardApprovedBudget) cardApprovedBudget.textContent = formatCurrency(totalApproved);
  if (cardCollected) cardCollected.textContent = formatCurrency(totalCollected);
  if (cardPerformance) cardPerformance.textContent = formatPercent(totalCollected, totalApproved);

  // Lightweight summary line for the selected year
  setPageMessage(
    `Viewing year ${selectedYear} • Approved: ${formatCurrency(totalApproved)} • Collected: ${formatCurrency(totalCollected)} • Performance: ${formatPercent(totalCollected, totalApproved)}`
  );

  if (window.lucide) window.lucide.createIcons();
}

function renderBranchTable() {
  if (!branchTableBody) return;

  branchTableBody.innerHTML = '';

  const entries = Object.entries(revenuesByBranch || {});
  if (!entries || entries.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 2;
    td.className = 'px-3 py-4 text-center text-slate-500';
    td.textContent = 'No NTR records have been captured for this MDA yet.';
    tr.appendChild(td);
    branchTableBody.appendChild(tr);
    return;
  }

  // Sum of all branches (excluding HQ/no-branch)
  let branchesOnlyTotal = 0;
  entries.forEach(([key, total]) => {
    if (key === 'hq') return;
    branchesOnlyTotal += Number(total || 0);
  });

  // HQ row
  const trHq = document.createElement('tr');
  trHq.className = 'hover:bg-slate-50';

  const tdHqName = document.createElement('td');
  tdHqName.className = 'px-3 py-2 align-middle';
  tdHqName.textContent = 'Headquarters / MDA-level';
  trHq.appendChild(tdHqName);

  const tdHqTotal = document.createElement('td');
  tdHqTotal.className = 'px-3 py-2 align-middle text-right';
  tdHqTotal.textContent = formatCurrency(branchesOnlyTotal);
  trHq.appendChild(tdHqTotal);

  branchTableBody.appendChild(trHq);

  // Branch rows
  entries.forEach(([key, total]) => {
    if (key === 'hq') return;
    const branchId = Number(key);
    const branch = branchLookup[branchId];

    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50';

    const tdName = document.createElement('td');
    tdName.className = 'px-3 py-2 align-middle';
    tdName.textContent = branch ? branch.name : `Branch ID ${branchId}`;
    tr.appendChild(tdName);

    const tdTotal = document.createElement('td');
    tdTotal.className = 'px-3 py-2 align-middle text-right';
    tdTotal.textContent = formatCurrency(total);
    tr.appendChild(tdTotal);

    branchTableBody.appendChild(tr);
  });
}

// -------------------- Refresh pipeline --------------------
async function refreshYearView() {
  const supabase = window.supabaseClient;
  if (!supabase) return;

  setSelectedYear(budgetYearPicker?.value || selectedYear);

  // Load year-dependent data
  await loadRevenueSources(supabase);
  await loadBudgetsForSelectedYear(supabase);
  await loadRevenuesForSelectedYear(supabase);

  // Render
  renderRevenueSourcesTable();
  renderBranchTable();

  if (window.lucide) window.lucide.createIcons();
}

async function initialLoad() {
  const supabase = window.supabaseClient;
  if (!supabase) {
    setPageMessage('System configuration error. Contact ICT.');
    return;
  }

  const mdaIdParam = getQueryParam('id');
  if (!mdaIdParam) {
    window.location.href = 'mdas.html';
    return;
  }
  currentMdaId = Number(mdaIdParam);

  // default selected year from picker or system year
  setSelectedYear(parseYear(budgetYearPicker?.value, new Date().getFullYear()));

  const ok = await requireAdmin(supabase);
  if (!ok) return;

  const mda = await loadMda(supabase);
  if (!mda) return;

  // load static-ish data
  await loadBranches(supabase);
  await loadOfficers(supabase);

  // render officers early
  renderOfficersTable(scopesCache, profilesCache);

  // then load year view
  await refreshYearView();

  if (window.lucide) window.lucide.createIcons();
}

initialLoad();

// -------------------- Events --------------------
if (budgetYearPicker) {
  budgetYearPicker.addEventListener('change', async () => {
    await refreshYearView();
  });
}

if (btnAddRevenueSource) {
  btnAddRevenueSource.addEventListener('click', () => showRevenueSourceModal('create', null));
}

if (revenueSourceModalClose) {
  revenueSourceModalClose.addEventListener('click', closeRevenueSourceModal);
}

if (revenueSourceModal) {
  revenueSourceModal.addEventListener('click', (e) => {
    if (e.target === revenueSourceModal) closeRevenueSourceModal();
  });
}

if (revenueSourceResetBtn) {
  revenueSourceResetBtn.addEventListener('click', () => {
    setRevenueModalMessage('');
    if (revenueSourceIdInput) revenueSourceIdInput.value = '';
    if (revenueSourceNameInput) revenueSourceNameInput.value = '';
    if (revenueSourceCodeInput) revenueSourceCodeInput.value = '';
    if (revenueSourceBudgetInput) revenueSourceBudgetInput.value = '';
    if (revenueSourceYearInput) revenueSourceYearInput.value = String(selectedYear);
    if (revenueSourceSubmitLabel) revenueSourceSubmitLabel.textContent = 'Save source';
  });
}

if (revenueSourceForm) {
  revenueSourceForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const supabase = window.supabaseClient;
    if (!supabase) return;

    const name = (revenueSourceNameInput?.value || '').trim();
    const code = (revenueSourceCodeInput?.value || '').trim(); // optional
    const budgetStr = (revenueSourceBudgetInput?.value || '').trim(); // optional
    const yearStr = (revenueSourceYearInput?.value || '').trim();

    if (!name) {
      setRevenueModalMessage('Please enter a source name.');
      return;
    }

    const approved_budget = budgetStr ? Number(budgetStr) : null;
    const budget_year = parseYear(yearStr, selectedYear);

    setRevenueModalBtn(true);
    setRevenueModalMessage('');

    try {
      // EDIT
      if (revenueSourceIdInput?.value) {
        const sourceId = Number(revenueSourceIdInput.value);

        // Update source core fields
        const { error: sourceError } = await supabase
          .from('revenue_sources')
          .update({
            name,
            code: code || null, // allow empty
            updated_at: new Date().toISOString(),
          })
          .eq('id', sourceId);

        if (sourceError) {
          console.error('Source update error:', sourceError);
          if (
            sourceError.code === '42501' ||
            (typeof sourceError.message === 'string' && sourceError.message.toLowerCase().includes('rls'))
          ) {
            setRevenueModalMessage('You are not allowed to update revenue sources. Contact the system administrator.');
          } else {
            setRevenueModalMessage('Unable to update revenue source. Please try again.');
          }
          setRevenueModalBtn(false);
          return;
        }

        // Upsert budget for this year (only if budget provided; leaving blank keeps old record untouched)
        if (approved_budget !== null) {
          const { error: budgetError } = await supabase
            .from('revenue_source_budgets')
            .upsert(
              {
                revenue_source_id: sourceId,
                budget_year,
                approved_budget,
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'revenue_source_id,budget_year' }
            );

          if (budgetError) {
            console.error('Budget upsert error:', budgetError);
            setRevenueModalMessage('Updated source, but failed to save budget for this year.');
            setRevenueModalBtn(false);
            return;
          }
        }

        closeRevenueSourceModal();
        await refreshYearView();
        setRevenueModalBtn(false);
        return;
      }

      // CREATE
      const { data: newSource, error: insertError } = await supabase
        .from('revenue_sources')
        .insert({
          mda_id: currentMdaId,
          name,
          code: code || null, // allow empty + duplicates (DB must not have unique constraint)
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (insertError || !newSource?.id) {
        console.error('Source insert error:', insertError);
        if (
          insertError?.code === '42501' ||
          (typeof insertError?.message === 'string' && insertError.message.toLowerCase().includes('rls'))
        ) {
          setRevenueModalMessage('You are not allowed to create revenue sources. Contact the system administrator.');
        } else {
          setRevenueModalMessage('Unable to create revenue source. Please try again.');
        }
        setRevenueModalBtn(false);
        return;
      }

      // Create budget record (optional)
      if (approved_budget !== null) {
        const { error: budgetError } = await supabase
          .from('revenue_source_budgets')
          .upsert(
            {
              revenue_source_id: newSource.id,
              budget_year,
              approved_budget,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'revenue_source_id,budget_year' }
          );

        if (budgetError) {
          console.error('Budget insert/upsert error:', budgetError);
          setRevenueModalMessage('Created revenue source, but failed to save budget for this year.');
          setRevenueModalBtn(false);
          return;
        }
      }

      closeRevenueSourceModal();
      await refreshYearView();
    } catch (err) {
      console.error('Unexpected revenue source save error:', err);
      setRevenueModalMessage('Unexpected error while saving. Please try again.');
    } finally {
      setRevenueModalBtn(false);
      if (window.lucide) window.lucide.createIcons();
    }
  });
}

if (btnGenerateReport) {
  btnGenerateReport.addEventListener('click', () => {
    const id = currentMdaId || Number(getQueryParam('id') || 0);
    if (!id) {
      alert('Missing MDA id. Please go back and open this MDA again.');
      return;
    }
    window.location.href = `mda-report.html?id=${encodeURIComponent(String(id))}`;
  });
}
