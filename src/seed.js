'use strict';
/** Idempotent seeder: safe to run every boot. */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const { get, run } = require('./db');
const { defaultSettings, services, faqs, gallery, sampleReviews } = require('./defaults');

function seed() {
  // settings
  for (const [key, value] of Object.entries(defaultSettings)) {
    const row = get('SELECT value FROM settings WHERE key = ?', key);
    if (!row) run('INSERT INTO settings(key, value) VALUES(?, ?)', key, String(value));
  }

  // services
  if (!get('SELECT id FROM services LIMIT 1')) {
    services.forEach((s, i) => {
      run(
        `INSERT INTO services(name, category, description, price, duration, image, sort_order)
         VALUES(?,?,?,?,?,?,?)`,
        s.name, s.category, s.description, s.price, s.duration, s.image, i + 1
      );
    });
  }

  // faqs
  if (!get('SELECT id FROM faqs LIMIT 1')) {
    faqs.forEach((f, i) => run('INSERT INTO faqs(question, answer, sort_order) VALUES(?,?,?)', f.question, f.answer, i + 1));
  }

  // gallery
  if (!get('SELECT id FROM gallery LIMIT 1')) {
    gallery.forEach((g, i) => run('INSERT INTO gallery(title, category, image_url, sort_order) VALUES(?,?,?,?)', g.title, g.category, g.image_url, i + 1));
  }

  // sample reviews (clearly flagged)
  if (!get('SELECT id FROM reviews LIMIT 1')) {
    sampleReviews.forEach((r) => run('INSERT INTO reviews(name, rating, body, is_sample) VALUES(?,?,?,1)', r.name, r.rating, r.body));
  }

  // admin user
  if (!get('SELECT id FROM admin_users LIMIT 1')) {
    const email = (process.env.ADMIN_EMAIL || 'admin@shrutisbeautyparlour.local').toLowerCase();
    const password = process.env.ADMIN_PASSWORD || 'ChangeMe@123';
    run(
      'INSERT INTO admin_users(email, name, password_hash) VALUES(?,?,?)',
      email, 'Salon Owner', bcrypt.hashSync(password, 12)
    );
    console.log(`\n  Admin account created\n  email:    ${email}\n  password: ${password}\n  (change this after first login)\n`);
  }
}

module.exports = { seed };
if (require.main === module) {
  seed();
  console.log('Seed complete.');
}