const topbarUserName = document.getElementById('topbarUserName');
const topbarUserInitial = document.getElementById('topbarUserInitial');

const pageTitle = document.getElementById('pageTitle');
const pageModeBadge = document.getElementById('pageModeBadge');

const mdaForm = document.getElementById('mdaForm');
const mdaIdInput = document.getElementById('mdaId');
const mdaNameInput = document.getElementById('mdaName');
const mdaCodeInput = document.getElementById('mdaCode');
const mdaCategorySelect = document.getElementById('mdaCategory');
const mdaStatusSelect = document.getElementById('mdaStatus');
const mdaSubmitBtn = document.getElementById('mdaSubmitBtn');
const mdaSubmitLabel = document.getElementById('mdaSubmitLabel');
const mdaResetBtn = document.getElementById('mdaResetBtn');
const mdaFormMessage = document.getElementById('mdaFormMessage');

const branchesSection = document.getElementById('branchesSection');
const branchForm = document.getElementById('branchForm');
const branchIdInput = document.getElementById('branchId');
const branchNameInput = document.getElementById('branchName');
const branchCodeInput = document.getElementById('branchCode');
const branchSubmitBtn = document.getElementById('branchSubmitBtn');
const branchSubmitLabel = document.getElementById('branchSubmitLabel');
const branchResetBtn = document.getElementById('branchResetBtn');
const branchFormMessage = document.getElementById('branchFormMessage');

const branchesTableBody = document.getElementById('branchesTableBody');
const branchesEmptyState = document.getElementById('branchesEmptyState');

let isEditMode = false;
let isBranchEditMode = false;

// -------------------------------------------------------------
// Utility: get query param
// -------------------------------------------------------------
function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

// Small helper for button state
function setBtnState(btn, labelEl, text, disabled) {
  if (btn) btn.disabled = !!disabled;
  if (labelEl && text) labelEl.textContent = text;
}

// -------------------------------------------------------------
// Load branches for a given MDA
// -------------------------------------------------------------
async function loadBranchesForMda(mdaId) {
  const supabase = window.supabaseClient;
  if (!supabase || !branchesTableBody) return;

  branchesTableBody.innerHTML = '';
  if (branchesEmptyState) {
    branchesEmptyState.classList.add('hidden');
  }

  const { data: branches, error } = await supabase
    .from('mda_branches')
    .select('id, name, code, is_active')
    .eq('mda_id', mdaId)
    .order('name', { ascending: true });

  if (error) {
    console.error('Error loading branches:', error);
    if (branchFormMessage) {
      branchFormMessage.textContent = 'Unable to load branches for this MDA.';
    }
    return;
  }

  if (!branches || branches.length === 0) {
    if (branchesEmptyState) {
      branchesEmptyState.classList.remove('hidden');
    }
    return;
  }

  branches.forEach((branch) => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50';

    const tdName = document.createElement('td');
    tdName.className = 'px-3 py-2 text-slate-700';
    tdName.textContent = branch.name || '';

    const tdCode = document.createElement('td');
    tdCode.className = 'px-3 py-2 text-slate-600';
    tdCode.textContent = branch.code || '';

    const tdStatus = document.createElement('td');
    tdStatus.className = 'px-3 py-2';
    const statusBadge = document.createElement('span');
    statusBadge.className =
      'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ' +
      (branch.is_active
        ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
        : 'bg-slate-50 text-slate-600 border border-slate-200');
    statusBadge.textContent = branch.is_active ? 'Active' : 'Inactive';
    tdStatus.appendChild(statusBadge);

    const tdActions = document.createElement('td');
    tdActions.className = 'px-3 py-2 text-right';

    const btnEdit = document.createElement('button');
    btnEdit.type = 'button';
    btnEdit.className =
      'inline-flex items-center gap-1 text-[11px] text-slate-700 hover:text-slate-900 mr-2';
    btnEdit.innerHTML = `<i data-lucide="edit-3" class="w-3.5 h-3.5"></i><span>Edit</span>`;
    btnEdit.addEventListener('click', () => {
      if (branchIdInput) branchIdInput.value = branch.id;
      if (branchNameInput) branchNameInput.value = branch.name || '';
      if (branchCodeInput) branchCodeInput.value = branch.code || '';
      isBranchEditMode = true;
      if (branchSubmitLabel) branchSubmitLabel.textContent = 'Update branch';
      if (branchFormMessage) {
        branchFormMessage.textContent = '';
      }
    });

    const btnToggle = document.createElement('button');
    btnToggle.type = 'button';
    btnToggle.className =
      'inline-flex items-center gap-1 text-[11px] text-slate-700 hover:text-slate-900 mr-2';
    btnToggle.innerHTML = branch.is_active
      ? `<i data-lucide="slash" class="w-3.5 h-3.5"></i><span>Deactivate</span>`
      : `<i data-lucide="check-circle-2" class="w-3.5 h-3.5"></i><span>Activate</span>`;
    btnToggle.addEventListener('click', async () => {
      const supabase = window.supabaseClient;
      if (!supabase) return;
      const { error: toggleError } = await supabase
        .from('mda_branches')
        .update({ is_active: !branch.is_active })
        .eq('id', branch.id);

      if (toggleError) {
        console.error('Error updating branch status:', toggleError);
        if (branchFormMessage) {
          branchFormMessage.textContent = 'Unable to update branch status.';
        }
        return;
      }
      await loadBranchesForMda(mdaId);
      if (window.lucide) {
        window.lucide.createIcons();
      }
    });

    const btnDelete = document.createElement('button');
    btnDelete.type = 'button';
    btnDelete.className =
      'inline-flex items-center gap-1 text-[11px] text-red-600 hover:text-red-700';
    btnDelete.innerHTML = `<i data-lucide="trash-2" class="w-3.5 h-3.5"></i><span>Delete</span>`;
    btnDelete.addEventListener('click', async () => {
      if (!window.confirm('Are you sure you want to delete this branch?')) {
        return;
      }
      const supabase = window.supabaseClient;
      if (!supabase) return;
      const { error: deleteError } = await supabase
        .from('mda_branches')
        .delete()
        .eq('id', branch.id);

      if (deleteError) {
        console.error('Error deleting branch:', deleteError);
        if (branchFormMessage) {
          branchFormMessage.textContent =
            'Unable to delete branch. Ensure it has no revenue records linked.';
        }
        return;
      }
      await loadBranchesForMda(mdaId);
      if (window.lucide) {
        window.lucide.createIcons();
      }
    });

    tdActions.appendChild(btnEdit);
    tdActions.appendChild(btnToggle);
    tdActions.appendChild(btnDelete);

    tr.appendChild(tdName);
    tr.appendChild(tdCode);
    tr.appendChild(tdStatus);
    tr.appendChild(tdActions);

    branchesTableBody.appendChild(tr);
  });

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// -------------------------------------------------------------
// Initialize: auth, profile, and MDA (if edit mode)
// -------------------------------------------------------------
(async () => {
  const supabase = window.supabaseClient;
  if (!supabase) {
    console.error('Supabase client not found');
    if (mdaFormMessage) {
      mdaFormMessage.textContent =
        'System configuration error. Please contact ICT.';
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

  // 2) Load profile, enforce admin
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

  // 3) Determine if editing or creating
  const mdaIdParam = getQueryParam('id');
  if (mdaIdParam) {
    isEditMode = true;
    if (pageTitle) pageTitle.textContent = 'Edit MDA';
    if (pageModeBadge) {
      pageModeBadge.textContent = 'Edit MDA';
      pageModeBadge.classList.remove('bg-slate-900');
      pageModeBadge.classList.add('bg-amber-600');
    }
    if (mdaSubmitLabel) mdaSubmitLabel.textContent = 'Update MDA';

    // Load existing MDA
    const { data: mda, error: mdaError } = await supabase
      .from('mdas')
      .select('id, name, code, category, is_active')
      .eq('id', mdaIdParam)
      .single();

    if (mdaError || !mda) {
      console.error('Error loading MDA:', mdaError);
      if (mdaFormMessage) {
        mdaFormMessage.textContent =
          'Unable to load selected MDA. Return to registry and try again.';
      }
      return;
    }

    // Populate form
    if (mdaIdInput) mdaIdInput.value = mda.id;
    if (mdaNameInput) mdaNameInput.value = mda.name || '';
    if (mdaCodeInput) mdaCodeInput.value = mda.code || '';
    if (mdaCategorySelect) mdaCategorySelect.value = mda.category || '';
    if (mdaStatusSelect) mdaStatusSelect.value = mda.is_active ? 'active' : 'inactive';

    // Show branches section and load branches
    if (branchesSection) {
      branchesSection.classList.remove('hidden');
    }
    await loadBranchesForMda(mda.id);
  } else {
    // New mode defaults
    if (mdaStatusSelect) mdaStatusSelect.value = 'active';
    if (branchesSection) {
      branchesSection.classList.add('hidden');
    }
  }
})();

// -------------------------------------------------------------
// MDA Form submit
// -------------------------------------------------------------
if (mdaForm) {
  mdaForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!mdaSubmitBtn || !mdaSubmitLabel) return;

    const supabase = window.supabaseClient;
    if (!supabase) return;

    mdaFormMessage.textContent = '';
    setBtnState(
      mdaSubmitBtn,
      mdaSubmitLabel,
      isEditMode ? 'Updating...' : 'Saving...',
      true
    );

    const name = mdaNameInput.value.trim();
    const code = mdaCodeInput.value.trim();
    const category = mdaCategorySelect.value;
    const statusValue = mdaStatusSelect.value;

    if (!name) {
      mdaFormMessage.textContent = 'Please enter an MDA name.';
      setBtnState(mdaSubmitBtn, mdaSubmitLabel, isEditMode ? 'Update MDA' : 'Save MDA', false);
      return;
    }
    if (!code) {
      mdaFormMessage.textContent = 'Please enter a short code.';
      setBtnState(mdaSubmitBtn, mdaSubmitLabel, isEditMode ? 'Update MDA' : 'Save MDA', false);
      return;
    }
    if (!category) {
      mdaFormMessage.textContent = 'Please select a category.';
      setBtnState(mdaSubmitBtn, mdaSubmitLabel, isEditMode ? 'Update MDA' : 'Save MDA', false);
      return;
    }

    const isActive = statusValue === 'active';

    try {
      if (isEditMode && mdaIdInput.value) {
        const id = Number(mdaIdInput.value);
        const { error } = await supabase
          .from('mdas')
          .update({
            name,
            code,
            category,
            is_active: isActive,
          })
          .eq('id', id);

        if (error) {
          console.error('Update error:', error);
          mdaFormMessage.textContent =
            'Unable to update MDA. Please try again or contact ICT.';
          setBtnState(mdaSubmitBtn, mdaSubmitLabel, 'Update MDA', false);
          return;
        }

        // On success, stay on page but keep branches visible
        mdaFormMessage.textContent = 'MDA updated successfully.';
        setBtnState(mdaSubmitBtn, mdaSubmitLabel, 'Update MDA', false);
      } else {
        const { data, error } = await supabase
          .from('mdas')
          .insert({
            name,
            code,
            category,
            is_active: isActive,
          })
          .select('id')
          .single(); // return inserted row [web:36]

        if (error) {
          console.error('Insert error:', error);
          mdaFormMessage.textContent =
            'Unable to register MDA. Please ensure the code is unique and try again.';
          setBtnState(mdaSubmitBtn, mdaSubmitLabel, 'Save MDA', false);
          return;
        }

        // After create, redirect into edit mode for this MDA so branches can be added
        if (data && data.id) {
          window.location.href = `mda-new.html?id=${data.id}`;
          return;
        }

        // Fallback
        window.location.href = 'mdas.html';
      }
    } catch (err) {
      console.error('Unexpected MDA save error:', err);
      mdaFormMessage.textContent =
        'Unexpected error while saving. Please try again.';
      setBtnState(
        mdaSubmitBtn,
        mdaSubmitLabel,
        isEditMode ? 'Update MDA' : 'Save MDA',
        false
      );
    }
  });
}

// -------------------------------------------------------------
// MDA Reset button
// -------------------------------------------------------------
if (mdaResetBtn) {
  mdaResetBtn.addEventListener('click', () => {
    mdaFormMessage.textContent = '';
    if (isEditMode) {
      // Reload page to restore original values
      window.location.reload();
    } else {
      if (mdaIdInput) mdaIdInput.value = '';
      if (mdaNameInput) mdaNameInput.value = '';
      if (mdaCodeInput) mdaCodeInput.value = '';
      if (mdaCategorySelect) mdaCategorySelect.value = '';
      if (mdaStatusSelect) mdaStatusSelect.value = 'active';
    }
  });
}

// -------------------------------------------------------------
// Branch form submit
// -------------------------------------------------------------
if (branchForm) {
  branchForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const supabase = window.supabaseClient;
    if (!supabase) return;

    if (!mdaIdInput || !mdaIdInput.value) {
      if (branchFormMessage) {
        branchFormMessage.textContent =
          'Please save the MDA first before adding branches.';
      }
      return;
    }

    const mdaId = Number(mdaIdInput.value);
    const name = branchNameInput.value.trim();
    const code = branchCodeInput.value.trim();

    branchFormMessage.textContent = '';
    setBtnState(
      branchSubmitBtn,
      branchSubmitLabel,
      isBranchEditMode ? 'Updating...' : 'Saving...',
      true
    );

    if (!name) {
      branchFormMessage.textContent = 'Please enter a branch name.';
      setBtnState(
        branchSubmitBtn,
        branchSubmitLabel,
        isBranchEditMode ? 'Update branch' : 'Add branch',
        false
      );
      return;
    }

    try {
      if (isBranchEditMode && branchIdInput && branchIdInput.value) {
        const branchId = Number(branchIdInput.value);
        const { error } = await supabase
          .from('mda_branches')
          .update({
            name,
            code: code || null,
          })
          .eq('id', branchId);

        if (error) {
          console.error('Branch update error:', error);
          branchFormMessage.textContent =
            'Unable to update branch. Please try again.';
          setBtnState(
            branchSubmitBtn,
            branchSubmitLabel,
            'Update branch',
            false
          );
          return;
        }

        branchFormMessage.textContent = 'Branch updated successfully.';
      } else {
        const { error } = await supabase.from('mda_branches').insert({
          mda_id: mdaId,
          name,
          code: code || null,
          is_active: true,
        });

        if (error) {
          console.error('Branch insert error:', error);
          branchFormMessage.textContent =
            'Unable to add branch. Ensure the code is unique (if provided) and try again.';
          setBtnState(
            branchSubmitBtn,
            branchSubmitLabel,
            'Add branch',
            false
          );
          return;
        }

        branchFormMessage.textContent = 'Branch added successfully.';
      }

      // Reset branch form and reload branches
      if (branchIdInput) branchIdInput.value = '';
      if (branchNameInput) branchNameInput.value = '';
      if (branchCodeInput) branchCodeInput.value = '';
      isBranchEditMode = false;
      if (branchSubmitLabel) branchSubmitLabel.textContent = 'Add branch';

      await loadBranchesForMda(mdaId);
    } catch (err) {
      console.error('Unexpected branch save error:', err);
      branchFormMessage.textContent =
        'Unexpected error while saving branch. Please try again.';
    } finally {
      setBtnState(
        branchSubmitBtn,
        branchSubmitLabel,
        isBranchEditMode ? 'Update branch' : 'Add branch',
        false
      );
    }
  });
}

// -------------------------------------------------------------
// Branch reset button
// -------------------------------------------------------------
if (branchResetBtn) {
  branchResetBtn.addEventListener('click', () => {
    if (branchFormMessage) branchFormMessage.textContent = '';
    if (branchIdInput) branchIdInput.value = '';
    if (branchNameInput) branchNameInput.value = '';
    if (branchCodeInput) branchCodeInput.value = '';
    isBranchEditMode = false;
    if (branchSubmitLabel) branchSubmitLabel.textContent = 'Add branch';
  });
}
