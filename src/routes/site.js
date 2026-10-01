'use strict';
const express = require('express');
const { all, get } = require('../db');
const { getSettings, slotsFor, addDays, tzParts, prettyTime } = require('../utils');

module.exports = function siteRoutes({ bookingLimiter }) {
  const router = express.Router();

  const servicesByCategory = () => {
    const rows = all('SELECT * FROM services WHERE active = 1 ORDER BY sort_order, name');
    const map = new Map();
    for (const s of rows) {
      if (!map.has(s.category)) map.set(s.category, []);
      map.get(s.category).push(s);
    }
    return map;
  };

  const siteData = (req, extra = {}) => ({
    categories: servicesByCategory(),
    faqs: all('SELECT * FROM faqs WHERE active = 1 ORDER BY sort_order, id'),
    services: all('SELECT * FROM services WHERE active = 1 ORDER BY sort_order, id'),
    ...extra
  });

  router.get('/', (req, res) => {
    const cfg = getSettings();
    res.render('home', {
      ...siteData(req),
      title: `${cfg.business_name} | Beauty Parlour in ${cfg.city || 'your city'}`,
      description: cfg.seo_description || `Professional beauty parlour offering facials, waxing, threading, hair, makeup and bridal services. Book your appointment online at ${cfg.business_name}.`,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'BeautySalon',
        name: cfg.business_name,
        description: cfg.tagline,
        telephone: cfg.phone || undefined,
        email: cfg.email || undefined,
        url: '/',
        openingHoursSpecification: [{
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
          opens: prettyTime(cfg.open_time).replace(/\s?(AM|PM)$/i, ''),
          closes: prettyTime(cfg.close_time).replace(/\s?(AM|PM)$/i, '')
        }]
      },
      gallery: all('SELECT * FROM gallery ORDER BY sort_order, id LIMIT 6'),
      reviews: all('SELECT * FROM reviews WHERE published = 1 ORDER BY id DESC LIMIT 3')
    });
  });

  router.get('/about', (req, res) => {
    res.render('about', siteData(req, {
      title: `About | ${getSettings().business_name}`,
      description: `Learn about ${getSettings().business_name} — personalised beauty, hair, makeup and styling in a hygienic, welcoming environment.`
    }));
  });

  router.get('/services', (req, res) => {
    res.render('services', siteData(req, {
      title: `Beauty Services & Prices | ${getSettings().business_name}`,
      description: 'Explore threading, facials, waxing, hair, makeup and styling services with sample prices and durations. Book online.'
    }));
  });

  router.get('/bridal', (req, res) => {
    const bridal = all("SELECT * FROM services WHERE active = 1 AND category IN ('Bridal','Hairstyling','Makeup') ORDER BY sort_order, id");
    res.render('bridal', siteData(req, {
      bridalServices: bridal,
      title: `Bridal Makeup & Hairstyling | ${getSettings().business_name}`,
      description: 'Bridal makeup, pre-bridal beauty and event styling with a personalised consultation. Reserve your date early.'
    }));
  });

  router.get('/gallery', (req, res) => {
    res.render('gallery', siteData(req, {
      galleryItems: all('SELECT * FROM gallery ORDER BY sort_order, id'),
      galleryCategories: [...new Set(all('SELECT DISTINCT category FROM gallery').map((r) => r.category))],
      title: `Gallery | ${getSettings().business_name}`,
      description: 'A look inside our salon — haircuts, makeup, facials, hairstyling and bridal looks.'
    }));
  });

  router.get('/testimonials', (req, res) => {
    res.render('testimonials', siteData(req, {
      reviews: all('SELECT * FROM reviews WHERE published = 1 ORDER BY id DESC'),
      title: `Testimonials | ${getSettings().business_name}`,
      description: 'Sample reviews and client feedback for our beauty, hair, makeup and bridal services.'
    }));
  });

  router.get('/contact', (req, res) => {
    const cfg = getSettings();
    res.render('contact', siteData(req, {
      title: `Contact & Directions | ${cfg.business_name}`,
      description: `Contact ${cfg.business_name} to book an appointment. Opening hours, directions and WhatsApp support.`,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'BeautySalon',
        name: cfg.business_name,
        telephone: cfg.phone || undefined,
        address: cfg.address_line ? { '@type': 'PostalAddress', streetAddress: cfg.address_line, addressLocality: cfg.city } : undefined
      }
    }));
  });

  router.get('/book', (req, res) => {
    const services = all('SELECT * FROM services WHERE active = 1 ORDER BY sort_order, id');
    const date = tzParts().date;
    res.render('book', siteData(req, {
      services,
      title: `Book an Appointment | ${getSettings().business_name}`,
      description: 'Book your beauty, hair, makeup or bridal appointment online. Choose your service, date and time slot instantly.',
      booking: { date, serviceId: req.query.service || '', time: '', open: getSettings().open_time, close: getSettings().close_time }
    }));
  });

  /* public JSON endpoints */
  router.get('/api/services', (_req, res) => {
    res.json({ success: true, services: all('SELECT id, name, category, price, duration, description, image FROM services WHERE active = 1 ORDER BY sort_order, id') });
  });

  router.get('/api/availability', (req, res) => {
    const service = get('SELECT * FROM services WHERE id = ? AND active = 1', Number(req.query.serviceId));
    if (!service) return res.status(400).json({ success: false, message: 'Choose a service to see available times.' });
    const date = String(req.query.date || '');
    const cfg = getSettings();
    const maxDate = addDays(tzParts().date, Number(cfg.booking_horizon_days) || 60);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < tzParts().date || date > maxDate) {
      return res.json({ success: true, slots: [], closed: true, message: 'Please choose a date within the booking window (Mondays to Saturdays).' });
    }
    if (new Date(`${date}T00:00:00Z`).getUTCDay() === 0) {
      return res.json({ success: true, slots: [], closed: true, message: 'The salon is closed on Sundays.' });
    }
    res.json({ success: true, slots: slotsFor(date, service.duration), service: { name: service.name, price: service.price, duration: service.duration } });
  });

  router.get('/sitemap.xml', (req, res) => {
    const base = `${req.protocol}://${req.get('host')}`;
    const urls = ['/', '/about', '/services', '/bridal', '/gallery', '/testimonials', '/contact', '/book'].map((p) => `<url><loc>${base}${p}</loc></url>`).join('');
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
  });

  router.get('/robots.txt', (_req, res) => {
    res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: ${_req.protocol}://${_req.get('host')}/sitemap.xml\n`);
  });

  return router;
};