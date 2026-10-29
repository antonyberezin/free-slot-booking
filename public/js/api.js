// Shared helpers: API calls, auth/session, navbar, toast, formatting
const API = '/api';

const Auth = {
  get token() { return localStorage.getItem('token'); },
  get user() {
    try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
  },
  save(token, user) {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
  },
  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    location.href = 'login.html';
  },
  // Redirects to login if not signed in (or not admin when required)
  require(role) {
    const u = this.user;
    if (!this.token || !u) { location.href = 'login.html'; return null; }
    if (role && u.role !== role) { location.href = 'dashboard.html'; return null; }
    return u;
  },
};

async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (Auth.token) headers.Authorization = `Bearer ${Auth.token}`;

  let res;
  try {
    res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw { message: 'Cannot reach server. Is it running?' };
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && Auth.token) {
    Auth.logout();
  }
  if (!res.ok) throw { status: res.status, message: data.message || 'Request failed', errors: data.errors || {} };
  return data;
}

function toast(message, type = 'success') {
  let box = document.getElementById('toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => el.classList.add('hide'), 3200);
  setTimeout(() => el.remove(), 3600);
}

function renderNav(active) {
  const nav = document.getElementById('nav');
  if (!nav) return;
  const u = Auth.user;
  const link = (href, label) =>
    `<a href="${href}" class="${active === href ? 'active' : ''}">${label}</a>`;

  let links = link('index.html', 'Home');
  if (u) {
    links += link('dashboard.html', 'Find Slot') + link('timeline.html', 'Day View') + link('bookings.html', 'My Bookings');
    if (u.role === 'admin') links += link('admin.html', 'Admin');
    links += `<span class="nav-user">Hi, ${escapeHtml(u.name.split(' ')[0])}</span>
              <button class="btn btn-sm btn-outline" id="logoutBtn">Logout</button>`;
  } else {
    links += link('login.html', 'Login') + `<a href="register.html" class="btn btn-sm">Register</a>`;
  }

  nav.innerHTML = `
    <div class="nav-inner">
      <a href="index.html" class="brand"><span class="logo">P</span> SlotFinder</a>
      <button class="nav-toggle" aria-label="Menu">&#9776;</button>
      <div class="nav-links">${links}</div>
    </div>`;
  nav.querySelector('.nav-toggle').onclick = () => nav.classList.toggle('open');
  const lo = document.getElementById('logoutBtn');
  if (lo) lo.onclick = () => Auth.logout();
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const fmt = {
  dateTime: (d) => new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
  time: (d) => new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
  money: (n) => `₹${Number(n).toLocaleString('en-IN')}`,
  type: (t) => ({ car: 'Car', bike: 'Bike', truck: 'Truck', ev: 'EV' }[t] || t),
  icon: (t) => ({ car: '🚗', bike: '🏍️', truck: '🚚', ev: '⚡' }[t] || '🅿️'),
};

// Value for <input type="datetime-local"> in the user's local time
function toLocalInput(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
