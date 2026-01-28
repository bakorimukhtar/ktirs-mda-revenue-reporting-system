// admin/js/index.js

// Sidebar toggle for mobile
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const logoutBtn = document.getElementById('logoutBtn')

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

// Set current year badge
const yearBadge = document.getElementById('currentYearBadge');
if (yearBadge) {
  yearBadge.textContent = new Date().getFullYear().toString();
}

// Stat elements
const statMdas = document.getElementById('statMdas');
const statUsers = document.getElementById('statUsers');
const statSources = document.getElementById('statSources');
const statBudget = document.getElementById('statBudget');

// Recent activity container
const recentActivityList = (() => {
  const sideBox = document.querySelector(
    'div.bg-white.border.border-slate-200.rounded-md.p-4:nth-of-type(2) ul'
  );
  return sideBox || null;
})();

// Load current logged-in admin and dashboard stats
(async () => {
  const supabase = window.supabaseClient;
  if (!supabase) return;

  // 1) Get current session/user
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session || !sessionData.session.user) {
    window.location.href = '../index.html';
    return;
  }

  const user = sessionData.session.user;

  // 2) Load profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('full_name, global_role')
    .eq('user_id', user.id)
    .single();

  if (profileError || !profile) {
    console.warn('Profile not found for current user', profileError);
  }

  // 3) Only allow admins on this page
  if (!profile || profile.global_role !== 'admin') {
    window.location.href = '../index.html';
    return;
  }

  // 4) Populate UI with name and initials
  const name =
    profile.full_name && profile.full_name.trim().length > 0
      ? profile.full_name.trim()
      : user.email || 'Admin User';

  const initial = name.charAt(0).toUpperCase();

  const topbarUserName = document.getElementById('topbarUserName');
  const topbarUserInitial = document.getElementById('topbarUserInitial');
  const loggedInAsBadge = document.getElementById('loggedInAsBadge');

  if (topbarUserName) {
    topbarUserName.textContent = name;
  }
  if (topbarUserInitial) {
    topbarUserInitial.textContent = initial;
  }
  if (loggedInAsBadge) {
    loggedInAsBadge.textContent = `${name} (KTIRS HQ)`;
  }

  // 5) Load dashboard stats in parallel

  // Registered MDAs (active)
  const mdasPromise = supabase
    .from('mdas')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true);

  // Active users (admins + mda_user)
  const usersPromise = supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .in('global_role', ['admin', 'mda_user']);

  // Revenue sources (active)
  const sourcesPromise = supabase
    .from('revenue_sources')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true);

  // Approved NTR budget = sum of approved_budget over all revenue_sources
  const budgetsPromise = supabase
    .from('revenue_sources')
    .select('approved_budget');

  // Recent activity from revenue_sources and mda_budgets
  const recentSourcesPromise = supabase
    .from('revenue_sources')
    .select('id, name, code, mda_id, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(5);

  const recentBudgetsPromise = supabase
    .from('mda_budgets')
    .select('id, mda_id, year, approved_ntr, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(5);

  const [
    { count: mdasCount },
    { count: usersCount },
    { count: sourcesCount },
    { data: budgetsRows },
    { data: recentSources },
    { data: recentBudgets }
  ] = await Promise.all([
    mdasPromise,
    usersPromise,
    sourcesPromise,
    budgetsPromise,
    recentSourcesPromise,
    recentBudgetsPromise
  ]);

  // Registered MDAs
  if (statMdas && typeof mdasCount === 'number') {
    statMdas.textContent = mdasCount.toString();
  }

  // Active users
  if (statUsers && typeof usersCount === 'number') {
    statUsers.textContent = usersCount.toString();
  }

  // Revenue sources
  if (statSources && typeof sourcesCount === 'number') {
    statSources.textContent = sourcesCount.toString();
  }

  // Approved NTR budget (sum approved_budget)
  let totalApprovedBudget = 0;
  if (Array.isArray(budgetsRows)) {
    budgetsRows.forEach((row) => {
      const v = Number(row.approved_budget);
      if (!Number.isNaN(v)) totalApprovedBudget += v;
    });
  }
  if (statBudget) {
    statBudget.textContent =
      '₦' +
      totalApprovedBudget.toLocaleString('en-NG', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
  }

  // 6) Recent administrative activity
  if (recentActivityList) {
    recentActivityList.innerHTML = '';

    const activities = [];

    // Revenue source updates
    (recentSources || []).forEach((src) => {
      activities.push({
        type: 'source',
        timestamp: src.updated_at || src.created_at,
        text: `Revenue source “${src.name}” (${src.code}) updated.`,
      });
    });

    // Budget updates
    (recentBudgets || []).forEach((b) => {
      activities.push({
        type: 'budget',
        timestamp: b.updated_at || b.created_at,
        text: `Budget for year ${b.year} updated (₦${Number(b.approved_ntr || 0).toLocaleString(
          'en-NG',
          { maximumFractionDigits: 2 }
        )}).`,
      });
    });

    // Sort by timestamp desc, take top 8
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const topActivities = activities.slice(0, 8);

    if (topActivities.length === 0) {
      const li = document.createElement('li');
      li.textContent = '— No activity recorded yet.';
      li.className = 'text-xs text-slate-600';
      recentActivityList.appendChild(li);

      const liHint = document.createElement('li');
      liHint.textContent =
        'Once implemented, this section will show configuration changes (e.g. new user created, budget updated).';
      liHint.className = 'text-[11px] text-slate-500';
      recentActivityList.appendChild(liHint);
    } else {
      topActivities.forEach((act) => {
        const li = document.createElement('li');
        li.className = 'text-xs text-slate-600';

        const time = new Date(act.timestamp);
        const timeLabel = isNaN(time.getTime()) ? '' : ` – ${time.toLocaleString()}`;

        li.textContent = act.text + timeLabel;
        recentActivityList.appendChild(li);
      });
    }
  }
})();
