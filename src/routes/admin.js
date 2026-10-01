'use strict';
const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { all, get, run } = require('../db');
const { byReference, setStatus } = require('../booking');
const { notifyChange } = require('../notify');
const session = require('../session');
const {
  getSettings, setSetting, clearSettingsCache, audit, clean,
  tzParts, addDays, rupees, prettyDate, prettyTime, isEmail
} = require('../utils');

/* ---------------- uploads ---------------- */
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'public', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase().slice(0, 6);
    cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 4 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, /^image\/(jpe?g|png|webp|gif|avif)$/.test(file.mimetype))
});

const CATEGORIES = ['Hair', 'Skin Care', 'Threading', 'Waxing', 'Makeup', 'Bridal', 'Hairstyling', 'Other'];

module.exports = function adminRoutes({ loginLimiter }) {
  const router = express.Router();

  const requireAdmin = (req, res, next) => {
    if (!req.admin) return res.redirect('/admin/login?next=' + encodeURIComponent(req.originalUrl));
    next();
  };

  /** Double-submit CSRF check for every state-changing admin request. */
  const requireCsrf = (req, res, next) => {
    const expected = req.session && req.session.csrf;
    const sent = (req.body && req.body._csrf) || req.get('x-csrf-token') || '';
    if (!expected || sent !== expected) {
      if (req.accepts(['html', 'json']) === 'json') {
        return res.status(403).json({ success: false, message: 'Security token expired. Please reload the page and try again.' });
      }
      return res.status(403).send('Security token expired. Please reload the page and try again.');
    }
    next();
  };

  /* ---------- auth ---------- */
  router.get('/login', (req, res) => {
    if (req.admin) return res.redirect('/admin');
    res.render('admin/login', { title: 'Owner Login', error: null, next: req.query.next || '/admin', layout: false });
  });

  router.post('/login', loginLimiter, (req, res) => {
    const email = clean(req.body.email, 120).toLowerCase();
    const password = String(req.body.password || '');
    const user = get('SELECT * FROM admin_users WHERE email = ?', email);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      audit('unknown', 'login_failed', 'admin_user', email);
      return res.status(401).render('admin/login', { title: 'Owner Login', error: 'Incorrect email or password.', next: clean(req.body.next, 120) });
    }
    run("UPDATE admin_users SET last_login_at = datetime('now') WHERE id = ?", user.id);
    audit(user.email, 'login', 'admin_user', '');
    session.issue(res, { uid: user.id });
    res.redirect(clean(req.body.next, 120) || '/admin');
  });

  router.post('/logout', (req, res) => {
    session.clear(res);
    res.redirect('/admin/login');
  });

  router.use(requireAdmin);

  /** Expose the per-session CSRF token to admin views. */
  router.use((req, res, next) => {
    res.locals.csrfToken = (req.session && req.session.csrf) || '';
    next();
  });

  /** CSRF protection applies to state-changing requests only. */
  router.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    return requireCsrf(req, res, next);
  });

  const view = (name, extra) => (req, res) => res.render(`admin/${name}`, { ...extra, title: `${extra?.title || name} | Admin`, admin: req.admin });

  /* ---------- dashboard ---------- */
  router.get('/', (req, res) => {
    const today = tzParts().date;
    const stats = {
      today: get("SELECT COUNT(*) c FROM appointments WHERE appt_date = ? AND status IN ('confirmed','pending')", today).c,
      upcoming: get("SELECT COUNT(*) c FROM appointments WHERE appt_date >= ? AND status IN ('confirmed','pending')", today).c,
      completed: get("SELECT COUNT(*) c FROM appointments WHERE status = 'completed'").c,
      cancelled: get("SELECT COUNT(*) c FROM appointments WHERE status = 'cancelled'").c,
      total: get('SELECT COUNT(*) c FROM appointments').c,
      revenue: get("SELECT IFNULL(SUM(price),0) s FROM appointments WHERE status IN ('confirmed','completed')").s
    };
    res.render('admin/dashboard', {
      title: 'Dashboard', admin: req.admin, stats, today,
      upcoming: all('SELECT * FROM appointments WHERE appt_date >= ? AND status IN (\'confirmed\',\'pending\') ORDER BY appt_date, appt_time LIMIT 12', today),
      recentNotifications: all('SELECT * FROM notifications ORDER BY id DESC LIMIT 8'),
      lowStockNote: null
    });
  });

  /* ---------- appointments ---------- */
  router.get('/appointments', (req, res) => {
    const status = ['confirmed', 'pending', 'completed', 'cancelled'].includes(req.query.status) ? req.query.status : null;
    const rows = status
      ? all('SELECT * FROM appointments WHERE status = ? ORDER BY appt_date DESC, appt_time DESC LIMIT 200', status)
      : all('SELECT * FROM appointments ORDER BY appt_date DESC, appt_time DESC LIMIT 200');
    res.render('admin/appointments', {
      title: 'Appointments', admin: req.admin, appointments: rows, status,
      filterDate: req.query.date || tzParts().date,
      forDate: req.query.date ? all('SELECT * FROM appointments WHERE appt_date = ? ORDER BY appt_time', req.query.date) : []
    });
  });

  router.post('/appointments/:id/status', async (req, res) => {
    const id = Number(req.params.id);
    const status = ['confirmed', 'pending', 'completed', 'cancelled'].includes(req.body.status) ? req.body.status : null;
    if (!status) return res.status(400).json({ success: false, message: 'Unknown status.' });
    const before = get('SELECT * FROM appointments WHERE id = ?', id);
    if (!before) return res.status(404).json({ success: false, message: 'Appointment not found.' });
    const appt = setStatus(id, status);
    if (status === 'cancelled' || status === 'completed') {
      await notifyChange(appt, status === 'cancelled' ? 'cancelled' : 'completed');
    }
    audit(req.admin.email, `appointment_${status}`, 'appointment', appt.reference);
    res.json({ success: true, message: `Appointment marked ${status}.`, appointment: appt });
  });

  router.post('/appointments/:id/reschedule', (req, res) => {
    const id = Number(req.params.id);
    const before = get('SELECT * FROM appointments WHERE id = ?', id);
    if (!before) return res.status(404).json({ success: false, message: 'Not found.' });
    run("UPDATE appointments SET appt_date=?, appt_time=?, reminder_24h=0, reminder_2h=0, updated_at=datetime('now') WHERE id=?", clean(req.body.date, 10), clean(req.body.time, 5), id);
    audit(req.admin.email, 'appointment_reschedule', 'appointment', before.reference);
    res.json({ success: true, message: 'Appointment rescheduled.' });
  });

  /* ---------- services ---------- */
  router.get('/services', view('services', { title: 'Services', services: all('SELECT * FROM services ORDER BY sort_order, name'), categories: CATEGORIES }));

  router.post('/services/save', upload.single('image'), (req, res) => {
    const id = Number(req.body.id) || 0;
    const fields = {
      name: clean(req.body.name, 80),
      category: CATEGORIES.includes(req.body.category) ? req.body.category : 'Other',
      description: clean(req.body.description, 400),
      price: Math.max(0, Math.min(999999, Number(req.body.price) || 0)),
      duration: Math.max(15, Math.min(480, Number(req.body.duration) || 30)),
      active: req.body.active ? 1 : 0,
      sort_order: Number(req.body.sort_order) || 0
    };
    if (req.file) fields.image = '/uploads/' + req.file.filename;
    else if (req.body.image_url) fields.image = clean(req.body.image_url, 500);
    if (!fields.name) return res.status(400).json({ success: false, message: 'Service name is required.' });

    if (id) {
      const existing = get('SELECT * FROM services WHERE id = ?', id);
      if (!existing) return res.status(404).json({ success: false, message: 'Service not found.' });
      run(`UPDATE services SET name=?, category=?, description=?, price=?, duration=?, active=?, sort_order=?, image=?, updated_at=datetime('now') WHERE id=?`,
        fields.name, fields.category, fields.description, fields.price, fields.duration, fields.active, fields.sort_order, fields.image || existing.image, id);
      audit(req.admin.email, 'service_update', 'service', fields.name);
      return res.json({ success: true, message: 'Service updated.' });
    }
    const info = run('INSERT INTO services(name, category, description, price, duration, image, active, sort_order) VALUES(?,?,?,?,?,?,?,?)',
      fields.name, fields.category, fields.description, fields.price, fields.duration, fields.image || '', fields.active, fields.sort_order);
    audit(req.admin.email, 'service_create', 'service', fields.name);
    res.json({ success: true, message: 'Service added.', id: Number(info.lastInsertRowid) });
  });

  router.post('/services/:id/delete', (req, res) => {
    const id = Number(req.params.id);
    const svc = get('SELECT * FROM services WHERE id = ?', id);
    run('DELETE FROM services WHERE id = ?', id);
    audit(req.admin.email, 'service_delete', 'service', svc?.name || id);
    res.json({ success: true, message: 'Service deleted. Past appointments keep their details.' });
  });

  /* ---------- reviews ---------- */
  router.get('/reviews', view('reviews', { title: 'Reviews', reviews: all('SELECT * FROM reviews ORDER BY id DESC') }));

  router.post('/reviews/save', (req, res) => {
    const id = Number(req.body.id) || 0;
    const fields = {
      name: clean(req.body.name, 60),
      rating: Math.max(1, Math.min(5, Number(req.body.rating) || 5)),
      body: clean(req.body.body, 800),
      is_sample: req.body.is_sample ? 1 : 0,
      published: req.body.published ? 1 : 0
    };
    if (!fields.name || !fields.body) return res.status(400).json({ success: false, message: 'Name and review text are required.' });
    if (id) {
      run('UPDATE reviews SET name=?, rating=?, body=?, is_sample=?, published=? WHERE id=?', fields.name, fields.rating, fields.body, fields.is_sample, fields.published, id);
      audit(req.admin.email, 'review_update', 'review', fields.name);
      return res.json({ success: true, message: 'Review updated.' });
    }
    run('INSERT INTO reviews(name, rating, body, is_sample, published) VALUES(?,?,?,?,?)', fields.name, fields.rating, fields.body, fields.is_sample, fields.published);
    audit(req.admin.email, 'review_create', 'review', fields.name);
    res.json({ success: true, message: 'Review added.' });
  });

  router.post('/reviews/:id/delete', (req, res) => {
    run('DELETE FROM reviews WHERE id = ?', Number(req.params.id));
    audit(req.admin.email, 'review_delete', 'review', '');
    res.json({ success: true, message: 'Review deleted.' });
  });

  /* ---------- gallery ---------- */
  router.get('/gallery', view('gallery', { title: 'Gallery', items: all('SELECT * FROM gallery ORDER BY sort_order, id'), categories: CATEGORIES }));

  router.post('/gallery/save', upload.single('image'), (req, res) => {
    const id = Number(req.body.id) || 0;
    const title = clean(req.body.title, 80);
    const category = clean(req.body.category, 40) || 'Salon';
    const url = req.file ? '/uploads/' + req.file.filename : clean(req.body.image_url, 500);
    if (!url) return res.status(400).json({ success: false, message: 'Upload an image or paste an image URL.' });
    if (id) {
      run('UPDATE gallery SET title=?, category=?, image_url=?, sort_order=? WHERE id=?', title, category, url, Number(req.body.sort_order) || 0, id);
      audit(req.admin.email, 'gallery_update', 'gallery', title);
      return res.json({ success: true, message: 'Image updated.' });
    }
    run('INSERT INTO gallery(title, category, image_url, sort_order) VALUES(?,?,?,?)', title, category, url, Number(req.body.sort_order) || 0);
    audit(req.admin.email, 'gallery_create', 'gallery', title);
    res.json({ success: true, message: 'Image added to gallery.' });
  });

  router.post('/gallery/:id/delete', (req, res) => {
    run('DELETE FROM gallery WHERE id = ?', Number(req.params.id));
    audit(req.admin.email, 'gallery_delete', 'gallery', '');
    res.json({ success: true, message: 'Image removed.' });
  });

  /* ---------- FAQs ---------- */
  router.get('/faqs', view('faqs', { title: 'FAQs', faqs: all('SELECT * FROM faqs ORDER BY sort_order, id') }));

  router.post('/faqs/save', (req, res) => {
    const id = Number(req.body.id) || 0;
    const question = clean(req.body.question, 160);
    const answer = clean(req.body.answer, 800);
    if (!question || !answer) return res.status(400).json({ success: false, message: 'Question and answer are required.' });
    if (id) {
      run('UPDATE faqs SET question=?, answer=?, sort_order=?, active=? WHERE id=?', question, answer, Number(req.body.sort_order) || 0, req.body.active ? 1 : 0, id);
      audit(req.admin.email, 'faq_update', 'faq', question);
      return res.json({ success: true, message: 'FAQ updated.' });
    }
    run('INSERT INTO faqs(question, answer, sort_order, active) VALUES(?,?,?,?)', question, answer, Number(req.body.sort_order) || 0, 1);
    audit(req.admin.email, 'faq_create', 'faq', question);
    res.json({ success: true, message: 'FAQ added.' });
  });

  router.post('/faqs/:id/delete', (req, res) => {
    run('DELETE FROM faqs WHERE id = ?', Number(req.params.id));
    audit(req.admin.email, 'faq_delete', 'faq', '');
    res.json({ success: true, message: 'FAQ deleted.' });
  });

  /* ---------- settings ---------- */
  const SETTING_KEYS = ['business_name','tagline','hero_headline','hero_subtext','about_text','phone','whatsapp','email','address_line','city','maps_embed_url','instagram_url','facebook_url','open_time','close_time','slot_interval','booking_horizon_days','cancellation_notice_hours','reminder_24h','reminder_2h','require_payment_online','payment_note','timezone','salon_closed_note','disclaimer','seo_description','public_base_url'];

  router.get('/settings', (req, res) => {
    res.render('admin/settings', { title: 'Business Settings', admin: req.admin, settings: getSettings(), keys: SETTING_KEYS, notifications: all('SELECT * FROM notifications ORDER BY id DESC LIMIT 25'), auditLog: all('SELECT * FROM audit_log ORDER BY id DESC LIMIT 20') });
  });

  router.post('/settings', (req, res) => {
    for (const key of SETTING_KEYS) {
      if (req.body[key] !== undefined) setSetting(key, clean(req.body[key], 2000));
    }
    if (getSettings().email && !isEmail(getSettings().email)) setSetting('email', '');
    clearSettingsCache();
    audit(req.admin.email, 'settings_update', 'settings', '');
    res.redirect('/admin/settings?ok=Settings%20saved');
  });

  router.post('/change-password', (req, res) => {
    const current = String(req.body.current_password || '');
    const next = String(req.body.new_password || '');
    const user = get('SELECT * FROM admin_users WHERE id = ?', req.admin.id);
    if (!user || !bcrypt.compareSync(current, user.password_hash)) return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
    if (next.length < 8) return res.status(400).json({ success: false, message: 'New password must be at least 8 characters.' });
    run('UPDATE admin_users SET password_hash = ? WHERE id = ?', bcrypt.hashSync(next, 12), user.id);
    audit(req.admin.email, 'password_change', 'admin_user', '');
    res.json({ success: true, message: 'Password updated.' });
  });

  return router;
};