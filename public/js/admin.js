Auth.require('admin');
renderNav('admin.html');

const form = document.getElementById('slotForm');
const alertBox = document.getElementById('slotAlert');
let slots = [];
let bookings = [];
let flashSlot = null; // slot number to highlight after add / edit

// Slide a table row out before the list is reloaded
const rowOut = (row) => new Promise((res) => {
  if (!row || matchMedia('(prefers-reduced-motion: reduce)').matches) return res();
  row.classList.add('row-out');
  setTimeout(res, 350);
});

const validateSlot = bindValidation(form, {
  slotNumber: Rules.slotNumber,
  vehicleType: Rules.vehicleType,
  floor: Rules.floor,
  pricePerHour: Rules.price,
});

async function loadStats() {
  try {
    const s = await api('/bookings/stats');
    document.getElementById('stTotal').textContent = s.total;
    document.getElementById('stActive').textContent = s.active;
    document.getElementById('stCancelled').textContent = s.cancelled;
    document.getElementById('stRevenue').textContent = fmt.money(s.revenue);
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function loadSlots() {
  const box = document.getElementById('slotTable');
  try {
    slots = await api('/slots');
    if (!slots.length) { box.innerHTML = '<p class="empty">No slots yet.</p>'; return; }
    box.innerHTML = `<table>
      <thead><tr><th>Slot</th><th>Type</th><th>Floor</th><th>₹/hr</th><th>Status</th><th></th></tr></thead>
      <tbody>${slots.map((s) => `<tr class="${s.slotNumber === flashSlot ? 'flash' : ''}" data-row="${s._id}">
        <td><b>${escapeHtml(s.slotNumber)}</b></td>
        <td>${fmt.icon(s.vehicleType)} ${fmt.type(s.vehicleType)}</td>
        <td>${s.floor}</td>
        <td>${s.pricePerHour}</td>
        <td><span class="badge ${s.isActive ? 'badge-green' : 'badge-grey'}">${s.isActive ? 'Active' : 'Inactive'}</span></td>
        <td>
          <button class="btn btn-sm btn-outline" data-edit="${s._id}">Edit</button>
          <button class="btn btn-sm btn-danger" data-del="${s._id}">Delete</button>
        </td></tr>`).join('')}</tbody></table>`;

    box.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => startEdit(b.dataset.edit)));
    box.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => removeSlot(b.dataset.del)));
    const flashed = box.querySelector('tr.flash');
    if (flashed) flashed.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    flashSlot = null;
  } catch (err) {
    box.innerHTML = `<p class="empty">${escapeHtml(err.message)}</p>`;
  }
}

function resetForm() {
  form.reset();
  form.elements.id.value = '';
  form.querySelectorAll('input, select').forEach((i) => i.classList.remove('invalid', 'valid', 'touched'));
  form.querySelectorAll('.error').forEach((e) => (e.textContent = ''));
  alertBox.classList.remove('show');
  document.getElementById('formTitle').textContent = 'Add new slot';
  document.getElementById('saveBtn').textContent = 'Add Slot';
  document.getElementById('cancelEdit').style.display = 'none';
}

function startEdit(id) {
  const s = slots.find((x) => x._id === id);
  resetForm();
  form.elements.id.value = s._id;
  form.slotNumber.value = s.slotNumber;
  form.vehicleType.value = s.vehicleType;
  form.floor.value = s.floor;
  form.pricePerHour.value = s.pricePerHour;
  form.isActive.checked = s.isActive;
  document.getElementById('formTitle').textContent = `Edit slot ${s.slotNumber}`;
  document.getElementById('saveBtn').textContent = 'Save Changes';
  document.getElementById('cancelEdit').style.display = 'inline-flex';
  form.scrollIntoView({ behavior: 'smooth' });
}

async function removeSlot(id) {
  const s = slots.find((x) => x._id === id);
  if (!confirm(`Delete slot ${s.slotNumber}? This cannot be undone.`)) return;
  try {
    const r = await api('/slots/' + id, { method: 'DELETE' });
    toast(r.message);
    await rowOut(document.querySelector(`[data-row="${id}"]`));
    loadSlots();
  } catch (err) {
    toast(err.message, 'error');
  }
}

document.getElementById('cancelEdit').onclick = resetForm;

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  alertBox.classList.remove('show');
  if (!validateSlot()) return;

  const id = form.elements.id.value;
  const body = {
    slotNumber: form.slotNumber.value.trim().toUpperCase(),
    vehicleType: form.vehicleType.value,
    floor: Number(form.floor.value),
    pricePerHour: Number(form.pricePerHour.value),
    isActive: form.isActive.checked,
  };
  const btn = document.getElementById('saveBtn');
  btn.disabled = true;
  try {
    await api(id ? '/slots/' + id : '/slots', { method: id ? 'PUT' : 'POST', body });
    toast(id ? 'Slot updated' : 'Slot added');
    flashSlot = body.slotNumber;
    resetForm();
    loadSlots();
  } catch (err) {
    showServerErrors(form, err.errors);
    alertBox.textContent = err.message;
    alertBox.classList.add('show');
  } finally {
    btn.disabled = false;
  }
});

// ---------- Bookings ----------
function renderBookings() {
  const box = document.getElementById('bookingTable');
  const q = document.getElementById('search').value.trim().toLowerCase();
  const rows = bookings.filter((b) =>
    !q || [b.vehicleNumber, b.user?.name, b.user?.email, b.slot?.slotNumber].some((v) => (v || '').toLowerCase().includes(q))
  );
  if (!rows.length) { box.innerHTML = '<p class="empty">No bookings found.</p>'; return; }

  const now = new Date();
  box.innerHTML = `<table>
    <thead><tr><th>User</th><th>Slot</th><th>Vehicle</th><th>From</th><th>To</th><th>Amount</th><th>Status</th><th></th></tr></thead>
    <tbody>${rows.map((b) => {
      const live = b.status === 'booked' && new Date(b.endTime) > now;
      const st = b.status === 'cancelled' ? 'cancelled' : live ? 'booked' : 'completed';
      const cls = { cancelled: 'badge-red', booked: 'badge-blue', completed: 'badge-grey' }[st];
      return `<tr>
        <td>${escapeHtml(b.user?.name || '-')}<br><small class="muted">${escapeHtml(b.user?.phone || '')}</small></td>
        <td><b>${escapeHtml(b.slot?.slotNumber || 'Deleted')}</b></td>
        <td>${fmt.icon(b.vehicleType)} ${escapeHtml(b.vehicleNumber)}</td>
        <td>${fmt.dateTime(b.startTime)}</td>
        <td>${fmt.dateTime(b.endTime)}</td>
        <td>${fmt.money(b.amount)}</td>
        <td><span class="badge ${cls}">${st}</span></td>
        <td>${live ? `<button class="btn btn-sm btn-danger" data-cancel="${b._id}">Cancel</button>` : ''}</td>
      </tr>`;
    }).join('')}</tbody></table>`;

  box.querySelectorAll('[data-cancel]').forEach((btn) => {
    btn.onclick = async () => {
      if (!confirm('Cancel this booking?')) return;
      try {
        const r = await api(`/bookings/${btn.dataset.cancel}/cancel`, { method: 'PATCH' });
        toast(r.message);
        await rowOut(btn.closest('tr'));
        loadBookings();
        loadStats();
      } catch (err) {
        toast(err.message, 'error');
      }
    };
  });
}

async function loadBookings() {
  try {
    bookings = await api('/bookings');
    renderBookings();
  } catch (err) {
    document.getElementById('bookingTable').innerHTML = `<p class="empty">${escapeHtml(err.message)}</p>`;
  }
}

document.getElementById('search').addEventListener('input', renderBookings);

loadStats();
loadSlots();
loadBookings();
