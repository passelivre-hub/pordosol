// static/script.js
// Mobile-first calendar app for Cabanas Pôr do Sol
const API_BASE = '';

/* Helpers */
const qs = s => document.querySelector(s);
const qsa = s => Array.from(document.querySelectorAll(s));

function formatDateISO(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  return `${yyyy}-${mm}-${dd}`;
}
function isoToDisplay(iso) { 
  if (!iso) return '';
  const [y,m,d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function parseISO(iso) {
  if (!iso) return null;
  return new Date(iso + 'T00:00:00');
}
function addDaysISO(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return formatDateISO(d);
}
function centsToBr(cents) {
  const n = (Number(cents) || 0) / 100;
  return n.toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
}

/* State */
let currentDate = new Date();
let visibleYear = currentDate.getFullYear();
let visibleMonth = currentDate.getMonth();
let reservations = [];

/* DOM */
const calendarEl = qs('#calendar');
const novaReservaBtn = qs('#novaReservaBtn');
const modal = qs('#modal');
const modalTitle = qs('#modalTitle');
const reservationForm = qs('#reservationForm');
const resId = qs('#resId');
const chaleEl = qs('#chale');
const nomeEl = qs('#nome');
const whatsappEl = qs('#whatsapp');
const valorEl = qs('#valor');
const pessoasEl = qs('#pessoas');
const checkinEl = qs('#checkin');
const checkoutEl = qs('#checkout');
const observacoesEl = qs('#observacoes');

const btnSalvar = qs('#btnSalvar');
const btnCheckin = qs('#btnCheckin');
const btnCheckout = qs('#btnCheckout');
const btnRemover = qs('#btnRemover');
const btnCancelar = qs('#btnCancelar');
const openWhatsAppBtn = qs('#openWhatsApp');

/* Modal UI */
function showModal(mode='new') {
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden','false');
  if (mode === 'new') {
    modalTitle.textContent = 'Nova Reserva';
    btnCheckin.style.display = 'none';
    btnCheckout.style.display = 'none';
    btnRemover.style.display = 'none';
  } else {
    modalTitle.textContent = 'Editar Reserva';
    btnCheckin.style.display = 'inline-block';
    btnCheckout.style.display = 'inline-block';
    btnRemover.style.display = 'inline-block';
  }
}
function hideModal() {
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden','true');
  reservationForm.reset();
  resId.value = '';
}

/* API */
async function loadReservations() {
  const firstDay = new Date(visibleYear, visibleMonth, 1);
  const lastDay = new Date(visibleYear, visibleMonth + 1, 0);
  const from = formatDateISO(firstDay);
  const to = formatDateISO(lastDay);
  try {
    const resp = await fetch(`${API_BASE}/api/reservations?from=${from}&to=${to}`);
    reservations = await resp.json();
  } catch (err) {
    console.error('Erro carregando reservas', err);
    reservations = [];
  }
  renderCalendar();
}

async function fetchReservationById(id) {
  const resp = await fetch(`${API_BASE}/api/reservations/${id}`);
  if (!resp.ok) throw new Error('Reserva não encontrada');
  return await resp.json();
}

/* Calendar rendering */
function renderCalendar(){
  calendarEl.innerHTML = '';

  const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const header = document.createElement('div');
  header.className = 'month';
  header.innerHTML = `
    <h3>${monthNames[visibleMonth]} ${visibleYear}</h3>
    <div class="nav">
      <button class="btn ghost" id="prevMonth">&lt;</button>
      <button class="btn ghost" id="nextMonth">&gt;</button>
    </div>
  `;
  calendarEl.appendChild(header);

  const weekdays = document.createElement('div');
  weekdays.className = 'weekdays';
  const wk = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  wk.forEach(d => {
    const el = document.createElement('div');
    el.textContent = d;
    weekdays.appendChild(el);
  });
  calendarEl.appendChild(weekdays);

  const days = document.createElement('div');
  days.className = 'days';
  calendarEl.appendChild(days);

  const firstOfMonth = new Date(visibleYear, visibleMonth, 1);
  const startIndex = firstOfMonth.getDay();
  const daysInMonth = new Date(visibleYear, visibleMonth+1, 0).getDate();

  for (let i=0;i<startIndex;i++){
    const cell = document.createElement('div');
    cell.className = 'cell empty';
    days.appendChild(cell);
  }

  for (let d=1; d<=daysInMonth; d++){
    const cellDate = new Date(visibleYear, visibleMonth, d);
    const iso = formatDateISO(cellDate);
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.dataset.date = iso;
    cell.innerHTML = `<div class="dateNum">${d}</div>`;

    cell.addEventListener('click', async () => {
      const matches = reservations.filter(r => (r.checkin <= iso && r.checkout >= iso));

      if (matches.length > 1) {
        const pick = prompt(
          'Selecione a reserva:\n' +
          matches.map((m,i) => `${i+1}. Chalé ${m.chale} - ${m.nome}`).join('\n')
        );
        const index = Number(pick) - 1;
        if (matches[index]) {
          await openReservationEdit(matches[index].id);
        }
      } else if (matches.length === 1) {
        await openReservationEdit(matches[0].id);
      } else {
        openNewReservation(iso);
      }
    });

    const occ = reservations.filter(r => (r.checkin <= iso && r.checkout >= iso));
    if (occ.length) {
      occ.sort((a,b) => a.chale - b.chale);
      const wrap = document.createElement('div');
      wrap.className = 'bar-wrap';
      occ.forEach(r => {
        const bar = document.createElement('div');
        bar.className = 'res-bar';
        if (r.status === 'checkin') bar.classList.add('green');
        else if (r.observacoes && r.observacoes.trim().length > 0) bar.classList.add('note');
        else bar.classList.add('blue');

        const label = document.createElement('div');
        label.textContent = `C${r.chale} • ${r.nome || '—'}`;
        bar.appendChild(label);

        bar.addEventListener('click', (ev) => {
          ev.stopPropagation();
          openReservationEdit(r.id);
        });

        wrap.appendChild(bar);
      });
      cell.appendChild(wrap);
    }

    days.appendChild(cell);
  }

  qs('#prevMonth').addEventListener('click', () => {
    visibleMonth--;
    if (visibleMonth < 0) { visibleMonth = 11; visibleYear--; }
    loadReservations();
  });
  qs('#nextMonth').addEventListener('click', () => {
    visibleMonth++;
    if (visibleMonth > 11) { visibleMonth = 0; visibleYear++; }
    loadReservations();
  });
}

/* New reservation */
function openNewReservation(isoDate) {
  resId.value = '';
  chaleEl.value = '1';
  nomeEl.value = '';
  whatsappEl.value = '';
  valorEl.value = '';
  pessoasEl.value = 2;
  checkinEl.value = isoDate || formatDateISO(new Date());
  checkoutEl.value = isoDate ? addDaysISO(isoDate, 1) : addDaysISO(formatDateISO(new Date()), 1);
  observacoesEl.value = '';
  showModal('new');
}

/* Edit reservation by id */
async function openReservationEdit(id) {
  try {
    const r = await fetchReservationById(id);
    if (!r) { alert('Reserva não encontrada'); return; }
    resId.value = r.id;
    chaleEl.value = String(r.chale || 1);
    nomeEl.value = r.nome || '';
    whatsappEl.value = (r.whatsapp || '');
    valorEl.value = centsToBr(r.valor_cents || 0);
    pessoasEl.value = r.pessoas || 2;
    checkinEl.value = r.checkin || '';
    checkoutEl.value = r.checkout || '';
    observacoesEl.value = r.observacoes || '';

    if (r.status === 'checkin') {
      btnCheckin.style.display = 'none';
      btnCheckout.style.display = 'inline-block';
    } else {
      btnCheckin.style.display = 'inline-block';
      btnCheckout.style.display = 'none';
    }

    btnRemover.style.display = 'inline-block';
    showModal('edit');
  } catch (err) {
    console.error('Erro abrir reserva', err);
    alert('Erro ao abrir reserva');
  }
}

/* Save */
reservationForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = resId.value;
  const payload = {
    chale: Number(chaleEl.value || 1),
    nome: nomeEl.value.trim(),
    whatsapp: whatsappEl.value.replace(/\D/g,''),
    valor: valorEl.value.trim(),
    pessoas: Number(pessoasEl.value || 2),
    checkin: checkinEl.value,
    checkout: checkoutEl.value,
    observacoes: observacoesEl.value.trim()
  };

  if (!payload.checkin || !payload.checkout) {
    alert('Preencha check-in e check-out');
    return;
  }
  if (new Date(payload.checkout) < new Date(payload.checkin)) {
    alert('Checkout deve ser igual ou posterior ao checkin');
    return;
  }

  try {
    if (id) {
      await fetch(`${API_BASE}/api/reservations/${id}`, {
        method: 'PUT',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
    } else {
      await fetch(`${API_BASE}/api/reservations`, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
    }
    await loadReservations();
    hideModal();
  } catch (err) {
    console.error('Erro salvar', err);
    alert('Erro ao salvar reserva');
  }
});

/* Remove */
btnRemover.addEventListener('click', async () => {
  const id = resId.value;
  if (!id) return;
  if (!confirm('Remover reserva?')) return;
  try {
    await fetch(`${API_BASE}/api/reservations/${id}`, { method: 'DELETE' });
    await loadReservations();
    hideModal();
  } catch (err) {
    console.error('Erro remover', err);
    alert('Erro ao remover reserva');
  }
});

/* Checkin */
btnCheckin.addEventListener('click', async () => {
  const id = resId.value;
  if (!id) return;
  if (!confirm('Registrar check-in dessa reserva?')) return;
  try {
    await fetch(`${API_BASE}/api/reservations/${id}/checkin`, { method: 'POST' });
    await loadReservations();
    hideModal();
  } catch (err) {
    console.error('Erro checkin', err);
    alert('Erro ao registrar check-in');
  }
});

/* Checkout */
btnCheckout.addEventListener('click', async () => {
  const id = resId.value;
  if (!id) return;
  if (!confirm('Registrar checkout dessa reserva?')) return;
  try {
    await fetch(`${API_BASE}/api/reservations/${id}/checkout`, { method: 'POST' });
    await loadReservations();
    hideModal();
  } catch (err) {
    console.error('Erro checkout', err);
    alert('Erro ao registrar checkout');
  }
});

/* Cancel */
btnCancelar.addEventListener('click', () => {
  hideModal();
});

/* WhatsApp open */
openWhatsAppBtn.addEventListener('click', () => {
  const phone = whatsappEl.value.replace(/\D/g,'');
  if (!phone || phone.length < 11) {
    alert('Preencha um número de WhatsApp válido.');
    return;
  }
  window.open(`https://wa.me/55${phone}`, '_blank');
});

/* Máscara WhatsApp (XX) XXXXX-XXXX */
whatsappEl.addEventListener('input', (e) => {
  let v = e.target.value.replace(/\D/g,'').slice(0,11);
  if (v.length > 2 && v.length <= 7) {
    v = `(${v.slice(0,2)}) ${v.slice(2)}`;
  } else if (v.length > 7) {
    v = `(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`;
  }
  e.target.value = v;
});

/* Máscara valor R$ */
valorEl.addEventListener('input', (e) => {
  let v = e.target.value.replace(/\D/g,'');
  if (!v) v = '0';
  while (v.length < 3) v = '0'+v;
  const cents = v.slice(-2);
  let integer = v.slice(0,-2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  e.target.value = `${integer},${cents}`;
});

/* New reservation top button */
novaReservaBtn.addEventListener('click', () => {
  openNewReservation(formatDateISO(new Date()));
});

/* Close modal clicking outside */
modal.addEventListener('click', (e) => {
  if (e.target === modal) hideModal();
});

/* Init */
function init(){
  visibleYear = currentDate.getFullYear();
  visibleMonth = currentDate.getMonth();
  loadReservations();
}
init();
