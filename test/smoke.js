'use strict';
/* End-to-end smoke test against a running server. Usage: node test/smoke.js */
const BASE = process.env.BASE || 'http://localhost:3001';
const PASS = [];
const FAIL = [];

function ok(name, cond, extra = '') {
  (cond ? PASS : FAIL).push(name + (extra ? ` (${extra})` : ''));
  console.log(`${cond ? '  PASS' : '  FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
}

async function json(url, opts) {
  const res = await fetch(BASE + url, opts);
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { res, body };
}

const cookieJar = {};
async function withCookie(url, opts = {}) {
  const headers = Object.assign({}, opts.headers);
  if (Object.keys(cookieJar).length) headers.Cookie = Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`).join('; ');
  const res = await fetch(BASE + url, { ...opts, headers, redirect: 'manual' });
  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  setCookie.forEach((c) => {
    const [pair] = c.split(';');
    const idx = pair.indexOf('=');
    cookieJar[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  });
  return res;
}

(async () => {
  console.log('\n=== PUBLIC SITE ===');
  for (const path of ['/', '/about', '/services', '/bridal', '/gallery', '/testimonials', '/contact', '/book', '/sitemap.xml', '/robots.txt']) {
    const res = await fetch(BASE + path);
    ok(`GET ${path}`, res.status === 200, `status ${res.status}`);
  }
  const notFound = await fetch(BASE + '/definitely-not-a-page');
  ok('404 page for unknown path', notFound.status === 404);

  console.log('\n=== SERVICES + AVAILABILITY ===');
  const { body: svcData } = await json('/api/services');
  ok('service list returned', Array.isArray(svcData.services) && svcData.services.length >= 9, `${svcData.services?.length} services`);
  const service = svcData.services.find((s) => s.name === 'Facial');
  ok('sample Facial price is ₹700', service.price === 700, `₹${service.price}`);

  const { tzParts, addDays } = require('../src/utils');
  let date = addDays(tzParts().date, 1);
  while (new Date(`${date}T00:00:00Z`).getUTCDay() === 0) date = addDays(date, 1);

  const { body: avail } = await json(`/api/availability?serviceId=${service.id}&date=${date}`);
  ok('availability returns slots', avail.slots.length > 0, `${avail.slots.length} slots`);
  const slot = avail.slots.find((s) => s.available);
  ok('slot fits service duration inside hours', !!slot, slot?.label);

  const past = await json(`/api/availability?serviceId=${service.id}&date=2020-01-01`);
  ok('past dates rejected', past.body.slots.length === 0 || past.body.closed);

  console.log('\n=== BOOKING ===');
  const payload = {
    name: 'Priya Sharma', phone: '9876543210', email: 'priya@example.com',
    service_id: service.id, date, time: slot.time, message: 'First visit, please advise.'
  };
  const { res: bookRes, body: booked } = await json('/api/appointments', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  ok('booking created', bookRes.status === 201 && /^SBP-/.test(booked.reference || ''), booked.reference);
  const ref = booked.reference;

  const dupe = await json('/api/appointments', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, name: 'Other Person' })
  });
  ok('double booking blocked', dupe.res.status === 400, dupe.body.message);

  const bad = await json('/api/appointments', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'X', phone: '1', email: 'nope', service_id: service.id, date, time: slot.time, message: 'hi' })
  });
  ok('server-side validation rejects bad input', bad.res.status === 400, bad.body.message);

  const confirmPage = await fetch(`${BASE}/booking/${ref}`);
  ok('confirmation page renders', confirmPage.status === 200);
  const ics = await fetch(`${BASE}/booking/${ref}/calendar`);
  ok('calendar (.ics) download works', ics.status === 200 && (ics.headers.get('content-type') || '').includes('text/calendar'));

  const { body: avail2 } = await json(`/api/availability?serviceId=${service.id}&date=${date}`);
  const taken = avail2.slots.find((s) => s.time === slot.time);
  ok('booked slot now unavailable', taken && taken.available === false, slot.label);

  console.log('\n=== RESCHEDULE + CANCEL ===');
  const free2 = avail2.slots.filter((s) => s.available && s.time !== slot.time);
  const newSlot = free2.find((s) => s.time > slot.time) || free2[0];
  const { res: reRes, body: reBody } = await json(`/booking/${ref}/reschedule`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, time: newSlot.time })
  });
  ok('reschedule works', reRes.status === 200 && reBody.success, `moved to ${newSlot.label}`);

  const { res: cancelRes, body: cancelBody } = await json(`/booking/${ref}/cancel`, { method: 'POST' });
  ok('cancel works', cancelRes.status === 200 && cancelBody.success);

  const { body: avail3 } = await json(`/api/availability?serviceId=${service.id}&date=${date}`);
  const released = avail3.slots.find((s) => s.time === newSlot.time);
  ok('slot released after cancel', released && released.available === true, newSlot.label);

  console.log('\n=== ADMIN AUTH ===');
  const guard = await fetch(`${BASE}/admin/appointments`, { redirect: 'manual' });
  ok('admin route protected when logged out', guard.status === 302 && (guard.headers.get('location') || '').includes('/admin/login'));

  const badLogin = await withCookie('/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'email=wrong@example.com&password=nope'
  });
  ok('bad login rejected', badLogin.status === 401);

  const { all } = require('../src/db');
  const admin = all('SELECT email FROM admin_users LIMIT 1')[0];
  const login = await withCookie('/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `email=${encodeURIComponent(admin.email)}&password=ChangeMe%40123`
  });
  ok('login succeeds with seeded credentials', login.status === 302 && login.headers.get('location') === '/admin');

  console.log('\n=== ADMIN PAGES ===');
  for (const path of ['/admin', '/admin/appointments', '/admin/services', '/admin/gallery', '/admin/reviews', '/admin/faqs', '/admin/settings']) {
    const res = await withCookie(path);
    ok(`GET ${path}`, res.status === 200, `status ${res.status}`);
  }

  console.log('\n=== ADMIN CRUD ===');
  const { get } = require('../src/db');

  // CSRF: a request without the session token must be rejected
  const noToken = await withCookie('/admin/services/save', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'CSRF Probe', price: 1, duration: 15 })
  });
  ok('CSRF blocks tokenless admin POST', noToken.status === 403, `status ${noToken.status}`);

  // read the token the dashboard exposes
  const dashHtml = await (await withCookie('/admin')).text();
  const tokenMatch = dashHtml.match(/name="csrf-token" content="([^"]+)"/);
  ok('CSRF token exposed to admin views', !!tokenMatch && tokenMatch[1].length > 20);
  const token = tokenMatch ? tokenMatch[1] : '';

  const createSvc = await withCookie('/admin/services/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
    body: JSON.stringify({ name: 'Test Service', category: 'Hair', price: 199, duration: 30, description: 'temporary', active: '1' })
  });
  ok('service create works with CSRF token', createSvc.status === 200, `status ${createSvc.status}`);

  const created = get('SELECT * FROM services WHERE name = ?', 'Test Service');
  ok('service row written', !!created, created ? `id ${created.id} ₹${created.price}` : 'missing');

  // customers table is populated on booking
  const customerCount = get('SELECT COUNT(*) c FROM customers').c;
  ok('customers recorded', customerCount > 0, `${customerCount} customers`);

  const updated = all('SELECT * FROM services WHERE name = ?', 'Test Service');
  if (updated[0]) {
    const res = await withCookie(`/admin/services/${updated[0].id}/delete`, { method: 'POST', headers: { 'X-CSRF-Token': token } });
    ok('service delete works', res.status === 200);
    ok('service removed from db', !get('SELECT id FROM services WHERE id = ?', updated[0].id));
  }

  console.log('\n=== NOTIFICATIONS ===');
  const notes = all('SELECT channel, kind, status FROM notifications ORDER BY id DESC LIMIT 4');
  ok('notifications logged', notes.length > 0, notes.map((n) => `${n.channel}:${n.kind}:${n.status}`).join(', '));

  console.log(`\n=========== ${PASS.length} passed, ${FAIL.length} failed ===========`);
  if (FAIL.length) {
    console.log('Failures:');
    FAIL.forEach((f) => console.log('  - ' + f));
    process.exit(1);
  }
})().catch((err) => {
  console.error('Test run crashed:', err);
  process.exit(1);
});