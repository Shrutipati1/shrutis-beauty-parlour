'use strict';
const express = require('express');
const { createAppointment, byReference, cancel, reschedule, setStatus, BookingError } = require('../booking');
const { notifyBooking, notifyChange, whatsappLink } = require('../notify');
const { getSettings, prettyDate, prettyTime, clean, toUtc, tzParts, addDays } = require('../utils');
const { get } = require('../db');
const icsStamp = (date) => date.replace(/-/g, '') + 'T' + '000000';

module.exports = function bookingRoutes({ bookingLimiter }) {
  const router = express.Router();

  router.post('/api/appointments', bookingLimiter, async (req, res, next) => {
    try {
      const appt = createAppointment({
        name: clean(req.body.name, 80),
        phone: req.body.phone,
        email: req.body.email,
        service_id: req.body.service_id,
        date: req.body.date,
        time: req.body.time,
        message: req.body.message
      });
      await notifyBooking(appt);
      res.status(201).json({ success: true, reference: appt.reference, redirect: `/booking/${appt.reference}` });
    } catch (err) {
      if (err instanceof BookingError) return res.status(400).json({ success: false, message: err.message, field: err.field });
      next(err);
    }
  });

  router.get('/booking/:reference', (req, res, next) => {
    const appt = byReference(req.params.reference);
    if (!appt) return next(Object.assign(new Error('We could not find that booking reference.'), { status: 404, expose: true }));
    const cfg = getSettings();
    const service = appt.service_id ? get('SELECT image FROM services WHERE id = ?', appt.service_id) : null;
    res.render('booking-confirmation', {
      appt,
      serviceImage: service?.image || '',
      service,
      statusText: prettyDate(appt.appt_date),
      whatsappBooked: whatsappLink(`Hello ${cfg.business_name}, this is ${appt.customer_name} regarding my appointment ${appt.reference} on ${prettyDate(appt.appt_date)} at ${prettyTime(appt.appt_time)}.`),
      minCancelHours: Number(cfg.cancellation_notice_hours) || 0,
      title: `Booking ${appt.reference} | ${cfg.business_name}`,
      description: 'Your appointment details, calendar file and reschedule options.'
    });
  });

  router.post('/booking/:reference/cancel', async (req, res, next) => {
    try {
      const appt = cancel(req.params.reference);
      await notifyChange(appt, 'cancelled');
      res.json({ success: true, message: 'Your appointment has been cancelled and the slot is free again.' });
    } catch (err) {
      if (err instanceof BookingError) return res.status(400).json({ success: false, message: err.message });
      next(err);
    }
  });

  router.post('/booking/:reference/reschedule', async (req, res, next) => {
    try {
      const appt = reschedule(req.params.reference, req.body.date, req.body.time);
      await notifyChange(appt, 'rescheduled');
      res.json({ success: true, message: 'Your appointment has been moved.', redirect: `/booking/${appt.reference}` });
    } catch (err) {
      if (err instanceof BookingError) return res.status(400).json({ success: false, message: err.message, field: err.field });
      next(err);
    }
  });

  router.get('/booking/:reference/calendar', (req, res, next) => {
    const appt = byReference(req.params.reference);
    if (!appt) return next();
    const start = toUtc(appt.appt_date, appt.appt_time);
    const end = new Date(start.getTime() + appt.duration * 60000);
    const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const cfg = getSettings();
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Shrutis Beauty Parlour//Booking//EN', 'BEGIN:VEVENT',
      `UID:${appt.reference}@shrutisbeautyparlour`,
      `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
      `SUMMARY:${appt.service_name} at ${cfg.business_name}`,
      `DESCRIPTION:Booking ${appt.reference}\\nPrice: ₹${appt.price}\\n${cfg.phone || ''}`,
      `LOCATION:${(cfg.address_line || '') + (cfg.city ? ', ' + cfg.city : '')}`.trim(),
      'END:VEVENT', 'END:VCALENDAR'
    ].join('\r\n');
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="appointment-${appt.reference}.ics"`);
    res.send(ics);
  });

  return router;
};