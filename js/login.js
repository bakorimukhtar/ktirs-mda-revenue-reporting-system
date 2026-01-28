const email = document.getElementById('email');
const password = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const errorMsg = document.getElementById('errorMsg');
const loginForm = document.getElementById('loginForm');

function validateInputs() {
  const hasEmail = email.value.trim().length > 0;
  const hasPassword = password.value.trim().length > 0;

  if (hasEmail && hasPassword) {
    loginBtn.disabled = false;
    loginBtn.classList.add('active');
  } else {
    loginBtn.disabled = true;
    loginBtn.classList.remove('active');
  }

  if (errorMsg.textContent) {
    errorMsg.textContent = '';
  }
}

email.addEventListener('input', validateInputs);
password.addEventListener('input', validateInputs);

loginForm.addEventListener('submit', async function (e) {
  e.preventDefault();

  errorMsg.textContent = '';
  loginBtn.textContent = 'Signing in...';
  loginBtn.disabled = true;
  loginBtn.classList.remove('active');

  const supabase = window.supabaseClient;
  if (!supabase) {
    console.error('Supabase client not found');
    errorMsg.textContent = 'System configuration error. Please contact ICT.';
    loginBtn.textContent = 'Sign in';
    validateInputs();
    return;
  }

  try {
    // 1) Authenticate with Supabase
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.value.trim(),
      password: password.value
    });

    if (error) {
      console.error('Auth error:', error);
      errorMsg.textContent =
        error.message && error.message.includes('Failed to fetch')
          ? 'Unable to reach authentication service. Check your internet connection and try again.'
          : 'Invalid credentials. Please confirm your official email and password.';
      loginBtn.textContent = 'Sign in';
      validateInputs();
      return;
    }

    const user = data.user;
    if (!user) {
      errorMsg.textContent = 'Authentication failed. Please try again.';
      loginBtn.textContent = 'Sign in';
      validateInputs();
      return;
    }

    // 2) Load profile to know role
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('global_role')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile) {
      console.error('Profile error:', profileError);
      errorMsg.textContent =
        'Your profile is not configured. Contact the system administrator.';
      loginBtn.textContent = 'Sign in';
      validateInputs();
      return;
    }

    const role = profile.global_role;

    // 3) Redirect based on role
    if (role === 'admin') {
      window.location.href = '/admin/index.html';
    } else if (role === 'mda_user') {
      window.location.href = '/mda/index.html';
    } else {
      errorMsg.textContent = 'You do not have access to this system.';
      loginBtn.textContent = 'Sign in';
      validateInputs();
    }
  } catch (err) {
    console.error('Unexpected login error:', err);
    errorMsg.textContent =
      'Unable to reach authentication service. Please check your connection and try again.';
    loginBtn.textContent = 'Sign in';
    validateInputs();
  }
});
