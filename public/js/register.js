renderNav('register.html');
if (Auth.user) location.href = 'dashboard.html';

const form = document.getElementById('registerForm');
const alertBox = document.getElementById('formAlert');

// Only digits allowed while typing the phone number
form.phone.addEventListener('input', () => {
  form.phone.value = form.phone.value.replace(/\D/g, '').slice(0, 10);
});

const validateAll = bindValidation(form, {
  name: Rules.name,
  email: Rules.email,
  phone: Rules.phone,
  password: Rules.password,
  confirmPassword: (v, f) => (!v ? 'Please confirm password' : v !== f.password.value ? 'Passwords do not match' : ''),
});

// Strength meter
const bar = document.getElementById('strengthBar');
const txt = document.getElementById('strengthText');
const levels = [
  ['0%', '#e2e8f0', 'Use upper, lower, number & special character'],
  ['20%', '#dc2626', 'Very weak'],
  ['40%', '#f97316', 'Weak'],
  ['60%', '#eab308', 'Fair'],
  ['80%', '#84cc16', 'Good'],
  ['100%', '#16a34a', 'Strong'],
];
form.password.addEventListener('input', () => {
  const [w, c, t] = levels[form.password.value ? passwordStrength(form.password.value) : 0];
  bar.style.width = w;
  bar.style.background = c;
  txt.textContent = t;
  if (form.confirmPassword.classList.contains('touched')) form.confirmPassword.dispatchEvent(new Event('change'));
});

document.querySelectorAll('.pw-toggle').forEach((b) => {
  b.onclick = () => {
    const input = document.getElementById(b.dataset.for);
    input.type = input.type === 'password' ? 'text' : 'password';
    b.textContent = input.type === 'password' ? 'Show' : 'Hide';
  };
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  alertBox.classList.remove('show');
  if (!validateAll()) return;

  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = 'Creating account...';
  try {
    const data = await api('/auth/register', {
      method: 'POST',
      body: {
        name: form.elements.name.value.trim(),
        email: form.email.value.trim(),
        phone: form.phone.value.trim(),
        password: form.password.value,
        confirmPassword: form.confirmPassword.value,
      },
    });
    Auth.save(data.token, data.user);
    toast('Account created! Welcome ' + data.user.name);
    setTimeout(() => (location.href = 'dashboard.html'), 700);
  } catch (err) {
    showServerErrors(form, err.errors);
    alertBox.textContent = err.message;
    alertBox.classList.add('show');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Register';
  }
});
