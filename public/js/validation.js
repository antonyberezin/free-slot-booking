// Client-side validation rules. Same rules are enforced again on the server.
const Rules = {
  name(v) {
    v = v.trim();
    if (!v) return 'Name is required';
    if (v.length < 3 || v.length > 50) return 'Name must be 3-50 characters';
    if (!/^[A-Za-z ]+$/.test(v)) return 'Name can contain only letters and spaces';
    return '';
  },
  email(v) {
    v = v.trim();
    if (!v) return 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'Enter a valid email';
    return '';
  },
  phone(v) {
    v = v.trim();
    if (!v) return 'Phone is required';
    if (!/^\d+$/.test(v)) return 'Phone must contain only digits';
    if (v.length !== 10) return 'Phone must be exactly 10 digits';
    if (!/^[6-9]/.test(v)) return 'Phone must start with 6, 7, 8 or 9';
    return '';
  },
  password(v) {
    if (!v) return 'Password is required';
    if (v.length < 8) return 'At least 8 characters';
    if (!/[A-Z]/.test(v)) return 'Add an uppercase letter';
    if (!/[a-z]/.test(v)) return 'Add a lowercase letter';
    if (!/\d/.test(v)) return 'Add a number';
    if (!/[^A-Za-z0-9]/.test(v)) return 'Add a special character';
    return '';
  },
  required(v, label = 'This field') {
    return String(v).trim() ? '' : `${label} is required`;
  },
  vehicleNumber(v) {
    v = v.toUpperCase().replace(/[\s-]/g, '');
    if (!v) return 'Vehicle number is required';
    if (!/^[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{4}$/.test(v)) return 'Format: TN01AB1234';
    return '';
  },
  vehicleType(v) {
    return ['car', 'bike', 'truck', 'ev'].includes(v) ? '' : 'Select a vehicle type';
  },
  startTime(v) {
    if (!v) return 'Start time is required';
    const d = new Date(v);
    if (isNaN(d)) return 'Invalid date';
    if (d < new Date(Date.now() - 60000)) return 'Start time cannot be in the past';
    if (d > new Date(Date.now() + 30 * 864e5)) return 'Only up to 30 days ahead';
    return '';
  },
  endTime(v, start) {
    if (!v) return 'End time is required';
    const e = new Date(v), s = new Date(start);
    if (isNaN(e)) return 'Invalid date';
    if (start && e <= s) return 'End time must be after start time';
    const mins = (e - s) / 60000;
    if (start && mins < 30) return 'Minimum booking is 30 minutes';
    if (start && mins > 24 * 60) return 'Maximum booking is 24 hours';
    return '';
  },
  slotNumber(v) {
    v = v.trim().toUpperCase();
    if (!v) return 'Slot number is required';
    if (!/^[A-Z]-\d{2,3}$/.test(v)) return 'Format: A-01';
    return '';
  },
  floor(v) {
    if (v === '') return 'Floor is required';
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 10) return 'Floor must be a whole number 0-10';
    return '';
  },
  price(v) {
    if (v === '') return 'Price is required';
    const n = Number(v);
    if (isNaN(n) || n < 1 || n > 1000) return 'Price must be between 1 and 1000';
    return '';
  },
};

// Shows/clears the error message under an input
function setError(input, msg) {
  const field = input.closest('.field');
  const el = field && field.querySelector('.error');
  input.classList.toggle('invalid', !!msg);
  input.classList.toggle('valid', !msg && input.value !== '');
  if (el) el.textContent = msg || '';
  return !msg;
}

/**
 * Attach live validation to a form.
 * checks: { fieldName: (value, form) => errorMessage }
 * Returns validateAll() which validates every field and returns true if all pass.
 */
function bindValidation(form, checks) {
  Object.keys(checks).forEach((name) => {
    const input = form.elements[name];
    if (!input) return;
    const run = () => setError(input, checks[name](input.value, form));
    input.addEventListener('input', () => input.classList.contains('touched') && run());
    input.addEventListener('blur', () => { input.classList.add('touched'); run(); });
    input.addEventListener('change', run);
  });

  return function validateAll() {
    let ok = true;
    let first = null;
    Object.keys(checks).forEach((name) => {
      const input = form.elements[name];
      if (!input) return;
      input.classList.add('touched');
      if (!setError(input, checks[name](input.value, form))) {
        ok = false;
        first = first || input;
      }
    });
    if (first) first.focus();
    return ok;
  };
}

// Puts server-side validation errors onto the matching inputs
function showServerErrors(form, errors = {}) {
  Object.entries(errors).forEach(([name, msg]) => {
    const input = form.elements[name];
    if (input) setError(input, msg);
  });
}

// Password strength meter (0-5)
function passwordStrength(v) {
  let s = 0;
  if (v.length >= 8) s++;
  if (/[A-Z]/.test(v)) s++;
  if (/[a-z]/.test(v)) s++;
  if (/\d/.test(v)) s++;
  if (/[^A-Za-z0-9]/.test(v)) s++;
  return s;
}
