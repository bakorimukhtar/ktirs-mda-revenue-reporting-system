// js/user-new.js
// Edit + password + deactivate use Edge Function.
// Create remains client-side because your deployed function has no "create" action.

const topbarUserName = document.getElementById('topbarUserName');
const topbarUserInitial = document.getElementById('topbarUserInitial');

const pageTitle = document.getElementById('pageTitle');
const pageModeBadge = document.getElementById('pageModeBadge');

const deleteUserBtn = document.getElementById('deleteUserBtn');
const setPasswordBtn = document.getElementById('setPasswordBtn');

const userForm = document.getElementById('userForm');
const userIdHidden = document.getElementById('userIdHidden');

const fullNameInput = document.getElementById('fullName');
const emailInput = document.getElementById('email');
const roleSelect = document.getElementById('roleSelect');

const primaryMdaWrap = document.getElementById('primaryMdaWrap');
const primaryMdaSelect = document.getElementById('primaryMdaSelect');
const primaryMdaHelp = document.getElementById('primaryMdaHelp');

// Branch controls
const primaryBranchWrap = document.getElementById('primaryBranchWrap');
const primaryBranchSelect = document.getElementById('primaryBranchSelect');
const primaryBranchHelp = document.getElementById('primaryBranchHelp');

const passwordInput = document.getElementById('password');
const confirmPasswordInput = document.getElementById('confirmPassword');
const passwordHelpText = document.getElementById('passwordHelpText');

const userSubmitBtn = document.getElementById('userSubmitBtn');
const userSubmitLabel = document.getElementById('userSubmitLabel');
const userResetBtn = document.getElementById('userResetBtn');
const userFormMessage = document.getElementById('userFormMessage');

let isEditMode = false;
let cachedBranchesForMda = [];

// -------- helpers --------
function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function setMessage(msg, type = 'muted') {
  if (!userFormMessage) return;
  userFormMessage.textContent = msg || '';
  userFormMessage.className = `text-[11px] mt-1 ${
    type === 'error' ? 'text-red-600' :
    type === 'success' ? 'text-emerald-700' :
    'text-slate-500'
  }`;
}

function setBusy(isBusy, label) {
  if (userSubmitBtn) userSubmitBtn.disabled = !!isBusy;
  if (userSubmitLabel && label) userSubmitLabel.textContent = label;
}

function updateRoleUI() {
  const role = roleSelect?.value || 'mda_user';
  const needsMda = role === 'mda_user';

  if (primaryMdaWrap) primaryMdaWrap.classList.toggle('opacity-50', !needsMda);
  if (primaryMdaSelect) {
    primaryMdaSelect.disabled = !needsMda;
    if (!needsMda) primaryMdaSelect.value = '';
  }

  if (primaryMdaHelp) {
    primaryMdaHelp.textContent = needsMda
      ? 'Required for MDA Revenue Officers.'
      : 'Not required for Administrators.';
  }

  // Branch UI
  if (primaryBranchWrap) primaryBranchWrap.classList.toggle('opacity-50', !needsMda);

  if (primaryBranchSelect) {
    if (!needsMda) {
      primaryBranchSelect.disabled = true;
      primaryBranchSelect.value = '';
    } else {
      const hasMda = !!primaryMdaSelect?.value;
      const hasBranches = cachedBranchesForMda.length > 0;
      primaryBranchSelect.disabled = !(hasMda && hasBranches);
      if (!hasMda || !hasBranches) primaryBranchSelect.value = '';
    }
  }
}

function readForm() {
  return {
    full_name: fullNameInput.value.trim(),
    email: emailInput.value.trim().toLowerCase(),
    global_role: roleSelect.value,
    primary_mda_id: primaryMdaSelect.value ? Number(primaryMdaSelect.value) : null,
    primary_branch_id: primaryBranchSelect?.value ? Number(primaryBranchSelect.value) : null,
  };
}

function validateBase(b) {
  if (!b.full_name) return 'Please enter full name.';
  if (!b.email) return 'Please enter official email.';
  if (!b.global_role) return 'Please select role.';
  if (b.global_role === 'mda_user' && !b.primary_mda_id) {
    return 'Primary MDA is required for MDA Revenue Officer.';
  }
  return null;
}

function validatePasswordRequired() {
  const p1 = passwordInput.value;
  const p2 = confirmPasswordInput.value;
  if (!p1 || !p2) return { ok: false, message: 'Enter password and confirm password.' };
  if (p1 !== p2) return { ok: false, message: 'Passwords do not match.' };
  if (p1.length < 8) return { ok: false, message: 'Password must be at least 8 characters.' };
  return { ok: true, password: p1 };
}

function validatePasswordOptional() {
  const p1 = passwordInput.value;
  const p2 = confirmPasswordInput.value;

  if (!p1 && !p2) return { ok: true, password: '' };
  if (!p1 || !p2) return { ok: false, message: 'Enter password and confirm password.' };
  if (p1 !== p2) return { ok: false, message: 'Passwords do not match.' };
  if (p1.length < 8) return { ok: false, message: 'Password must be at least 8 characters.' };
  return { ok: true, password: p1 };
}

async function callAdminUserFunction(payload) {
  const supabase = window.supabaseClient;

  const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (sessErr || !token) throw new Error('Not authenticated');

  const endpoint = 'https://imjstotwjyzahrednkcx.supabase.co/functions/v1/admin-user';

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) throw new Error(data?.details || data?.message || 'Request failed');
  return data;
}

// -------- branches --------
function setBranchOptions(branches) {
  if (!primaryBranchSelect) return;

  primaryBranchSelect.innerHTML = `<option value="">Select branch (if applicable)</option>`;
  branches.forEach((b) => {
    const opt = document.createElement('option');
    opt.value = String(b.id);
    opt.textContent = b.name;
    primaryBranchSelect.appendChild(opt);
  });
}

async function loadBranchesForMda(mdaId, preserveBranchId = null) {
  const supabase = window.supabaseClient;
  if (!supabase || !primaryBranchSelect) return;

  cachedBranchesForMda = [];
  setBranchOptions([]);
  primaryBranchSelect.disabled = true;
  primaryBranchSelect.value = '';

  if (!mdaId) {
    if (primaryBranchHelp) {
      primaryBranchHelp.textContent = 'Select an MDA to load branches.';
    }
    updateRoleUI();
    return;
  }

  const { data: branches, error } = await supabase
    .from('mda_branches')
    .select('id, mda_id, name, is_active')
    .eq('mda_id', mdaId)
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) {
    console.error('Error loading branches:', error);
    if (primaryBranchHelp) {
      primaryBranchHelp.textContent = 'Unable to load branches for this MDA. Please try again.';
    }
    cachedBranchesForMda = [];
    updateRoleUI();
    return;
  }

  cachedBranchesForMda = branches || [];
  setBranchOptions(cachedBranchesForMda);

  const role = roleSelect?.value || 'mda_user';
  if (role === 'mda_user' && cachedBranchesForMda.length > 0) {
    primaryBranchSelect.disabled = false;
    if (preserveBranchId) primaryBranchSelect.value = String(preserveBranchId);
  } else {
    primaryBranchSelect.disabled = true;
    primaryBranchSelect.value = '';
  }

  if (primaryBranchHelp) {
    primaryBranchHelp.textContent =
      cachedBranchesForMda.length > 0
        ? 'This MDA has branches. Selecting a branch is required for officers.'
        : 'This MDA has no branches. The officer will be assigned MDA-wide (HQ).';
  }

  updateRoleUI();
}

// Rule: If selected MDA has branches, branch_id is required
async function enforceBranchRuleOrThrow(base) {
  const supabase = window.supabaseClient;
  if (!supabase) throw new Error('System configuration error.');

  if (base.global_role !== 'mda_user') return;
  if (!base.primary_mda_id) return;

  const { data, error } = await supabase
    .from('mda_branches')
    .select('id')
    .eq('mda_id', base.primary_mda_id)
    .eq('is_active', true)
    .limit(1);

  if (error) {
    console.error('Branch validation error:', error);
    throw new Error('Unable to validate MDA branches. Please try again.');
  }

  const hasBranches = (data || []).length > 0;
  if (hasBranches && !base.primary_branch_id) {
    throw new Error('This MDA has branches. Please select a branch for this officer.');
  }
}

// -------- deactivate --------
window.confirmDeleteUser = async () => {
  if (!confirm('Deactivate this user?\n\nThis will set role to inactive and remove scopes.')) return;

  const targetId = userIdHidden.value;
  if (!targetId) {
    setMessage('No user selected.', 'error');
    return;
  }

  try {
    setMessage('');
    setBusy(true, 'Deactivating...');

    await callAdminUserFunction({ action: 'deactivate', target_user_id: targetId });

    setMessage('User deactivated successfully.', 'success');
    setTimeout(() => (window.location.href = 'users.html'), 900);
  } catch (e) {
    console.error(e);
    setMessage(e.message || 'Failed to deactivate.', 'error');
    setBusy(false, 'Update user');
  }
};

// -------- set password (Edge Function update) --------
if (setPasswordBtn) {
  setPasswordBtn.addEventListener('click', async () => {
    const targetId = userIdHidden.value;
    if (!targetId) {
      setMessage('Open a user in edit mode first.', 'error');
      return;
    }

    const base = readForm();
    const baseErr = validateBase(base);
    if (baseErr) {
      setMessage(baseErr, 'error');
      return;
    }

    try {
      await enforceBranchRuleOrThrow(base);
    } catch (e) {
      setMessage(e.message, 'error');
      return;
    }

    const pw = validatePasswordRequired();
    if (!pw.ok) {
      setMessage(pw.message, 'error');
      return;
    }

    try {
      setMessage('');
      setPasswordBtn.disabled = true;

      await callAdminUserFunction({
        action: 'update',
        target_user_id: targetId,
        full_name: base.full_name,
        email: base.email,
        global_role: base.global_role,
        primary_mda_id: base.global_role === 'mda_user' ? base.primary_mda_id : null,
        primary_branch_id: base.global_role === 'mda_user' ? base.primary_branch_id : null,
        new_password: pw.password,
      });

      passwordInput.value = '';
      confirmPasswordInput.value = '';
      setMessage('Password updated successfully.', 'success');
    } catch (e) {
      console.error(e);
      setMessage(e.message || 'Failed to set password.', 'error');
    } finally {
      setPasswordBtn.disabled = false;
    }
  });
}

// -------- init --------
(async () => {
  const supabase = window.supabaseClient;
  if (!supabase) {
    setMessage('System configuration error.', 'error');
    return;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session?.user) {
    window.location.href = '../index.html';
    return;
  }

  // Admin gate
  const currentUser = sessionData.session.user;
  const { data: adminProfile, error: adminProfileError } = await supabase
    .from('profiles')
    .select('full_name, global_role')
    .eq('user_id', currentUser.id)
    .single();

  if (adminProfileError || !adminProfile || adminProfile.global_role !== 'admin') {
    window.location.href = '../index.html';
    return;
  }

  const adminName = (adminProfile.full_name || '').trim() || currentUser.email || 'Admin User';
  if (topbarUserName) topbarUserName.textContent = adminName;
  if (topbarUserInitial) topbarUserInitial.textContent = adminName.charAt(0).toUpperCase();

  // Load MDAs
  const { data: mdas, error: mdasError } = await supabase
    .from('mdas')
    .select('id, name')
    .order('name', { ascending: true });

  if (mdasError) {
    setMessage('Unable to load MDAs.', 'error');
    return;
  }

  (mdas || []).forEach((m) => {
    const opt = document.createElement('option');
    opt.value = String(m.id);
    opt.textContent = m.name;
    primaryMdaSelect.appendChild(opt);
  });

  // Mode detection
  const userIdParam = getQueryParam('id');

  if (userIdParam) {
    isEditMode = true;

    if (pageTitle) pageTitle.textContent = 'Edit user';
    if (pageModeBadge) {
      pageModeBadge.textContent = 'Edit mode';
      pageModeBadge.className =
        'inline-flex items-center rounded-full bg-amber-600 text-slate-50 px-3 py-1 text-[11px] font-medium';
    }
    if (userSubmitLabel) userSubmitLabel.textContent = 'Update user';
    if (deleteUserBtn) deleteUserBtn.classList.remove('hidden');
    if (setPasswordBtn) setPasswordBtn.classList.remove('hidden');

    if (passwordHelpText) {
      passwordHelpText.textContent =
        'Edit mode: Enter a new password and click “Set password” (or enter it and click “Update user”).';
    }

    // Load user profile
    const { data: userProfile, error: userProfileError } = await supabase
      .from('profiles')
      .select('user_id, full_name, email, global_role')
      .eq('user_id', userIdParam)
      .single();

    if (userProfileError || !userProfile) {
      setMessage('Unable to load user.', 'error');
      return;
    }

    // Load primary scope (mda_id + branch_id)
    const { data: scopes, error: scopesError } = await supabase
      .from('user_scopes')
      .select('mda_id, branch_id')
      .eq('user_id', userIdParam)
      .limit(1);

    if (scopesError) {
      console.error('Scopes load error:', scopesError);
    }

    userIdHidden.value = userProfile.user_id;
    fullNameInput.value = userProfile.full_name || '';
    emailInput.value = userProfile.email || '';
    roleSelect.value = userProfile.global_role || 'mda_user';

    const mdaId = scopes?.[0]?.mda_id ? Number(scopes[0].mda_id) : null;
    const branchId = scopes?.[0]?.branch_id ? Number(scopes[0].branch_id) : null;

    if (mdaId) {
      primaryMdaSelect.value = String(mdaId);
      await loadBranchesForMda(mdaId, branchId);
    } else {
      await loadBranchesForMda(null);
    }
  } else {
    isEditMode = false;
    if (userSubmitLabel) userSubmitLabel.textContent = 'Create user';
    if (passwordHelpText) passwordHelpText.textContent = 'Create mode: password is required.';
    roleSelect.value = 'mda_user';
    await loadBranchesForMda(null);
  }

  updateRoleUI();
})();

// Events
if (roleSelect) {
  roleSelect.addEventListener('change', async () => {
    updateRoleUI();
    const mdaId = primaryMdaSelect?.value ? Number(primaryMdaSelect.value) : null;
    await loadBranchesForMda(
      mdaId,
      primaryBranchSelect?.value ? Number(primaryBranchSelect.value) : null
    );
  });
}

if (primaryMdaSelect) {
  primaryMdaSelect.addEventListener('change', async () => {
    setMessage('');
    const mdaId = primaryMdaSelect.value ? Number(primaryMdaSelect.value) : null;
    await loadBranchesForMda(mdaId);
  });
}

// -------- submit (create or edit) --------
if (userForm) {
  userForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const supabase = window.supabaseClient;

    try {
      setMessage('');
      setBusy(true, isEditMode ? 'Updating...' : 'Creating...');

      const base = readForm();
      const baseErr = validateBase(base);
      if (baseErr) {
        setMessage(baseErr, 'error');
        setBusy(false, isEditMode ? 'Update user' : 'Create user');
        return;
      }

      try {
        await enforceBranchRuleOrThrow(base);
      } catch (e2) {
        setMessage(e2.message, 'error');
        setBusy(false, isEditMode ? 'Update user' : 'Create user');
        return;
      }

      if (isEditMode) {
        const pw = validatePasswordOptional();
        if (!pw.ok) {
          setMessage(pw.message, 'error');
          setBusy(false, 'Update user');
          return;
        }

        await callAdminUserFunction({
          action: 'update',
          target_user_id: userIdHidden.value,
          full_name: base.full_name,
          email: base.email,
          global_role: base.global_role,
          primary_mda_id: base.global_role === 'mda_user' ? base.primary_mda_id : null,
          primary_branch_id: base.global_role === 'mda_user' ? base.primary_branch_id : null,
          new_password: pw.password ? pw.password : undefined,
        });

        setMessage('User updated successfully.', 'success');
        setTimeout(() => (window.location.href = 'users.html'), 900);
        return;
      }

      // CREATE (client-side signUp)
      const pw = validatePasswordRequired();
      if (!pw.ok) {
        setMessage(pw.message, 'error');
        setBusy(false, 'Create user');
        return;
      }

      const { data: adminSession } = await supabase.auth.getSession();
      const adminAccess = adminSession?.session?.access_token || null;
      const adminRefresh = adminSession?.session?.refresh_token || null;

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: base.email,
        password: pw.password,
        options: { emailRedirectTo: null },
      });

      if (signUpError || !signUpData?.user) {
        throw signUpError || new Error('Unable to create auth user.');
      }

      if (signUpData.session && adminAccess && adminRefresh) {
        await supabase.auth.setSession({ access_token: adminAccess, refresh_token: adminRefresh });
      }

      const newUser = signUpData.user;

      const { error: profErr } = await supabase.from('profiles').insert({
        user_id: newUser.id,
        email: base.email,
        full_name: base.full_name,
        global_role: base.global_role,
      });
      if (profErr) throw profErr;

      if (base.global_role === 'mda_user') {
        const { error: scopeErr } = await supabase.from('user_scopes').insert({
          user_id: newUser.id,
          mda_id: base.primary_mda_id,
          branch_id: base.primary_branch_id || null,
        });
        if (scopeErr) throw scopeErr;
      }

      setMessage('User created successfully.', 'success');
      setTimeout(() => (window.location.href = 'users.html'), 900);
    } catch (err) {
      console.error(err);
      setMessage(err?.message || 'Operation failed.', 'error');
      setBusy(false, isEditMode ? 'Update user' : 'Create user');
    }
  });
}

// Reset
if (userResetBtn) {
  userResetBtn.addEventListener('click', async () => {
    setMessage('');
    if (isEditMode) window.location.reload();
    else {
      fullNameInput.value = '';
      emailInput.value = '';
      roleSelect.value = 'mda_user';
      primaryMdaSelect.value = '';
      if (primaryBranchSelect) primaryBranchSelect.value = '';
      passwordInput.value = '';
      confirmPasswordInput.value = '';

      cachedBranchesForMda = [];
      setBranchOptions([]);
      await loadBranchesForMda(null);

      updateRoleUI();
    }
  });
}
