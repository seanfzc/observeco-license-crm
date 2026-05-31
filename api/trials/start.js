// POST /api/trials/start
// Starts a 30-day free trial for a user.
const { getSupabase } = require('../_supabase.js');
const crypto = require('crypto');

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

    const license_key = 'OBS-' + crypto.randomUUID().slice(0, 8).toUpperCase() + '-' + crypto.randomUUID().slice(0, 4).toUpperCase();
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
