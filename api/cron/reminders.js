#!/usr/bin/env node
// Scheduled job: check for trial-ending and expiring licenses, send reminders
// Run daily via Vercel Cron or external scheduler
const { getSupabase } = require('../../_supabase.js');
const { sendEmail, trialEndingEmail, licenseExpiredEmail } = require('../../_email.js');

module.exports = async function handler(req, res) {
  try {
    const supabase = getSupabase();
    const now = new Date();
    const results = { reminders: [], errors: [] };

    // 1. Trial ending in 7, 3, 1 days
    for (const daysBefore of [7, 3, 1]) {
      const target = new Date(now.getTime() + daysBefore * 24 * 60 * 60 * 1000);
      const start = new Date(target.getTime() - 12 * 60 * 60 * 1000); // ±12h window
      const end = new Date(target.getTime() + 12 * 60 * 60 * 1000);

      const { data: trials } = await supabase
        .from('licenses')
        .select('license_key, email, name, trial_ends_at')
        .eq('status', 'trialing')
        .gte('trial_ends_at', start.toISOString())
        .lte('trial_ends_at', end.toISOString())
        .limit(50);

      for (const t of trials || []) {
        const { subject, body } = trialEndingEmail(t.name || t.email, daysBefore);
        await sendEmail(t.email, subject, body, { license_key: t.license_key, email_type: 'trial_ending' });
        results.reminders.push({ email: t.email, type: 'trial_ending', days: daysBefore });
      }
    }

    // 2. License expired in 7, 3, 1 days
    for (const daysBefore of [7, 3, 1]) {
      const target = new Date(now.getTime() + daysBefore * 24 * 60 * 60 * 1000);
      const start = new Date(target.getTime() - 12 * 60 * 60 * 1000);
      const end = new Date(target.getTime() + 12 * 60 * 60 * 1000);

      const { data: expiring } = await supabase
        .from('licenses')
        .select('license_key, email, name, expires_at')
        .eq('status', 'active')
        .gte('expires_at', start.toISOString())
        .lte('expires_at', end.toISOString())
        .limit(50);

      for (const e of expiring || []) {
        const { subject, body } = licenseExpiredEmail(e.name || e.email);
        await sendEmail(e.email, subject, body, { license_key: e.license_key, email_type: 'expiry_reminder' });
        results.reminders.push({ email: e.email, type: 'expiry_reminder', days: daysBefore });
      }
    }

    return res.status(200).json(results);
  } catch (err) {
    console.error('reminder cron error:', err);
    return res.status(500).json({ error: 'Internal error', detail: err.message });
  }
};