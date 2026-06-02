// POST /api/trials/start
// Starts a 30-day free trial for a user.
const { getSupabase } = require('../_supabase.js');
const crypto = require('crypto');

function generateLicenseKey() {
  const raw = crypto.randomUUID().slice(0, 8).toUpperCase();
  const checksum = (() => {
    let sum = 0, double = false;
    for (let i = raw.length - 1; i >= 0; i--) {
      let d = parseInt(raw[i], 16);
      if (isNaN(d)) d = 0;
      if (double) { d *= 2; if (d > 15) d -= 15; }
      sum += d; double = !double;
    }
    return ((10 - (sum % 10)) % 10).toString(16).toUpperCase();
  })();
  return `OBS-${raw}${checksum}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body || {};

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  try {
    const supabase = getSupabase();

    // Check if this email already has a license
    const { data: existing } = await supabase
      .from('licenses')
      .select('id, status, license_key')
      .eq('email', email.trim().toLowerCase())
      .single();

    if (existing && (existing.status === 'active' || existing.status === 'trialing')) {
      return res.status(200).json({
        license_key: existing.license_key,
        trial_ends_at: null,
        message: 'You already have an active license',
      });
    }

    const license_key = generateLicenseKey();
    const trial_ends_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('licenses')
      .insert({
        product_slug: 'solo',
        email: email.trim().toLowerCase(),
        name: email.split('@')[0],
        license_key,
        status: 'trialing',
        trial_ends_at,
        issued_by: 'self',
      })
      .select('license_key, trial_ends_at')
      .single();

    if (error) {
      console.error('trial insert error:', error);
      return res.status(500).json({ error: 'Failed to create trial' });
    }

    return res.status(201).json({
      license_key: data.license_key,
      trial_ends_at: data.trial_ends_at,
      message: '30-day trial started',
    });
  } catch (err) {
    console.error('trial error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
};
