'use strict';
/**
 * Email + SMS delivery. Both providers are optional: when credentials are
 * missing the message is recorded in the notifications table so the salon
 * owner always has a complete log (and can be wired to a provider later
 * purely via .env — no code changes, no keys in the frontend).
 */
const nodemailer = require('nodemailer');
const { run } = require('./db');
const { getSettings, prettyDate, prettyTime, rupees, digits } = require('./utils');

function transport() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: String(process.env.SMTP_SECURE) === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
  });
}

const s = () => getSettings();
const salonLines = () => {
  const cfg = s();
  return [
    cfg.phone && `Phone: ${cfg.phone}`,
    cfg.email && `Email: ${cfg.email}`,
    cfg.address_line && `Address: ${cfg.address_line}${cfg.city ? ', ' + cfg.city : ''}`
  ].filter(Boolean).join(' · ');
};

function customerEmailTemplate(appt) {
  const cfg = s();
  return {
    subject: `Appointment confirmed — ${cfg.business_name} (${appt.reference})`,
    text: [
      `Hello ${appt.customer_name},`,
      '',
      `Your appointment at ${cfg.business_name} is confirmed.`,
      '',
      `Booking ID:  ${appt.reference}`,
      `Service:     ${appt.service_name}`,
      `Date:        ${prettyDate(appt.appt_date)}`,
      `Time:        ${prettyTime(appt.appt_time)}`,
      `Duration:    ${appt.duration} minutes`,
      `Price:       ${rupees(appt.price)}`,
      '',
      salonLines(),
      '',
      'Need to change it? Use your booking link:',
      `${(cfg.public_base_url || '').replace(/\/$/, '')}/booking/${appt.reference}`,
      '',
      'Please arrive a few minutes early. See you soon!',
      cfg.disclaimer
    ].filter((x) => x !== undefined).join('\n')
  };
}

function ownerEmailTemplate(appt, kind = 'new_booking') {
  const cfg = s();
  const titles = {
    new_booking: 'New appointment booked',
    cancelled: 'Appointment cancelled',
    rescheduled: 'Appointment rescheduled',
    reminder_24h: 'Reminder: appointment in 24 hours',
    reminder_2h: 'Reminder: appointment in 2 hours'
  };
  return {
    subject: `${titles[kind] || 'Appointment update'} — ${appt.reference}`,
    text: [
      `Booking ID:  ${appt.reference}`,
      `Customer:    ${appt.customer_name}`,
      `Phone:       ${appt.phone}`,
      `Email:       ${appt.email || '—'}`,
      `Service:     ${appt.service_name}`,
      `Date:        ${prettyDate(appt.appt_date)}`,
      `Time:        ${prettyTime(appt.appt_time)}`,
      `Duration:    ${appt.duration} minutes`,
      `Price:       ${rupees(appt.price)}`,
      appt.message ? `Notes:       ${appt.message}` : ''
    ].filter(Boolean).join('\n')
  };
}

async function sendEmail({ to, subject, text }, apptId = null, kind = 'booking_confirmation') {
  const t = transport();
  let status = 'logged';
  let detail = 'SMTP not configured — message stored in the notification log.';
  if (t && to) {
    try {
      await t.sendMail({
        from: process.env.MAIL_FROM || `"${s().business_name}" <no-reply@localhost>`,
        to, subject, text
      });
      status = 'sent';
      detail = 'Delivered via SMTP.';
    } catch (err) {
      status = 'failed';
      detail = err.message;
    }
  }
  run('INSERT INTO notifications(appointment_id, channel, recipient, kind, status, detail) VALUES(?,?,?,?,?,?)',
    apptId, 'email', to || 'salon owner', kind, status, detail);
  return status;
}

async function sendSMS({ to, message }, apptId = null, kind = 'booking_confirmation') {
  const recipient = digits(to);
  let status = 'logged';
  let detail = 'SMS provider not configured — message stored in the notification log.';
  if (process.env.SMS_WEBHOOK_URL && recipient) {
    try {
      const res = await fetch(process.env.SMS_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SMS_WEBHOOK_KEY || ''}` },
        body: JSON.stringify({ to: recipient, message })
      });
      status = res.ok ? 'sent' : 'failed';
      detail = `Provider responded ${res.status}.`;
    } catch (err) {
      status = 'failed';
      detail = err.message;
    }
  }
  run('INSERT INTO notifications(appointment_id, channel, recipient, kind, status, detail) VALUES(?,?,?,?,?,?)',
    apptId, 'sms', recipient || '—', kind, status, detail);
  return status;
}

const whatsappLink = (text) => {
  const cfg = s();
  const number = digits(cfg.whatsapp || process.env.WHATSAPP_NUMBER);
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(text)}` : null;
};

const customerSMS = (appt) =>
  `Your appointment at ${s().business_name} is confirmed for ${prettyDate(appt.appt_date)} at ${prettyTime(appt.appt_time)}. Service: ${appt.service_name}. Booking ID: ${appt.reference}.`;

const ownerSMS = (appt) =>
  `New appointment: ${appt.customer_name}, ${appt.service_name}, ${prettyDate(appt.appt_date)}, ${prettyTime(appt.appt_time)}. Booking ID: ${appt.reference}.`;

async function notifyBooking(appt) {
  const cfg = s();
  await sendEmail({ ...customerEmailTemplate(appt), to: appt.email }, appt.id, 'booking_confirmation');
  await sendSMS({ to: appt.phone, message: customerSMS(appt) }, appt.id, 'booking_confirmation');
  if (cfg.email) await sendEmail({ ...ownerEmailTemplate(appt), to: cfg.email }, appt.id, 'new_booking');
  await sendSMS({ to: process.env.SALON_OWNER_PHONE || '', message: ownerSMS(appt) }, appt.id, 'new_booking');
}

async function notifyChange(appt, kind) {
  const cfg = s();
  if (cfg.email) await sendEmail({ ...ownerEmailTemplate(appt, kind), to: cfg.email }, appt.id, kind);
  await sendSMS({ to: process.env.SALON_OWNER_PHONE || '', message: `Update (${kind}): ${appt.customer_name}, ${appt.service_name}, ${prettyDate(appt.appt_date)}, ${prettyTime(appt.appt_time)}. ID: ${appt.reference}.` }, appt.id, kind);
}

module.exports = { notifyBooking, notifyChange, sendEmail, sendSMS, customerEmailTemplate, ownerEmailTemplate, whatsappLink, customerSMS, ownerSMS, salonLines };