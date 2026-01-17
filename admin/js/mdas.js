// DOM references
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const logoutBtn = document.getElementById('logoutBtn');

const mdasTableBody = document.getElementById('mdasTableBody');
const searchMda = document.getElementById('searchMda');
const filterCategory = document.getElementById('filterCategory');
const filterStatus = document.getElementById('filterStatus');

const topbarUserName = document.getElementById('topbarUserName');
const topbarUserInitial = document.getElementById('topbarUserInitial');

// In‑memory cache of MDAs loaded from Supabase
let mdas = [];

// -------------------------------------------------------------
// Layout behaviour
// -------------------------------------------------------------

// Mobile sidebar toggle
if (sidebar && sidebarToggle) {
  sidebarToggle.addEventListener('click', () => {
    const isHidden = sidebar.classList.contains('-translate-x-full');
    if (isHidden) {
      sidebar.classList.remove('-translate-x-full');
    } else {
      sidebar.classList.add('-translate-x-full');
    }
  });
}

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
// -------------------------------------------------------------
// Helpers
// -------------------------------------------------------------

function formatStatus(isActive) {
  return isActive ? 'Active' : 'Inactive';
}

function formatCategory(category) {
  if (!category) return '';
  // category is stored as 'Ministry' / 'Department' / 'Agency'
  return category;
}

function statusBadgeClasses(isActive) {
  return isActive
    ? 'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-100'
    : 'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-slate-50 text-slate-600 border border-slate-200';
}

// -------------------------------------------------------------
// Load current user (admin) and MDAs from Supabase
// -------------------------------------------------------------

(async () => {
  const supabase = window.supabaseClient;
  if (!supabase) {
    console.error('Supabase client not found');
    if (mdasTableBody) {
      mdasTableBody.innerHTML =
        '<tr><td colspan="5" class="px-3 py-4 text-center text-slate-500">System configuration error. Contact ICT.</td></tr>';
    }
    return;
  }

  // 1) Check session
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session || !sessionData.session.user) {
    window.location.href = '../index.html';
    return;
  }

  const user = sessionData.session.user;

  // 2) Load profile to ensure admin and get name
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('full_name, global_role')
    .eq('user_id', user.id)
    .single();

  if (profileError || !profile) {
    console.error('Profile not found for current user', profileError);
    window.location.href = '../index.html';
    return;
  }

  if (profile.global_role !== 'admin') {
    // Non‑admin should not access MDA registry
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

  // 3) Load MDAs from Supabase
  if (mdasTableBody) {
    mdasTableBody.innerHTML =
      '<tr><td colspan="5" class="px-3 py-4 text-center text-slate-500">Loading MDAs...</td></tr>';
  }

  const { data: mdasData, error: mdasError } = await supabase
    .from('mdas')
    .select('id, name, code, category, is_active, created_at')
    .order('category', { ascending: true })
    .order('name', { ascending: true });

  if (mdasError) {
    console.error('Error loading MDAs:', mdasError);
    if (mdasTableBody) {
      mdasTableBody.innerHTML =
        '<tr><td colspan="5" class="px-3 py-4 text-center text-red-600">Unable to load MDAs. Please try again or contact ICT.</td></tr>';
    }
    return;
  }

  mdas = mdasData || [];
  renderMdasTable();
})();

// -------------------------------------------------------------
// Rendering main table (with search / filters)
// -------------------------------------------------------------

function renderMdasTable() {
  if (!mdasTableBody) return;

  const term = searchMda ? searchMda.value.trim().toLowerCase() : '';
  const categoryFilter = filterCategory ? filterCategory.value : '';
  const statusFilter = filterStatus ? filterStatus.value : '';

  const filtered = mdas.filter((mda) => {
    // Search by name or code
    if (term) {
      const haystack =
        (mda.name || '').toLowerCase() + ' ' + (mda.code || '').toLowerCase();
      if (!haystack.includes(term)) return false;
    }

    // Filter by category
    if (categoryFilter) {
      if (mda.category !== categoryFilter) return false;
    }

    // Filter by status
    if (statusFilter === 'active' && !mda.is_active) return false;
    if (statusFilter === 'inactive' && mda.is_active) return false;

    return true;
  });

  mdasTableBody.innerHTML = '';

  if (filtered.length === 0) {
    const row = document.createElement('tr');
    row.className = 'text-slate-500';
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.className = 'px-3 py-4 text-center';
    cell.textContent = 'No MDAs match the current filters.';
    row.appendChild(cell);
    mdasTableBody.appendChild(row);
    return;
  }

  filtered.forEach((mda) => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50';

    // Name
    const tdName = document.createElement('td');
    tdName.className = 'px-3 py-2 align-middle';
    tdName.textContent = mda.name;
    tr.appendChild(tdName);

    // Code
    const tdCode = document.createElement('td');
    tdCode.className = 'px-3 py-2 align-middle text-slate-700';
    tdCode.textContent = mda.code || '—';
    tr.appendChild(tdCode);

    // Category
    const tdCategory = document.createElement('td');
    tdCategory.className = 'px-3 py-2 align-middle text-slate-700';
    tdCategory.textContent = formatCategory(mda.category);
    tr.appendChild(tdCategory);

    // Status
    const tdStatus = document.createElement('td');
    tdStatus.className = 'px-3 py-2 align-middle';
    const badge = document.createElement('span');
    badge.className = statusBadgeClasses(mda.is_active);
    badge.textContent = formatStatus(mda.is_active);
    tdStatus.appendChild(badge);
    tr.appendChild(tdStatus);

    // Actions
    const tdActions = document.createElement('td');
    tdActions.className =
      'px-3 py-2 align-middle text-right text-[11px] space-x-2';

    const detailsBtn = document.createElement('button');
    detailsBtn.type = 'button';
    detailsBtn.className =
      'inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50';
    detailsBtn.textContent = 'Details';
    detailsBtn.addEventListener('click', () => {
      // For now, navigate to a details page; you can later pass id in query string
      window.location.href = `mda-details.html?id=${encodeURIComponent(
        mda.id
      )}`;
    });

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className =
      'inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => {
      // Navigate to edit page (can reuse mda-new.html with mode=edit)
      window.location.href = `mda-new.html?id=${encodeURIComponent(mda.id)}`;
    });

    tdActions.appendChild(detailsBtn);
    tdActions.appendChild(editBtn);
    tr.appendChild(tdActions);

    mdasTableBody.appendChild(tr);
  });
}

// -------------------------------------------------------------
// Events: search and filters
// -------------------------------------------------------------

if (searchMda) {
  searchMda.addEventListener('input', () => {
    renderMdasTable();
  });
}

if (filterCategory) {
  filterCategory.addEventListener('change', () => {
    renderMdasTable();
  });
}

if (filterStatus) {
  filterStatus.addEventListener('change', () => {
    renderMdasTable();
  });
}
