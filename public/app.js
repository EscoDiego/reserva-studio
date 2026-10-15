const $ = selector => document.querySelector(selector);
let services = [], selected, time = '', token = '', slotRequest = 0;
const money = value => new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(value) + ' MXN';
async function api(url, options = {}) {
  const response = await fetch(url,{...options,headers:{'Content-Type':'application/json',...options.headers}});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Ocurrió un error. Intenta de nuevo.');
  return data;
}
function message(selector, text, error = false) { $(selector).textContent = text; $(selector).classList.toggle('error',error); }
function summary() {
  $('#summary-service').textContent = selected.name;
  $('#summary-price').textContent = money(selected.price);
  $('#summary-date').textContent = $('#date').value ? `${$('#date').value} ${time ? '· ' + time : '· Elige un horario'}` : 'Selecciona fecha y horario';
}
async function loadSlots() {
  const request = ++slotRequest;
  time = ''; summary(); $('#slots').textContent = 'Consultando horarios…';
  try {
    const data = await api(`/api/slots?service=${selected.id}&date=${$('#date').value}`);
    if (request !== slotRequest) return;
    $('#slots').replaceChildren();
    if (!data.slots.length) $('#slots').textContent = 'No quedan horarios para esta fecha. Prueba otro día.';
    data.slots.forEach(value => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'slot'; button.textContent = value; button.setAttribute('aria-pressed','false');
      button.onclick = () => { time = value; document.querySelectorAll('.slot').forEach(b => {b.classList.toggle('selected',b === button); b.setAttribute('aria-pressed',String(b === button));}); summary(); };
      $('#slots').append(button);
    });
  } catch(e) { if (request === slotRequest) $('#slots').textContent = e.message; }
}
document.querySelectorAll('[data-view]').forEach(button => button.onclick = () => {
  document.querySelectorAll('.view').forEach(view => view.classList.toggle('hidden',view.id !== button.dataset.view));
  document.querySelectorAll('.nav').forEach(nav => nav.classList.toggle('active',nav === button));
});
$('#date').onchange = loadSlots;
$('#booking-form').onsubmit = async event => {
  event.preventDefault();
  if (!time) return message('#booking-message','Selecciona un horario disponible.',true);
  $('#submit').disabled = true;
  try {
    const booking = await api('/api/bookings',{method:'POST',body:JSON.stringify({service:selected.id,date:$('#date').value,time,name:$('#name').value,email:$('#email').value})});
    message('#booking-message',`¡Tu reserva está confirmada! ${booking.service} · ${booking.date} · ${booking.time}. Guarda tu código: ${booking.code}. No se envían correos automáticos.`);
    $('#booking-message').classList.add('result');
    await loadSlots();
  } catch(e) {message('#booking-message',e.message,true); await loadSlots();}
  finally {$('#submit').disabled = false;}
};
function resultBox(parent, lines) {
  const box = document.createElement('div'); box.className = 'result';
  lines.forEach(line => {const p = document.createElement('p'); p.textContent = line; box.append(p);}); parent.replaceChildren(box);
}
$('#lookup-form').onsubmit = async event => {
  event.preventDefault();
  try {
    const booking = await api('/api/bookings/lookup',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(event.target)))});
    resultBox($('#lookup-result'),[services.find(s=>s.id === booking.service)?.name || booking.service,`${booking.date} · ${booking.time} · Hora de Ciudad de México`,booking.status === 'confirmed' ? 'Reserva confirmada' : 'Reserva cancelada',`Código: ${booking.code}`]);
  } catch(e) {message('#lookup-result',e.message,true);}
};
async function loadAdmin() {
  try {
    const bookings = await api('/api/admin/bookings',{headers:{Authorization:`Bearer ${token}`}});
    message('#admin-message',''); $('#admin-list').replaceChildren();
    $('#admin-stats').textContent = `${bookings.filter(b=>b.status==='confirmed').length} confirmadas · ${bookings.filter(b=>b.status==='cancelled').length} canceladas`;
    if (!bookings.length) $('#admin-list').textContent = 'Tu agenda está vacía. Las nuevas reservas aparecerán aquí.';
    bookings.forEach(booking => {
      const row = document.createElement('article'); row.className = 'booking-row';
      const text = document.createElement('p');
      const title = document.createElement('strong'); title.textContent = `${booking.date} · ${booking.time} — ${booking.name}`;
      const detail = document.createElement('div'); detail.textContent = `${services.find(s=>s.id===booking.service)?.name} · ${booking.email}`;
      const status = document.createElement('span');status.className='badge';status.textContent=booking.status==='confirmed'?'Confirmada':'Cancelada';
      text.append(title,detail,status);row.append(text);
      if (booking.status === 'confirmed') {
        const button = document.createElement('button'); button.className='cancel';button.textContent='Cancelar cita';
        button.onclick = async () => {
          if (!confirm(`¿Cancelar la cita de ${booking.name} del ${booking.date} a las ${booking.time}?`)) return;
          button.disabled=true;
          try {await api(`/api/admin/bookings/${booking.code}`,{method:'PATCH',headers:{Authorization:`Bearer ${token}`},body:JSON.stringify({status:'cancelled'})});await loadAdmin();await loadSlots();} catch(e){message('#admin-message',e.message,true);button.disabled=false;}
        }; row.append(button);
      }
      $('#admin-list').append(row);
    });
  } catch(e) { token=''; $('#admin-list').replaceChildren(); $('#admin-stats').textContent=''; message('#admin-message',e.message,true); }
}
$('#admin-form').onsubmit = event => {event.preventDefault();token=new FormData(event.target).get('token');event.target.reset();loadAdmin();};
async function init() {
  try {
    const data = await api('/api/services'); services=data.services;selected=services[0];
    $('#date').min=data.today; $('#date').value=data.today;
    const max=new Date(data.today+'T12:00:00Z');max.setUTCDate(max.getUTCDate()+89);$('#date').max=max.toISOString().slice(0,10);
    services.forEach(service=>{
      const button=document.createElement('button');button.type='button';button.className='service';button.setAttribute('aria-pressed',String(service===selected));button.classList.toggle('selected',service===selected);
      const icon=document.createElement('span');icon.className='service-icon';icon.textContent=service.icon;
      const content=document.createElement('span');content.className='service-content';const name=document.createElement('strong');name.textContent=service.name;const desc=document.createElement('small');desc.textContent=service.description;content.append(name,desc);
      const price=document.createElement('span');price.className='price';price.textContent=money(service.price);const duration=document.createElement('small');duration.textContent=service.duration+' min';price.append(duration);
      const radio=document.createElement('span');radio.className='radio';button.append(icon,content,price,radio);
      button.onclick=()=>{selected=service;document.querySelectorAll('.service').forEach(b=>{b.classList.toggle('selected',b===button);b.setAttribute('aria-pressed',String(b===button));});loadSlots();};$('#services').append(button);
    });await loadSlots();
  } catch(e){message('#booking-message',e.message,true);$('#submit').disabled=true;}
}
init();
