import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
export const services = [
  { id: 'massage', name: 'Masaje relajante', description: 'Una pausa para soltar la tensión y volver a ti.', duration: 60, price: 650, icon: '✦' },
  { id: 'facial', name: 'Facial revitalizante', description: 'Cuidado personalizado para iluminar tu piel.', duration: 60, price: 550, icon: '☼' },
  { id: 'ritual', name: 'Ritual de bienestar', description: 'Masaje y aromaterapia en una sesión renovadora.', duration: 120, price: 1100, icon: '❋' }
];
export function createApp({ dbPath = path.join(root, 'data', 'bookings.db'), adminToken = process.env.ADMIN_TOKEN } = {}) {
  if (dbPath !== ':memory:') mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS bookings (
    code TEXT PRIMARY KEY, service TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL,
    duration INTEGER NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'confirmed', created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const validDate = date => /^\d{4}-\d{2}-\d{2}$/.test(date || '') && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0,10) === date && date >= today() && Date.parse(date) <= Date.now() + 90 * 86400000;
  const minutes = time => Number(time.slice(0,2)) * 60 + Number(time.slice(3));
  function slots(date, service) {
    if (!validDate(date)) return [];
    const taken = db.prepare("SELECT time,duration FROM bookings WHERE date=? AND status='confirmed'").all(date);
    const current = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Mexico_City', hour:'2-digit', minute:'2-digit', hour12:false }).format(new Date());
    return Array.from({length: 9}, (_, i) => `${String(i + 10).padStart(2,'0')}:00`).filter(time => {
      const start = minutes(time);
      return start + service.duration <= 19 * 60 && (date !== today() || time > current) && !taken.some(b => start < minutes(b.time) + b.duration && start + service.duration > minutes(b.time));
    });
  }
  const server = http.createServer(async (req, res) => {
    const send = (status, payload) => { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store'}); res.end(JSON.stringify(payload)); };
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        if (url.pathname.startsWith('/api/admin')) {
          const supplied = Buffer.from(req.headers.authorization || '');
          const expected = Buffer.from(`Bearer ${adminToken || ''}`);
          if (!adminToken || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return send(401,{error:'Acceso no autorizado. Revisa tu clave.'});
        }
        let body = {};
        if (['POST','PATCH'].includes(req.method)) {
          let raw = '';
          for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 8192) return send(413,{error:'Solicitud demasiado grande.'}); }
          try { body = JSON.parse(raw); } catch { return send(400,{error:'Datos inválidos.'}); }
          if (!body || typeof body !== 'object') return send(400,{error:'Datos inválidos.'});
        }
        if (req.method === 'GET' && url.pathname === '/api/services') return send(200, {services, today:today()});
        if (req.method === 'GET' && url.pathname === '/api/slots') {
          const service = services.find(s => s.id === url.searchParams.get('service'));
          if (!service || !validDate(url.searchParams.get('date'))) return send(400,{error:'Elige una fecha válida dentro de los próximos 90 días.'});
          return send(200,{slots:slots(url.searchParams.get('date'),service)});
        }
        if (req.method === 'POST' && url.pathname === '/api/bookings') {
          const service = services.find(s => s.id === body.service);
          if (!service || !validDate(body.date) || typeof body.name !== 'string' || body.name.trim().length < 2 || body.name.length > 100 || typeof body.email !== 'string' || body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) return send(400,{error:'Revisa el servicio, la fecha, tu nombre y tu correo.'});
          db.exec('BEGIN IMMEDIATE');
          try {
            if (!slots(body.date, service).includes(body.time)) { db.exec('ROLLBACK'); return send(409,{error:'Ese horario ya no está disponible. Elige otro.'}); }
            const code = randomBytes(10).toString('hex').toUpperCase();
            db.prepare('INSERT INTO bookings (code,service,date,time,duration,name,email) VALUES (?,?,?,?,?,?,?)').run(code,service.id,body.date,body.time,service.duration,body.name.trim(),body.email.trim().toLowerCase());
            db.exec('COMMIT'); return send(201,{code,service:service.name,date:body.date,time:body.time});
          } catch(e) { db.exec('ROLLBACK'); throw e; }
        }
        if (req.method === 'POST' && url.pathname === '/api/bookings/lookup') {
          const booking = typeof body.code === 'string' && typeof body.email === 'string' ? db.prepare('SELECT code,service,date,time,status FROM bookings WHERE code=? AND email=?').get(body.code.trim().toUpperCase(),body.email.trim().toLowerCase()) : null;
          return booking ? send(200,booking) : send(404,{error:'No encontramos una reserva con esos datos.'});
        }
        if (req.method === 'GET' && url.pathname === '/api/admin/bookings') return send(200,db.prepare('SELECT * FROM bookings ORDER BY date,time').all());
        if (req.method === 'PATCH' && /^\/api\/admin\/bookings\/[A-F0-9]{20}$/.test(url.pathname)) {
          if (body.status !== 'cancelled') return send(400,{error:'Estado inválido.'});
          const result = db.prepare("UPDATE bookings SET status='cancelled' WHERE code=? AND status='confirmed'").run(url.pathname.split('/').pop());
          return result.changes ? send(200,{ok:true}) : send(404,{error:'Reserva no encontrada o ya cancelada.'});
        }
        return send(404,{error:'Ruta no encontrada.'});
      }
      const files = {'/':'index.html','/app.js':'app.js','/styles.css':'styles.css'};
      const file = files[url.pathname];
      if (!file || req.method !== 'GET') return send(404,{error:'No encontrado.'});
      res.writeHead(200,{'Content-Type': file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8', 'X-Content-Type-Options':'nosniff', 'Content-Security-Policy':"default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; frame-ancestors 'none'", 'Referrer-Policy':'no-referrer'});
      res.end(readFileSync(path.join(root,'public',file)));
    } catch { if (!res.headersSent) send(500,{error:'No pudimos procesar la solicitud.'}); else res.end(); }
  });
  server.on('close',()=>db.close());
  return server;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createApp().listen(Number(process.env.PORT || 3000), '127.0.0.1', () => console.log(`Reserva Studio: http://localhost:${process.env.PORT || 3000}`));
}
