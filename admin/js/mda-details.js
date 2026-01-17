const topbarUserName = document.getElementById('topbarUserName');
const topbarUserInitial = document.getElementById('topbarUserInitial');

const mdaNameHeading = document.getElementById('mdaNameHeading');
const mdaCodeCategory = document.getElementById('mdaCodeCategory');
const mdaStatusBadge = document.getElementById('mdaStatusBadge');

const cardApprovedBudget = document.getElementById('cardApprovedBudget');
const cardCollected = document.getElementById('cardCollected');
const cardPerformance = document.getElementById('cardPerformance');

const revenueSourcesTableBody = document.getElementById('revenueSourcesTableBody');
const zoneTableBody = document.getElementById('zoneTableBody');
const lgaTableBody = document.getElementById('lgaTableBody');
const officersTableBody = document.getElementById('officersTableBody');
const pageMessage = document.getElementById('pageMessage');

const btnGenerateReport = document.getElementById('btnGenerateReport');
const btnAddRevenueSource = document.getElementById('btnAddRevenueSource');

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
let currentYear = new Date().getFullYear();
let revenueSources = [];
let revenuesBySource = {};
let revenuesByZone = {};
let revenuesByLga = {};

// Helpers
function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

function formatCurrency(value) {
  const num = Number(value || 0);
  return '₦' + num.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatPercent(numerator, denominator) {
  const num = Number(numerator || 0);
  const den = Number(denominator || 0);
  if (!den || den === 0) return '0%';
  const pct = (num / den) * 100;
  return pct.toFixed(1) + '%';
}

function showRevenueSourceModal(mode, source) {
  if (!revenueSourceModal) return;
  revenueSourceFormMessage.textContent = '';

  if (mode === 'create') {
    revenueSourceModalTitle.textContent = 'Add revenue source';
    revenueSourceIdInput.value = '';
    revenueSourceNameInput.value = '';
    revenueSourceCodeInput.value = '';
    revenueSourceBudgetInput.value = '';
    revenueSourceYearInput.value = currentYear;
    revenueSourceSubmitLabel.textContent = 'Save source';
  } else if (mode === 'edit' && source) {
    revenueSourceModalTitle.textContent = 'Edit revenue source';
    revenueSourceIdInput.value = source.id;
    revenueSourceNameInput.value = source.name || '';
    revenueSourceCodeInput.value = source.code || '';
    revenueSourceBudgetInput.value = source.approved_budget || '';
    revenueSourceYearInput.value = source.budget_year || currentYear;
    revenueSourceSubmitLabel.textContent = 'Update source';
  }

  revenueSourceModal.classList.remove('hidden');
  revenueSourceModal.classList.add('flex');
}

function closeRevenueSourceModal() {
  if (!revenueSourceModal) return;
  revenueSourceModal.classList.add('hidden');
  revenueSourceModal.classList.remove('flex');
}

// MAIN LOAD
(async () => {
  const supabase = window.supabaseClient;
  if (!supabase) {
    if (pageMessage) {
      pageMessage.textContent = 'System configuration error. Contact ICT.';
    }
    return;
  }

  const mdaIdParam = getQueryParam('id');
  if (!mdaIdParam) {
    window.location.href = 'mdas.html';
    return;
  }
  currentMdaId = Number(mdaIdParam);

  // 1) Session & profile (admin only)
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session || !sessionData.session.user) {
    window.location.href = '../index.html';
    return;
  }

  const user = sessionData.session.user;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('full_name, global_role')
    .eq('user_id', user.id)
    .single();

  if (profileError || !profile || profile.global_role !== 'admin') {
    window.location.href = '../index.html';
    return;
  }

  const name =
    profile.full_name && profile.full_name.trim().length > 0
      ? profile.full_name.trim()
      : user.email || 'Admin User';
  const initial = name.charAt(0).toUpperCase();

  if (topbarUserName) topbarUserName.textContent = name;
  if (topbarUserInitial) topbarUserInitial.textContent = initial;

  // 2) Load MDA
  const { data: mda, error: mdaError } = await supabase
    .from('mdas')
    .select('id, name, code, category, is_active')
    .eq('id', currentMdaId)
    .single();

  if (mdaError || !mda) {
    console.error('Error loading MDA:', mdaError);
    if (pageMessage) {
      pageMessage.textContent = 'Unable to load MDA. Return to registry and try again.';
    }
    return;
  }

  mdaNameHeading.textContent = mda.name;
  const categoryLabel = mda.category || 'MDA';
  mdaCodeCategory.textContent = `${mda.code || '—'} • ${categoryLabel}`;
  if (mda.is_active) {
    mdaStatusBadge.textContent = 'Active';
    mdaStatusBadge.className =
      'inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 px-2.5 py-1 text-[11px] font-medium';
  } else {
    mdaStatusBadge.textContent = 'Inactive';
    mdaStatusBadge.className =
      'inline-flex items-center rounded-full bg-slate-50 text-slate-600 border border-slate-200 px-2.5 py-1 text-[11px] font-medium';
  }

  // 3) Load revenue sources for this MDA
  const { data: sources, error: sourcesError } = await supabase
    .from('revenue_sources')
    .select('id, name, code, approved_budget, budget_year, is_active')
    .eq('mda_id', currentMdaId)
    .order('name', { ascending: true });

  if (sourcesError) {
    console.error('Error loading revenue sources:', sourcesError);
  }
  revenueSources = sources || [];

  // 4) Load revenues for this MDA (all sources)
  const { data: revenues, error: revenuesError } = await supabase
    .from('revenues')
    .select('amount, revenue_source_id, zone_id, lga_id')
    .eq('mda_id', currentMdaId);

  if (revenuesError) {
    console.error('Error loading revenues:', revenuesError);
  }

  // Build aggregations
  revenuesBySource = {};
  revenuesByZone = {};
  revenuesByLga = {};

  (revenues || []).forEach((r) => {
    // by source
    if (!revenuesBySource[r.revenue_source_id]) {
      revenuesBySource[r.revenue_source_id] = 0;
    }
    revenuesBySource[r.revenue_source_id] += Number(r.amount || 0);

    // by zone
    if (!revenuesByZone[r.zone_id]) {
      revenuesByZone[r.zone_id] = 0;
    }
    revenuesByZone[r.zone_id] += Number(r.amount || 0);

    // by LGA
    if (r.lga_id) {
      if (!revenuesByLga[r.lga_id]) {
        revenuesByLga[r.lga_id] = 0;
      }
      revenuesByLga[r.lga_id] += Number(r.amount || 0);
    }
  });

  // 5) Load zones and LGAs
  const { data: zones, error: zonesError } = await supabase
    .from('zones')
    .select('id, name')
    .order('name', { ascending: true });

  const { data: lgas, error: lgasError } = await supabase
    .from('lgas')
    .select('id, name, zone_id')
    .order('name', { ascending: true });

  if (zonesError) console.error('Error loading zones:', zonesError);
  if (lgasError) console.error('Error loading LGAs:', lgasError);

    // 6) Load per-MDA aggregate budget
    const { data: budgets, error: budgetsError } = await supabase
    .from('mda_budgets')
    .select('year, approved_ntr')
    .eq('mda_id', currentMdaId)
    .order('year', { ascending: false });

  if (budgetsError) {
    console.error('Error loading mda_budgets:', budgetsError);
  }

  // 7) Load officers for this MDA: user_scopes + profiles (2-step)
  const { data: scopes, error: scopesError } = await supabase
    .from('user_scopes')
    .select('id, user_id, mda_id, zone_id, lga_id')
    .eq('mda_id', currentMdaId);

  if (scopesError) {
    console.error('Error loading MDA scopes:', scopesError);
  }

  let officersProfiles = [];
  if (scopes && scopes.length > 0) {
    const userIds = [...new Set(scopes.map((s) => s.user_id))];

    const { data: profilesForMda, error: profilesError } = await supabase
      .from('profiles')
      .select('user_id, email, full_name, global_role')
      .in('user_id', userIds);

    if (profilesError) {
      console.error('Error loading officer profiles:', profilesError);
    } else {
      officersProfiles = profilesForMda || [];
    }
  }

  // Render all sections
  renderRevenueSourcesTable();
  renderZoneTable(zones || []);
  renderLgaTable(lgas || []);
  renderSummaryCards(budgets || []);
  renderOfficersTable(scopes || [], officersProfiles);

})();

// Rendering
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
  
    // Map user_id -> profile for quick lookup
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
  
      let assignment = 'MDA-wide';
      if (scope.zone_id && scope.lga_id) {
        assignment = `Zone ${scope.zone_id} / LGA ${scope.lga_id}`;
      } else if (scope.zone_id) {
        assignment = `Zone ${scope.zone_id}`;
      } else if (scope.lga_id) {
        assignment = `LGA ${scope.lga_id}`;
      }
  
      tdAssignment.textContent = assignment;
      tr.appendChild(tdAssignment);
  
      officersTableBody.appendChild(tr);
    });
  }
  

// Rendering
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
      return;
    }
  
    let totalApproved = 0;
    let totalCollected = 0;
  
    revenueSources.forEach((src) => {
      const collected = revenuesBySource[src.id] || 0;
      const approved = Number(src.approved_budget || 0);
      totalApproved += approved;
      totalCollected += collected;
  
      const variance = approved - collected;
  
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50';
  
      const tdName = document.createElement('td');
      tdName.className = 'px-3 py-2 align-middle';
      tdName.textContent = src.name;
      tr.appendChild(tdName);
  
      const tdCode = document.createElement('td');
      tdCode.className = 'px-3 py-2 align-middle text-slate-700';
      tdCode.textContent = src.code;
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
      editBtn.addEventListener('click', () => {
        showRevenueSourceModal('edit', src);
      });
  
      tdActions.appendChild(editBtn);
      tr.appendChild(tdActions);
      revenueSourcesTableBody.appendChild(tr);
    });
  
    // Update summary cards with REVENUE SOURCE totals (not MDA budgets)
    if (cardApprovedBudget) cardApprovedBudget.textContent = formatCurrency(totalApproved);
    if (cardCollected) cardCollected.textContent = formatCurrency(totalCollected);
    if (cardPerformance) cardPerformance.textContent = formatPercent(totalCollected, totalApproved);
  }
  
  function renderSummaryCards(mdaBudgets) {
    // This function now handles MDA-level budget vs collections
    if (!mdaBudgets || mdaBudgets.length === 0) {
      if (pageMessage) {
        pageMessage.textContent = 'No MDA budget configured for this year.';
      }
      return;
    }
  
    const latest = mdaBudgets[0]; // Most recent year
    const mdaApprovedBudget = Number(latest.approved_ntr || 0);
    
    // Total collected from ALL revenues for this MDA
    const totalCollected = Object.values(revenuesBySource).reduce((sum, val) => sum + Number(val || 0), 0);
    
    // Variance = Approved - Collected
    const variance = mdaApprovedBudget - totalCollected;
    
    // Performance = (Collected / Approved) * 100
    const performance = mdaApprovedBudget > 0 
      ? ((totalCollected / mdaApprovedBudget) * 100).toFixed(1)
      : '0';
  
    if (pageMessage) {
      pageMessage.innerHTML = `
        <span class="font-semibold">MDA Budget Summary for ${latest.year}:</span>
        <span class="ml-4">Approved: ${formatCurrency(mdaApprovedBudget)}</span>
        <span class="ml-4">Collected: ${formatCurrency(totalCollected)}</span>
        <span class="ml-4">Variance: ${formatCurrency(variance)}</span>
        <span class="ml-4">Performance: ${performance}%</span>
      `;
    }
  }
  

function renderZoneTable(zones) {
  if (!zoneTableBody) return;
  zoneTableBody.innerHTML = '';

  if (!zones || zones.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 2;
    td.className = 'px-3 py-4 text-center text-slate-500';
    td.textContent = 'No zones configured.';
    tr.appendChild(td);
    zoneTableBody.appendChild(tr);
    return;
  }

  let anyData = false;

  zones.forEach((z) => {
    const total = revenuesByZone[z.id] || 0;
    anyData = anyData || total > 0;

    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50';

    const tdName = document.createElement('td');
    tdName.className = 'px-3 py-2 align-middle';
    tdName.textContent = z.name;
    tr.appendChild(tdName);

    const tdTotal = document.createElement('td');
    tdTotal.className = 'px-3 py-2 align-middle text-right';
    tdTotal.textContent = formatCurrency(total);
    tr.appendChild(tdTotal);

    zoneTableBody.appendChild(tr);
  });

  if (!anyData) {
    zoneTableBody.innerHTML = '';
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 2;
    td.className = 'px-3 py-4 text-center text-slate-500';
    td.textContent = 'No NTR records have been captured by zone yet.';
    tr.appendChild(td);
    zoneTableBody.appendChild(tr);
  }
}

function renderLgaTable(lgas) {
  if (!lgaTableBody) return;
  lgaTableBody.innerHTML = '';

  if (!lgas || lgas.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 2;
    td.className = 'px-3 py-4 text-center text-slate-500';
    td.textContent = 'No LGAs configured.';
    tr.appendChild(td);
    lgaTableBody.appendChild(tr);
    return;
  }

  let anyData = false;

  lgas.forEach((l) => {
    const total = revenuesByLga[l.id] || 0;
    anyData = anyData || total > 0;

    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50';

    const tdName = document.createElement('td');
    tdName.className = 'px-3 py-2 align-middle';
    tdName.textContent = l.name;
    tr.appendChild(tdName);

    const tdTotal = document.createElement('td');
    tdTotal.className = 'px-3 py-2 align-middle text-right';
    tdTotal.textContent = formatCurrency(total);
    tr.appendChild(tdTotal);

    lgaTableBody.appendChild(tr);
  });

  if (!anyData) {
    lgaTableBody.innerHTML = '';
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 2;
    td.className = 'px-3 py-4 text-center text-slate-500';
    td.textContent = 'No NTR records have been captured by LGA yet.';
    tr.appendChild(td);
    lgaTableBody.appendChild(tr);
  }
}

function renderSummaryCards(mdaBudgets) {
  if (!mdaBudgets || mdaBudgets.length === 0) {
    return;
  }
  const latest = mdaBudgets[0];
  if (pageMessage) {
    pageMessage.textContent =
      `Aggregate approved NTR for ${latest.year}: ` + formatCurrency(latest.approved_ntr);
  }
}

// Events
if (btnAddRevenueSource) {
  btnAddRevenueSource.addEventListener('click', () => {
    showRevenueSourceModal('create', null);
  });
}

if (revenueSourceModalClose) {
  revenueSourceModalClose.addEventListener('click', closeRevenueSourceModal);
}
if (revenueSourceModal) {
  revenueSourceModal.addEventListener('click', (e) => {
    if (e.target === revenueSourceModal) {
      closeRevenueSourceModal();
    }
  });
}

if (revenueSourceResetBtn) {
  revenueSourceResetBtn.addEventListener('click', () => {
    revenueSourceFormMessage.textContent = '';
    revenueSourceIdInput.value = '';
    revenueSourceNameInput.value = '';
    revenueSourceCodeInput.value = '';
    revenueSourceBudgetInput.value = '';
    revenueSourceYearInput.value = currentYear;
  });
}

if (revenueSourceForm) {
  revenueSourceForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const supabase = window.supabaseClient;
    if (!supabase) return;

    const name = revenueSourceNameInput.value.trim();
    const code = revenueSourceCodeInput.value.trim();
    const budgetStr = revenueSourceBudgetInput.value.trim();
    const yearStr = revenueSourceYearInput.value.trim();

    if (!name) {
      revenueSourceFormMessage.textContent = 'Please enter a source name.';
      return;
    }
    if (!code) {
      revenueSourceFormMessage.textContent = 'Please enter a source code.';
      return;
    }

    const approved_budget = budgetStr ? Number(budgetStr) : null;
    const budget_year = yearStr ? Number(yearStr) : null;

    revenueSourceSubmitBtn.disabled = true;
    revenueSourceSubmitLabel.textContent = revenueSourceIdInput.value ? 'Updating...' : 'Saving...';
    revenueSourceFormMessage.textContent = '';

    try {
      if (revenueSourceIdInput.value) {
        const id = Number(revenueSourceIdInput.value);
        const { error } = await supabase
          .from('revenue_sources')
          .update({
            name,
            code,
            approved_budget,
            budget_year
          })
          .eq('id', id);

        if (error) {
          console.error('Update revenue source error:', error);
          if (error.code === '23505') {
            revenueSourceFormMessage.textContent =
              'This code is already used for this MDA. Please choose a different code.';
          } else if (
            error.code === '42501' ||
            (typeof error.message === 'string' &&
              error.message.toLowerCase().includes('rls'))
          ) {
            revenueSourceFormMessage.textContent =
              'You are not allowed to update revenue sources. Contact the system administrator.';
          } else {
            revenueSourceFormMessage.textContent =
              'Unable to update revenue source. Please try again.';
          }
        } else {
          window.location.reload();
        }
      } else {
        const { error } = await supabase
          .from('revenue_sources')
          .insert({
            mda_id: currentMdaId,
            name,
            code,
            approved_budget,
            budget_year
          });

        if (error) {
          console.error('Insert revenue source error:', error);
          if (error.code === '23505') {
            revenueSourceFormMessage.textContent =
              'This code is already used for this MDA. Please choose a different code.';
          } else if (
            error.code === '42501' ||
            (typeof error.message === 'string' &&
              error.message.toLowerCase().includes('rls'))
          ) {
            revenueSourceFormMessage.textContent =
              'You are not allowed to create revenue sources. Contact the system administrator.';
          } else {
            revenueSourceFormMessage.textContent =
              'Unable to create revenue source. Please try again.';
          }
        } else {
          window.location.reload();
        }
      }
    } catch (err) {
      console.error('Unexpected revenue source save error:', err);
      revenueSourceFormMessage.textContent =
        'Unexpected error while saving. Please try again.';
    } finally {
      revenueSourceSubmitBtn.disabled = false;
      revenueSourceSubmitLabel.textContent = revenueSourceIdInput.value
        ? 'Update source'
        : 'Save source';
    }
  });
}

if (btnGenerateReport) {
  btnGenerateReport.addEventListener('click', () => {
    alert('Reporting/export functionality will be implemented here (e.g. download Excel/PDF).');
  });
}
