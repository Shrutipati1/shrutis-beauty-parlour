'use strict';
/**
 * Booking engine. Availability is computed server-side (never trusted from the
 * client) and a partial unique index on (date, time) prevents two live bookings
 * for the same slot even under concurrent requests.
 */
const { get, all, run, transaction } = require('./db');
const { reference, slotAvailable, toUtc, clean, isEmail, digits, minutesOf, tzParts, addDays, getSettings } = require('./utils');

class BookingError extends Error {
  constructor(message, code = 'invalid', field = '') {
    super(message);
    this.code = code;
    this.field = field;
  }
}

function findService(serviceId) {
  const id = Number(serviceId);
  if (!Number.isInteger(id) || id <= 0) throw new BookingError('Please choose a valid service.', 'service');
  const service = get('SELECT * FROM services WHERE id = ? AND active = 1', id);
  if (!service) throw new BookingError('That service is no longer available. Please choose another.', 'service');
  return service;
}

/** Booking window guard: no past dates, no Sundays, inside the horizon. */
function validateWhen(isoDate, hhmm, duration) {
  const s = getSettings();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) throw new BookingError('Please choose a date.', 'date');
  const now = tzParts();
  if (isoDate < now.date) throw new BookingError('Please choose a future date.', 'date');
  const horizon = Number(s.booking_horizon_days) || 60;
  if (isoDate > addDays(now.date, horizon)) throw new BookingError(`Bookings open ${horizon} days in advance.`, 'date');
  const weekday = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  if (weekday === 0) throw new BookingError('The salon is closed on Sundays. Please pick another day.', 'date');
  const start = minutesOf(hhmm);
  const open = minutesOf(s.open_time);
  const close = minutesOf(s.close_time);
  if (!/^\d{2}:\d{2}$/.test(String(hhmm)) || start < open || start + duration > close) {
    throw new BookingError('That time is outside our opening hours.', 'time');
  }
  if (!slotAvailable(isoDate, hhmm, duration)) throw new BookingError('That slot was just taken. Please choose another time.', 'time');
}

function validateCustomer(input) {
  const name = clean(input.name, 80);
  const phone = digits(input.phone).slice(0, 15);
  const email = clean(input.email, 120).toLowerCase();
  const message = clean(input.message, 1000);
  if (name.length < 2) throw new BookingError('Please enter your full name.', 'name');
  if (phone.length < 10) throw new BookingError('Please enter a valid mobile number.', 'phone');
  if (email && !isEmail(email)) throw new BookingError('Please check your email address.', 'email');
  return { name, phone, email, message };
}

function createAppointment(input) {
  const service = findService(input.service_id);
  const customer = validateCustomer(input);
  validateWhen(input.date, input.time, service.duration);

  return transaction(() => {
    let ref = reference();
    while (get('SELECT id FROM appointments WHERE reference = ?', ref)) ref = reference();
    const info = run(
      `INSERT INTO appointments
        (reference, customer_name, phone, email, service_id, service_name, price, duration, appt_date, appt_time, message, status)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,'confirmed')`,
      ref, customer.name, customer.phone, customer.email, service.id, service.name,
      service.price, service.duration, input.date, input.time, customer.message
    );
    run(
      `INSERT INTO customers(name, phone, email) VALUES(?,?,?)
       ON CONFLICT(phone) DO UPDATE SET name = excluded.name, email = excluded.email, updated_at = datetime('now')`,
      customer.name, customer.phone, customer.email
    );
    return get('SELECT * FROM appointments WHERE id = ?', Number(info.lastInsertRowid));
  });
}

const byReference = (ref) => get('SELECT * FROM appointments WHERE reference = ?', String(ref || ''));

function listForDate(isoDate) {
  return all(
    `SELECT * FROM appointments WHERE appt_date = ? AND status IN ('confirmed','pending') ORDER BY appt_time`,
    isoDate
  );
}

function setStatus(id, status) {
  run("UPDATE appointments SET status = ?, updated_at = datetime('now') WHERE id = ?", status, id);
  return get('SELECT * FROM appointments WHERE id = ?', id);
}

/** Cancel -> releases the slot immediately (unique index ignores non-live rows). */
function cancel(ref) {
  const appt = byReference(ref);
  if (!appt) throw new BookingError('We could not find that booking.', 'notfound');
  if (['cancelled', 'completed'].includes(appt.status)) throw new BookingError(`This booking is already ${appt.status}.`, 'status');
  const s = getSettings();
  const noticeHours = Number(s.cancellation_notice_hours) || 0;
  if (noticeHours > 0 && toUtc(appt.appt_date, appt.appt_time) - Date.now() < noticeHours * 3600 * 1000) {
    throw new BookingError(`Please call us to change appointments within ${noticeHours} hours of the scheduled time.`, 'notice');
  }
  return setStatus(appt.id, 'cancelled');
}

function reschedule(ref, date, time) {
  const appt = byReference(ref);
  if (!appt) throw new BookingError('We could not find that booking.', 'notfound');
  if (['cancelled', 'completed'].includes(appt.status)) throw new BookingError(`This booking is already ${appt.status}.`, 'status');
  const duration = appt.service_id
    ? (get('SELECT duration FROM services WHERE id = ?', appt.service_id)?.duration ?? appt.duration)
    : appt.duration;
  validateWhen(date, time, duration);
  return transaction(() => {
    run(
      `UPDATE appointments
       SET appt_date = ?, appt_time = ?, reminder_24h = 0, reminder_2h = 0, updated_at = datetime('now')
       WHERE id = ?`,
      date, time, appt.id
    );
    return get('SELECT * FROM appointments WHERE id = ?', appt.id);
  });
}

module.exports = { createAppointment, byReference, cancel, reschedule, setStatus, listForDate, findService, validateWhen, BookingError };