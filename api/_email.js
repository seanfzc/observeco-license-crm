// Shared email notification utility for license lifecycle events
const { getSupabase } = require('./_supabase.js');

/**
 * Send an email notification for a license lifecycle event.
 *
 * Currently logs to console (scaffold). Replace with Resend/SendGrid/etc by:
 * 1. Add RESEND_API_KEY to env
 * 2. Uncomment the Resend call
 * 3. Set from address in FROM_EMAIL env var
 *
 * @param {string} email - Recipient email
 * @param {string} subject - Email subject
 * @param {string} body - Plain text body
 * @param {object} opts - { license_key, email_type } for tracking
 */
async function sendEmail(email, subject, body, opts = {}) {
  const licenseKey = opts.license_key || 'unknown';
  const emailType = opts.email_type || 'general';

  console.log(`[email] Type=${emailType}, To=${email}, Subject="${subject}", Key=${licenseKey}`);

  // Record the email send in the licenses metadata
  if (licenseKey !== 'unknown') {
    try {
      const supabase = getSupabase();
      const { data: license } = await supabase
        .from('licenses')
        .select('metadata')
        .eq('license_key', licenseKey)
        .single();

      const meta = license?.metadata || {};
      const emailLog = meta.emails_sent || [];
      emailLog.push({
        type: emailType,
        subject,
        sent_at: new Date().toISOString(),
      });

      await supabase
        .from('licenses')
        .update({ metadata: { ...meta, emails_sent: emailLog }, updated_at: new Date().toISOString() })
        .eq('license_key', licenseKey);
    } catch (err) {
      console.error('email log error:', err?.message || String(err));
    }
  }

  // Actual send — replace with your provider
  // Example for Resend:
  // const { Resend } = require('resend');
  // const resend = new Resend(process.env.RESEND_API_KEY);
  // await resend.emails.send({
  //   from: process.env.FROM_EMAIL || 'noreply@observeco.ai',
  //   to: email,
  //   subject,
  //   text: body,
  // });
}

// Lifecycle email templates
function licenseIssuedEmail(name, key) {
  return {
    subject: 'Your ObserveCo License is Ready',
    body: `Hi ${name || 'there'},

Your ObserveCo license key is ready:

  License Key: ${key}

To activate:
  1. Install ObserveCo: pip install observeco
  2. Run: observeco license activate ${key}
  3. Open the dashboard: observeco dashboard

Get started: https://docs.observeco.ai

Cheers,
The ObserveCo Team`,
  };
}

function trialEndingEmail(name, daysLeft) {
  return {
    subject: `Your ObserveCo Trial Ends in ${daysLeft} Day${daysLeft > 1 ? 's' : ''}`,
    body: `Hi ${name || 'there'},

Your 30-day free trial of ObserveCo will end in ${daysLeft} day${daysLeft > 1 ? 's' : ''}.

To keep your Pro features active, upgrade to Solo ($9/mo):

  https://observeco.com/upgrade

Your data is safe — nothing is deleted when your trial ends. You'll just lose push alerts and extended history until you upgrade.

Cheers,
The ObserveCo Team`,
  };
}

function licenseExpiredEmail(name) {
  return {
    subject: 'Your ObserveCo License Has Expired',
    body: `Hi ${name || 'there'},

Your ObserveCo license has expired. Your dashboard still works with the Free tier (in-dashboard alerts, 7-day history).

To restore Pro features:

  https://observeco.com/upgrade

If you've already renewed, your license should update automatically within 24 hours.

Cheers,
The ObserveCo Team`,
  };
}

module.exports = { sendEmail, licenseIssuedEmail, trialEndingEmail, licenseExpiredEmail };