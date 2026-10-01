'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const { rateLimit } = require('express-rate-limit');

const { seed } = require('./src/seed');
seed();

const session = require('./src/session');
const { startReminders } = require('./src/reminders');
const { getSettings, rupees, prettyDate, prettyTime } = require('./src/utils');
const { all } = require('./src/db');

const app = express();
const PORT = process.env.PORT || 3001;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://images.unsplash.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://images.unsplash.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'https://images.unsplash.com'],
      connectSrc: ["'self'"],
      formAction: ["'self'"],
      frameSrc: ["'self'", 'https://www.google.com'],
      objectSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(express.urlencoded({ extended: false, limit: '64kb' }));
app.use(express.json({ limit: '64kb' }));
session.init(process.env.SESSION_SECRET || 'dev-only-secret');
app.use(session.loadUser);

app.use(express.static(path.join(__dirname, 'public'), { maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0 }));

/* ---------------- shared view data ---------------- */
const navItems = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/services', label: 'Services' },
  { href: '/bridal', label: 'Bridal' },
  { href: '/gallery', label: 'Gallery' },
  { href: '/testimonials', label: 'Testimonials' },
  { href: '/contact', label: 'Contact' }
];

app.use((req, res, next) => {
  const cfg = getSettings();
  res.locals.cfg = cfg;
  res.locals.navItems = navItems;
  res.locals.rupees = rupees;
  res.locals.prettyDate = prettyDate;
  res.locals.prettyTime = prettyTime;
  res.locals.currentPath = req.path;
  res.locals.year = new Date().getFullYear();
  res.locals.flash = req.query.ok || req.query.msg || null;
  // every page (including error pages) can show the service menu in the footer
  res.locals.services = all('SELECT * FROM services WHERE active = 1 ORDER BY sort_order, id');
  res.locals.jsonLd = null;
  res.locals.whatsappUrl = cfg.whatsapp || process.env.WHATSAPP_NUMBER
    ? `https://wa.me/${String(cfg.whatsapp || process.env.WHATSAPP_NUMBER).replace(/\D/g, '')}?text=${encodeURIComponent("Hello Shruti's Beauty Parlour, I would like to enquire about your services and book an appointment.")}`
    : null;
  next();
});

/* ---------------- rate limiting ---------------- */
const bookingLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 12, standardHeaders: 'draft-7', legacyHeaders: false, message: { success: false, message: 'Too many booking attempts. Please try again later or contact us directly.' } });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: 'draft-7', legacyHeaders: false });

/* ---------------- routes ---------------- */
const siteRoutes = require('./src/routes/site');
const bookingRoutes = require('./src/routes/booking');
const adminRoutes = require('./src/routes/admin');

app.use('/', siteRoutes({ bookingLimiter, loginLimiter }));
app.use('/', bookingRoutes({ bookingLimiter }));
app.use('/admin', adminRoutes({ loginLimiter }));

/* ---------------- errors ---------------- */
app.use((req, res) => {
  res.status(404).render('404', { title: 'Page not found', description: 'The page you are looking for does not exist.' });
});

app.use((err, req, res, _next) => {
  console.error(err);
  const wantsJson = req.accepts(['html', 'json']) === 'json' || req.path.startsWith('/api');
  if (wantsJson) return res.status(err.status || 500).json({ success: false, message: err.expose ? err.message : 'Something went wrong.' });
  res.status(err.status || 500).render('500', { title: 'Something went wrong', description: 'Please try again in a moment.' });
});

app.locals.startReminders = startReminders;

app.listen(PORT, () => {
  console.log(`\n  ${getSettings().business_name} is running at http://localhost:${PORT}`);
  startReminders();
});