import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.js';

test('reservas persistentes, solapamientos, consulta y administración protegida', async () => {
  const app=createApp({dbPath:':memory:',adminToken:'test-secret'});
  await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${app.address().port}`;
  const request=(url,method='GET',body,admin=false)=>fetch(base+url,{method,headers:{'Content-Type':'application/json',...(admin?{Authorization:'Bearer test-secret'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  try {
    const date=new Date(Date.now()+2*86400000).toISOString().slice(0,10);
    const booking={service:'ritual',date,time:'10:00',name:'Ana López',email:'ana@example.com'};
    assert.equal((await request('/api/admin/bookings')).status,401);
    assert.equal((await request('/api/bookings','POST',{...booking,email:'bad'})).status,400);
    assert.equal((await request('/api/slots?service=ritual&date=2026-02-30')).status,400);
    const response=await request('/api/bookings','POST',booking);assert.equal(response.status,201);const saved=await response.json();
    assert.equal((await request('/api/bookings','POST',{...booking,service:'massage',time:'11:00'})).status,409);
    const available=await (await request(`/api/slots?service=massage&date=${date}`)).json();assert.ok(!available.slots.includes('11:00'));assert.ok(available.slots.includes('12:00'));
    assert.equal((await request('/api/bookings/lookup','POST',{code:saved.code,email:'other@example.com'})).status,404);
    assert.equal((await request('/api/bookings/lookup','POST',{code:saved.code,email:booking.email})).status,200);
    assert.equal((await request(`/api/admin/bookings/${saved.code}`,'PATCH',{status:'cancelled'},true)).status,200);
    const freed=await (await request(`/api/slots?service=massage&date=${date}`)).json();assert.ok(freed.slots.includes('11:00'));
    const attempts=await Promise.all([request('/api/bookings','POST',booking),request('/api/bookings','POST',booking)]);assert.deepEqual(attempts.map(r=>r.status).sort(),[201,409]);
    const list=await (await request('/api/admin/bookings','GET',undefined,true)).json();assert.equal(list.length,2);
    assert.equal((await request('/../server.js')).status,404);
  } finally { await new Promise(resolve=>app.close(resolve)); }
});
