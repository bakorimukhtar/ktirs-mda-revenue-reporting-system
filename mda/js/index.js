// mda/js/index.js
// Shows current officer's Primary MDA + Branch from user_scopes

(async () => {
  const supabase = window.supabaseClient;
  if (!supabase) return;

  const topbarUserName = document.getElementById('topbarUserName');
  const topbarUserInitial = document.getElementById('topbarUserInitial');
  const topbarMdaName = document.getElementById('topbarMdaName');

  const statMdaName = document.getElementById('statMdaName');
  const statMdaCode = document.getElementById('statMdaCode');
  const statApprovedBudget = document.getElementById('statApprovedBudget');

  const currentMonthBadge = document.getElementById('currentMonthBadge');
  const assignedMdaBadge = document.getElementById('assignedMdaBadge');
  const statCurrentMonthLabel = document.getElementById('statCurrentMonthLabel');
  const btnMonthLabel = document.getElementById('btnMonthLabel');
  const btnRecordCurrentMonth = document.getElementById('btnRecordCurrentMonth');
  const btnLogout = document.getElementById('btnLogout');

  // 1. Session check
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session || !sessionData.session.user) {
    window.location.href = '../index.html';
    return;
  }

  const user = sessionData.session.user;

  // 2. Profile check (must be mda_user)
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

  // 3. Find primary scope (mda_id + branch_id)
  const { data: scopes, error: scopesError } = await supabase
    .from('user_scopes')
    .select(`
      mda_id,
      branch_id,
      mdas!user_scopes_mda_id_fkey (id, name, code),
      mda_branches!user_scopes_branch_id_fkey (id, name)
    `)
    .eq('user_id', user.id)
    .order('id', { ascending: true })
    .limit(1);

  if (scopesError || !scopes || scopes.length === 0) {
    const noScopeMsg = 'No MDA assigned';
    if (statMdaName) statMdaName.textContent = noScopeMsg;
    if (statMdaCode) {
      statMdaCode.textContent =
        'Your account does not have an MDA assigned. Contact KTIRS administration.';
    }
    if (assignedMdaBadge) assignedMdaBadge.textContent = 'No MDA';
    if (topbarMdaName) topbarMdaName.textContent = 'No MDA';
    if (btnRecordCurrentMonth) btnRecordCurrentMonth.disabled = true;
    return;
  }

  const scope = scopes[0];
  const mda = scope.mdas;
  const branch = scope.mda_branches;

  if (!mda) {
    const noMdaMsg = 'MDA not found';
    if (statMdaName) statMdaName.textContent = noMdaMsg;
    if (assignedMdaBadge) assignedMdaBadge.textContent = 'MDA not found';
    if (topbarMdaName) topbarMdaName.textContent = 'MDA not found';
    if (btnRecordCurrentMonth) btnRecordCurrentMonth.disabled = true;
    return;
  }

  // 4. Display MDA + Branch
  const mdaDisplay = mda.name;
  const branchDisplay = branch ? branch.name : 'MDA-wide (HQ)';
  const fullAssignment = branch ? `${mda.name} • ${branch.name}` : mda.name;

  if (topbarMdaName) topbarMdaName.textContent = fullAssignment;
  if (statMdaName) statMdaName.textContent = mdaDisplay;
  if (assignedMdaBadge) assignedMdaBadge.textContent = fullAssignment;

  if (statMdaCode) {
    if (mda.code && branch) {
      statMdaCode.textContent = `Code: ${mda.code} | Branch: ${branch.name}`;
    } else if (mda.code) {
      statMdaCode.textContent = `Code: ${mda.code}`;
    } else if (branch) {
      statMdaCode.textContent = `Branch: ${branch.name}`;
    } else {
      statMdaCode.textContent = 'No code recorded.';
    }
  }

  // 5. Current month labels
  const now = new Date();
  const monthNames = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
  ];
  const monthName = monthNames[now.getMonth()];
  const year = now.getFullYear();
  const monthLabel = `${monthName} ${year}`;
  const monthParam = `${year}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  if (currentMonthBadge) currentMonthBadge.textContent = monthLabel;
  if (statCurrentMonthLabel) statCurrentMonthLabel.textContent = monthLabel;
  if (btnMonthLabel) btnMonthLabel.textContent = monthLabel;

  // 6. Sum approved_budget across revenue sources for this MDA
  const { data: revenueRows, error: revenueError } = await supabase
    .from('revenue_sources')
    .select('approved_budget')
    .eq('mda_id', mda.id);

  if (revenueError) {
    console.error('Error loading revenue sources:', revenueError);
    if (statApprovedBudget) statApprovedBudget.textContent = '₦0.00';
  } else {
    let total = 0;
    if (Array.isArray(revenueRows)) {
      total = revenueRows.reduce((sum, row) => {
        const val = Number(row.approved_budget) || 0;
        return sum + val;
      }, 0);
    }
    if (statApprovedBudget) {
      statApprovedBudget.textContent =
        '₦' + total.toLocaleString('en-NG', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });
    }
  }

  // 7. Quick action: go to monthly entry page (passes mda_id + branch_id)
  if (btnRecordCurrentMonth) {
    const urlParams = new URLSearchParams({
      mda: mda.id,
      month: monthParam,
      ...(branch && { branch: branch.id })
    });
    const url = `revenue-entry.html?${urlParams}`;
    btnRecordCurrentMonth.addEventListener('click', () => {
      window.location.href = url;
    });
  }

  // 8. Logout
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      await supabase.auth.signOut();
      window.location.href = '../index.html';
    });
  }
})();
