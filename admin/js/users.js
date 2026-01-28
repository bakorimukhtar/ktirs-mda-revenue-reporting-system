// DOM refs
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const logoutBtn = document.getElementById('logoutBtn');

const topbarUserName = document.getElementById('topbarUserName');
const topbarUserInitial = document.getElementById('topbarUserInitial');

const usersTableBody = document.getElementById('usersTableBody');
const filterMda = document.getElementById('filterMda');
const filterRole = document.getElementById('filterRole');

const selectedUserInfo = document.getElementById('selectedUserInfo');
const scopesTableBody = document.getElementById('scopesTableBody');
const usersPageMessage = document.getElementById('usersPageMessage');

// Data caches
let allProfiles = [];
let allMdas = [];
let allBranches = []; // mda_branches
let allScopes = []; // user_scopes
let selectedUserId = null;

// Sidebar toggle
if (sidebar && sidebarToggle) {
  sidebarToggle.addEventListener('click', () => {
    const isHidden = sidebar.classList.contains('-translate-x-full');
    if (isHidden) sidebar.classList.remove('-translate-x-full');
    else sidebar.classList.add('-translate-x-full');
  });
}

// Logout
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    const supabase = window.supabaseClient;
    if (!supabase) {
      window.location.href = '../index.html';
      return;
    }

    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Logout error:', error);
        alert('Unable to log out right now. Please try again.');
        return;
      }
      window.location.href = '../index.html';
    } catch (e) {
      console.error('Unexpected logout error:', e);
      window.location.href = '../index.html';
    }
  });
}

// Helpers
function formatRole(role) {
  if (role === 'admin') return 'Administrator';
  if (role === 'mda_user') return 'MDA user';
  return role || 'User';
}

function getScopesForUser(userId) {
  return allScopes.filter((s) => s.user_id === userId);
}

function getMdaById(mdaId) {
  return allMdas.find((m) => m.id === mdaId) || null;
}

function getBranchById(branchId) {
  if (!branchId) return null;
  return allBranches.find((b) => b.id === branchId) || null;
}

function getPrimaryMdaNameForUser(userId) {
  // Rule: first scope row for the user (sorted in DB is not guaranteed),
  // but good enough for “Primary MDA” display in table.
  // If you later want strict primary assignment, store a dedicated column.
  const scope = allScopes.find((s) => s.user_id === userId && s.mda_id);
  if (!scope) return '—';
  const mda = getMdaById(scope.mda_id);
  return mda ? mda.name : '—';
}

// Load data
(async () => {
  const supabase = window.supabaseClient;
  if (!supabase) {
    if (usersPageMessage) {
      usersPageMessage.textContent = 'System configuration error. Contact ICT.';
    }
    return;
  }

  // 1) Session & profile
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

  // 2) Load MDAs, branches, scopes, profiles
  const [
    { data: mdas, error: mdasError },
    { data: branches, error: branchesError },
    { data: scopes, error: scopesError },
    { data: profiles, error: profilesError },
  ] = await Promise.all([
    supabase.from('mdas').select('id, name').order('name', { ascending: true }),
    supabase
      .from('mda_branches')
      .select('id, mda_id, name, is_active')
      .order('name', { ascending: true }),
    supabase.from('user_scopes').select('id, user_id, mda_id, branch_id'),
    supabase
      .from('profiles')
      .select('user_id, email, full_name, global_role')
      .order('full_name', { ascending: true }),
  ]);

  if (mdasError || branchesError || scopesError || profilesError) {
    console.error('Error loading users metadata:', {
      mdasError,
      branchesError,
      scopesError,
      profilesError,
    });

    if (usersPageMessage) {
      usersPageMessage.textContent =
        'Unable to load users and MDAs. Please try again or contact ICT.';
    }
    return;
  }

  allMdas = mdas || [];
  allBranches = branches || [];
  allScopes = scopes || [];
  allProfiles = profiles || [];

  // Populate MDA filter
  if (filterMda) {
    // reset to only “All MDAs”
    filterMda.innerHTML = `<option value="">All MDAs</option>`;
    allMdas.forEach((mda) => {
      const opt = document.createElement('option');
      opt.value = String(mda.id);
      opt.textContent = mda.name;
      filterMda.appendChild(opt);
    });
  }

  renderUsersTable();
})();

// Rendering
function renderUsersTable() {
  if (!usersTableBody) return;

  usersTableBody.innerHTML = '';

  const selectedMdaId = filterMda && filterMda.value ? Number(filterMda.value) : null;
  const selectedRole = filterRole && filterRole.value ? filterRole.value : null;

  const filtered = allProfiles.filter((p) => {
    if (selectedRole && p.global_role !== selectedRole) return false;

    if (selectedMdaId) {
      const scopes = getScopesForUser(p.user_id);
      return scopes.some((s) => s.mda_id === selectedMdaId);
    }

    return true;
  });

  if (filtered.length === 0) {
    const tr = document.createElement('tr');
    tr.className = 'text-slate-500';
    const td = document.createElement('td');
    td.colSpan = 5;
    td.className = 'px-3 py-4 text-center';
    td.textContent = 'No users match the current filters.';
    tr.appendChild(td);
    usersTableBody.appendChild(tr);
    return;
  }

  filtered.forEach((p) => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50 cursor-pointer';

    const tdName = document.createElement('td');
    tdName.className = 'px-3 py-2 align-middle';
    tdName.textContent = p.full_name || '(No name)';
    tr.appendChild(tdName);

    const tdEmail = document.createElement('td');
    tdEmail.className = 'px-3 py-2 align-middle text-slate-700';
    tdEmail.textContent = p.email || '—';
    tr.appendChild(tdEmail);

    const tdMda = document.createElement('td');
    tdMda.className = 'px-3 py-2 align-middle text-slate-700';
    tdMda.textContent = getPrimaryMdaNameForUser(p.user_id);
    tr.appendChild(tdMda);

    const tdRole = document.createElement('td');
    tdRole.className = 'px-3 py-2 align-middle text-slate-700';
    tdRole.textContent = formatRole(p.global_role);
    tr.appendChild(tdRole);

    const tdActions = document.createElement('td');
    tdActions.className = 'px-3 py-2 align-middle text-right text-[11px] space-x-2';

    const scopesBtn = document.createElement('button');
    scopesBtn.type = 'button';
    scopesBtn.className =
      'inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50';
    scopesBtn.textContent = 'View scopes';
    scopesBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      selectUser(p.user_id);
    });

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className =
      'inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.location.href = `user-new.html?id=${encodeURIComponent(p.user_id)}`;
    });

    tdActions.appendChild(scopesBtn);
    tdActions.appendChild(editBtn);
    tr.appendChild(tdActions);

    tr.addEventListener('click', () => {
      selectUser(p.user_id);
    });

    usersTableBody.appendChild(tr);
  });
}

function selectUser(userId) {
  selectedUserId = userId;

  const profile = allProfiles.find((p) => p.user_id === userId);
  if (!profile) {
    if (selectedUserInfo) selectedUserInfo.textContent = 'Selected user could not be found.';
    renderScopesTable([]);
    return;
  }

  const textName = profile.full_name || '(No name)';
  const textRole = formatRole(profile.global_role);

  if (selectedUserInfo) {
    selectedUserInfo.textContent = `${textName} • ${profile.email} • ${textRole}`;
  }

  const scopes = getScopesForUser(userId);
  renderScopesTable(scopes);
}

function renderScopesTable(scopes) {
  if (!scopesTableBody) return;

  scopesTableBody.innerHTML = '';

  if (!scopes || scopes.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 2;
    td.className = 'px-2 py-2 text-center text-slate-500';
    td.textContent = 'This user has no MDA coverage assigned yet.';
    tr.appendChild(td);
    scopesTableBody.appendChild(tr);
    return;
  }

  scopes.forEach((s) => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50';

    const mda = getMdaById(s.mda_id);
    const branch = getBranchById(s.branch_id);

    const tdMda = document.createElement('td');
    tdMda.className = 'px-2 py-1 align-middle';
    tdMda.textContent = mda ? mda.name : '—';
    tr.appendChild(tdMda);

    const tdBranch = document.createElement('td');
    tdBranch.className = 'px-2 py-1 align-middle';
    tdBranch.textContent = branch ? branch.name : 'MDA-wide (no specific branch)';
    tr.appendChild(tdBranch);

    scopesTableBody.appendChild(tr);
  });
}

// Filters events
if (filterMda) {
  filterMda.addEventListener('change', () => {
    renderUsersTable();
    if (selectedUserId) selectUser(selectedUserId);
  });
}

if (filterRole) {
  filterRole.addEventListener('change', () => {
    renderUsersTable();
    if (selectedUserId) selectUser(selectedUserId);
  });
}
