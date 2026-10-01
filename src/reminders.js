'use strict';
/**
 * Reminder scheduler. Runs every 10 minutes and sends the optional 24-hour and
 * 2-hour reminders. Times are always evaluated in the salon's own timezone, so
 * a salon in another country behaves correctly too.
 */
const cron = require('node-cron');
const { all, run } = require('./db');
const { getSettings, toUtc, prettyDate, prettyTime, setSetting } = require('./utils');
const { sendEmail, sendSMS, ownerEmailTemplate, customerSMS } = require('./notify');

const WINDOWS = [
  { key: '24h', column: 'reminder_24h', hours: 24, toleranceMin: 12 },
  { key: '2h', column: 'reminder_2h', hours: 2, toleranceMin: 6 }
];

async function processReminders(now = Date.now()) {
  const cfg = getSettings();
  const enabled = WINDOWS.filter((w) => (w.key === '24h' ? cfg.reminder_24h === '1' : cfg.reminder_2h === '1'));
  if (!enabled.length) return 0;
  let sent = 0;

  for (const w of enabled) {
    const window = w.hours * 60 * 60 * 1000;
    const tolerance = w.toleranceMin * 60 * 1000;
    const rows = all(
      `SELECT * FROM appointments
       WHERE status IN ('confirmed','pending') AND ${w.column} = 0`
    );
    for (const appt of rows) {
      const when = toUtc(appt.appt_date, appt.appt_time).getTime();
      const delta = when - now;
      if (delta > window + tolerance || delta < window - tolerance) continue;

      if (appt.email) {
        await sendEmail({ ...ownerEmailTemplate(appt, `reminder_${w.key}`), to: appt.email }, appt.id, `reminder_${w.key}`);
      }
      await sendSMS({ to: appt.phone, message: customerSMS(appt) }, appt.id, `reminder_${w.key}`);
      run(`UPDATE appointments SET ${w.column} = 1, updated_at = datetime('now') WHERE id = ?`, appt.id);
      console.log(`  reminder ${w.key} sent for ${appt.reference} (${prettyDate(appt.appt_date)} ${prettyTime(appt.appt_time)})`);
      sent += 1;
    }
  }
  return sent;
}

function startReminders() {
  cron.schedule('*/10 * * * *', () => {
    processReminders().catch((err) => console.error('Reminder job failed:', err.message));
  });
  console.log('  Reminders scheduler active (every 10 minutes)');
}

module.exports = { startReminders, processReminders };