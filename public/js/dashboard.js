Auth.require();
renderNav('dashboard.html');

const searchForm = document.getElementById('searchForm');
const bookForm = document.getElementById('bookForm');
const modal = document.getElementById('bookModal');
let lastSearch = null; // { vehicleType, start, end }
let chosenSlot = null;
let pickedCard = null;    // result card of the slot being booked
let refreshAfterClose = false;
const prevStates = {};    // slot id -> state at the last live-map refresh
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- Live status ----------
async function loadStatus() {
  const map = document.getElementById('slotMap');
  try {
    const { summary, slots } = await api('/slots/status');
    document.getElementById('sTotal').textContent = summary.total;
    document.getElementById('sFree').textContent = summary.free;
    document.getElementById('sBusy').textContent = summary.occupied;
    const active = summary.total - summary.inactive;
    document.getElementById('sRate').textContent = active ? Math.round((summary.occupied / active) * 100) + '%' : '0%';

    // Remember each slot's state so a change since the last refresh can flash
    const changed = (s) => prevStates[s._id] && prevStates[s._id] !== s.state;
    map.innerHTML = slots.length
      ? slots.map((s) => `
          <div class="slot ${s.state} ${changed(s) ? 'changed' : ''}" title="${s.state === 'occupied' ? 'Free at ' + fmt.time(s.freeAt) : s.state}">
            <div class="num">${escapeHtml(s.slotNumber)}</div>
            <div class="meta">${fmt.icon(s.vehicleType)} ${fmt.type(s.vehicleType)} · F${s.floor}</div>
            <div class="meta">${s.state === 'occupied' ? 'till ' + fmt.time(s.freeAt) : s.state}</div>
          </div>`).join('')
      : '<p class="empty">No slots yet. Ask the admin to add slots (or run npm run seed).</p>';
    slots.forEach((s) => (prevStates[s._id] = s.state));
  } catch (err) {
    map.innerHTML = `<p class="empty">${escapeHtml(err.message)}</p>`;
  }
}

// ---------- Search ----------
// Default window: next full hour for 2 hours
const now = new Date();
now.setMinutes(0, 0, 0);
now.setHours(now.getHours() + 1);
searchForm.startTime.value = toLocalInput(now);
searchForm.endTime.value = toLocalInput(new Date(now.getTime() + 2 * 3600000));
searchForm.startTime.min = toLocalInput(new Date());
searchForm.startTime.max = toLocalInput(new Date(Date.now() + 30 * 864e5));

const validateSearch = bindValidation(searchForm, {
  vehicleType: Rules.vehicleType,
  startTime: Rules.startTime,
  endTime: (v, f) => Rules.endTime(v, f.startTime.value),
});

function updateDuration() {
  const s = new Date(searchForm.startTime.value);
  const e = new Date(searchForm.endTime.value);
  const hint = document.getElementById('durationHint');
  if (!isNaN(s) && !isNaN(e) && e > s) {
    const mins = Math.round((e - s) / 60000);
    hint.textContent = `Duration: ${Math.floor(mins / 60)}h ${mins % 60}m`;
  } else {
    hint.textContent = 'Min 30 minutes · Max 24 hours · Up to 30 days ahead';
  }
}
searchForm.startTime.addEventListener('change', () => {
  searchForm.endTime.min = searchForm.startTime.value;
  if (searchForm.endTime.classList.contains('touched')) searchForm.endTime.dispatchEvent(new Event('change'));
  updateDuration();
});
searchForm.endTime.addEventListener('change', updateDuration);
updateDuration();

searchForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!validateSearch()) return;

  const vehicleType = searchForm.vehicleType.value;
  const start = new Date(searchForm.startTime.value);
  const end = new Date(searchForm.endTime.value);
  await runSearch(vehicleType, start, end);
});

async function runSearch(vehicleType, start, end) {
  lastSearch = { vehicleType, start, end };
  const card = document.getElementById('resultsCard');
  const box = document.getElementById('results');
  const btn = document.getElementById('searchBtn');
  card.style.display = 'block';
  box.innerHTML = '<div class="loader"></div>';
  btn.disabled = true;

  try {
    const qs = new URLSearchParams({ vehicleType, startTime: start.toISOString(), endTime: end.toISOString() });
    const data = await api('/slots/available?' + qs);

    document.getElementById('resultTitle').textContent =
      `${fmt.icon(vehicleType)} ${fmt.type(vehicleType)} slots · ${fmt.dateTime(start)} → ${fmt.time(end)}`;
    document.getElementById('resultBadge').innerHTML =
      `<span class="badge ${data.freeCount ? 'badge-green' : 'badge-red'}">${data.freeCount} of ${data.total} free</span>`;

    if (data.total === 0) {
      box.innerHTML = `<p class="empty">No ${fmt.type(vehicleType)} slots exist in this parking.</p>`;
    } else if (data.freeCount === 0) {
      box.innerHTML = `<p class="empty">All ${fmt.type(vehicleType)} slots are booked for this time.</p>` +
        (data.suggestion
          ? `<div class="suggest">💡 <b>Next free:</b> slot <b>${escapeHtml(data.suggestion.slot.slotNumber)}</b> is free from
              <b>${fmt.dateTime(data.suggestion.startTime)}</b> to <b>${fmt.time(data.suggestion.endTime)}</b>.
              <button class="btn btn-sm mt" id="useSuggestion">Search this time</button></div>`
          : '');
      const use = document.getElementById('useSuggestion');
      if (use) use.onclick = () => {
        const s = new Date(data.suggestion.startTime), en = new Date(data.suggestion.endTime);
        searchForm.startTime.value = toLocalInput(s);
        searchForm.endTime.value = toLocalInput(en);
        updateDuration();
        runSearch(vehicleType, s, en);
      };
    } else {
      box.innerHTML = '<div class="free-list">' + data.free.map((s) => `
        <div class="free-item">
          <div class="top"><span class="num">${escapeHtml(s.slotNumber)}</span><span class="badge badge-green">Free</span></div>
          <span class="cost">Floor ${s.floor} · ${fmt.money(s.pricePerHour)}/hr</span>
          <span><b>Est. ${fmt.money(s.estimatedCost)}</b></span>
          <button class="btn btn-sm" data-id="${s._id}">Book this slot</button>
        </div>`).join('') + '</div>';
      box.querySelectorAll('button[data-id]').forEach((b) => {
        b.onclick = () => {
          box.querySelectorAll('.free-item.picked').forEach((x) => x.classList.remove('picked'));
          pickedCard = b.closest('.free-item');
          pickedCard.classList.add('picked');
          openBooking(data.free.find((s) => s._id === b.dataset.id));
        };
      });
    }
  } catch (err) {
    box.innerHTML = `<p class="empty">${escapeHtml(err.message)}</p>`;
    if (err.errors) showServerErrors(searchForm, err.errors);
  } finally {
    btn.disabled = false;
  }
}

// ---------- Booking ----------
const validateBooking = bindValidation(bookForm, {
  vehicleNumber: Rules.vehicleNumber,
  agree: (v, f) => (f.agree.checked ? '' : 'Please accept to continue'),
});

function openBooking(slot) {
  chosenSlot = slot;
  const { start, end, vehicleType } = lastSearch;
  const hours = ((end - start) / 3600000).toFixed(1);
  document.getElementById('bookSummary').innerHTML = `
    <div><span>Slot</span><b>${escapeHtml(slot.slotNumber)} (Floor ${slot.floor})</b></div>
    <div><span>Vehicle</span><b>${fmt.icon(vehicleType)} ${fmt.type(vehicleType)}</b></div>
    <div><span>From</span><b>${fmt.dateTime(start)}</b></div>
    <div><span>To</span><b>${fmt.dateTime(end)}</b></div>
    <div><span>Rate</span><b>${fmt.money(slot.pricePerHour)}/hr × ${hours}h</b></div>
    <div class="total"><span>Total</span><b>${fmt.money(slot.estimatedCost)}</b></div>`;
  bookForm.reset();
  bookForm.querySelectorAll('input').forEach((i) => { i.classList.remove('invalid', 'valid', 'touched'); });
  bookForm.querySelectorAll('.error').forEach((e) => (e.textContent = ''));
  document.getElementById('bookAlert').classList.remove('show');
  document.getElementById('bookTitle').textContent = 'Confirm booking';
  document.getElementById('bookStep').hidden = false;
  document.getElementById('bookSuccess').hidden = true;
  modal.classList.add('show');
  bookForm.vehicleNumber.focus();
}

function closeModal() {
  if (!modal.classList.contains('show')) return;
  modal.classList.remove('show');
  if (pickedCard && !refreshAfterClose) pickedCard.classList.remove('picked');
  if (refreshAfterClose) {
    refreshAfterClose = false;
    // Let the booked card finish fading out, then refresh the free list
    setTimeout(() => runSearch(lastSearch.vehicleType, lastSearch.start, lastSearch.end), reduceMotion ? 0 : 450);
  }
}

// Success view: car drives into the bay, tick pops, confetti bursts
function showSuccess(b) {
  document.getElementById('bookTitle').textContent = 'Booking confirmed';
  document.getElementById('bookStep').hidden = true;
  document.getElementById('okBay').textContent = b.slot.slotNumber;
  document.getElementById('okTitle').textContent = `Slot ${b.slot.slotNumber} is yours!`;
  document.getElementById('okSummary').innerHTML = `
    <div><span>Vehicle</span><b>${fmt.icon(b.vehicleType)} ${escapeHtml(b.vehicleNumber)}</b></div>
    <div><span>From</span><b>${fmt.dateTime(b.startTime)}</b></div>
    <div><span>To</span><b>${fmt.dateTime(b.endTime)}</b></div>
    <div class="total"><span>Amount</span><b>${fmt.money(b.amount)}</b></div>`;
  const box = document.getElementById('bookSuccess');
  box.hidden = false;
  // Restart the CSS animations every time
  box.classList.remove('play');
  void box.offsetWidth;
  box.classList.add('play');
  document.getElementById('okDone').focus();

  if (!reduceMotion) confetti(document.getElementById('bookCard'));
  if (pickedCard) pickedCard.classList.replace('picked', 'booked-out');
  refreshAfterClose = true;
}

function confetti(host) {
  const colors = ['#22c55e', '#2563eb', '#f59e0b', '#ef4444', '#a855f7', '#14b8a6'];
  for (let i = 0; i < 36; i++) {
    const p = document.createElement('span');
    p.className = 'confetti';
    const angle = Math.random() * Math.PI * 2;
    const dist = 90 + Math.random() * 140;
    p.style.cssText = `--x:${Math.cos(angle) * dist}px;--y:${Math.sin(angle) * dist - 60}px;--r:${Math.random() * 720 - 360}deg;` +
      `background:${colors[i % colors.length]};animation-delay:${0.9 + Math.random() * 0.15}s`;
    host.appendChild(p);
    setTimeout(() => p.remove(), 2400);
  }
}

document.getElementById('okDone').onclick = closeModal;
document.getElementById('closeModal').onclick = closeModal;
modal.addEventListener('click', (e) => e.target === modal && closeModal());
document.addEventListener('keydown', (e) => e.key === 'Escape' && closeModal());

bookForm.vehicleNumber.addEventListener('input', () => {
  bookForm.vehicleNumber.value = bookForm.vehicleNumber.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});

bookForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const alertBox = document.getElementById('bookAlert');
  alertBox.classList.remove('show');
  if (!validateBooking()) return;

  const btn = document.getElementById('bookBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Booking your slot...';
  try {
    const b = await api('/bookings', {
      method: 'POST',
      body: {
        slotId: chosenSlot._id,
        vehicleNumber: bookForm.vehicleNumber.value,
        vehicleType: lastSearch.vehicleType,
        startTime: lastSearch.start.toISOString(),
        endTime: lastSearch.end.toISOString(),
      },
    });
    showSuccess(b);
    toast(`Slot ${b.slot.slotNumber} booked! Amount ${fmt.money(b.amount)}`);
    loadStatus();
  } catch (err) {
    showServerErrors(bookForm, err.errors);
    alertBox.textContent = err.message;
    alertBox.classList.add('show');
    const card = document.getElementById('bookCard');
    card.classList.remove('shake');
    void card.offsetWidth;
    card.classList.add('shake');
    if (err.status === 409 && !err.errors?.vehicleNumber) {
      runSearch(lastSearch.vehicleType, lastSearch.start, lastSearch.end);
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Confirm Booking';
  }
});

document.getElementById('refreshBtn').onclick = loadStatus;
loadStatus();
setInterval(loadStatus, 30000); // auto refresh every 30s
