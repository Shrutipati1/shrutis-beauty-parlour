'use strict';
/** Simple server-side sessions (signed, httpOnly cookie) — no extra dependency. */
const crypto = require('node:crypto');
const { get } = require('./db');

const COOKIE = 'sbp_session';
const secrets = [];

function init(secret) { secrets.push(secret || crypto.randomBytes(32).toString('hex')); }

function sign(value) {
  const mac = crypto.createHmac('sha256', secrets[0]).update(value).digest('base64url');
  return `${value}.${mac}`;
}
function unsign(signed) {
  if (!signed || !signed.includes('.')) return null;
  const idx = signed.lastIndexOf('.');
  const value = signed.slice(0, idx);
  const mac = signed.slice(idx + 1);
  const expected = crypto.createHmac('sha256', secrets[0]).update(value).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); }
  catch { return null; }
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return Object.fromEntries(header.split(';').map((c) => {
    const i = c.indexOf('=');
    if (i < 0) return [c.trim(), ''];
    return [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1).trim())];
  }).filter(([k]) => k));
}

function issue(res, data, maxAgeMs = 1000 * 60 * 60 * 8) {
  const payload = Object.assign({ csrf: crypto.randomBytes(24).toString('hex') }, data);
  const value = Buffer.from(JSON.stringify(payload)).toString('base64url');
  res.setHeader('Set-Cookie',
    `${COOKIE}=${sign(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAgeMs / 1000)}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
  return payload.csrf;
}

function clear(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

/** Populates req.session / req.admin when a valid session cookie exists. */
function loadUser(req, _res, next) {
  const raw = parseCookies(req)[COOKIE];
  const data = unsign(raw);
  req.admin = null;
  req.session = null;
  if (data && data.uid) {
    const user = get('SELECT id, email, name FROM admin_users WHERE id = ?', data.uid);
    if (user) {
      req.admin = user;
      req.session = data;
    }
  }
  next();
}

module.exports = { init, loadUser, issue, clear, parseCookies, COOKIE };