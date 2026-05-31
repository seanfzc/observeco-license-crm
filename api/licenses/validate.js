// POST /api/licenses/validate
// Validates a license key against the database.
const { getSupabase } = require('../_supabase.js');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { license_key } = req.body || {};

  if (!license_key || typeof license_key !== 'string') {
    return res.status(400).json({ valid: false, error: 'Missing license_key' });
  }

  try {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('licenses')
      .select('id, product_slug, status, expires_at, trial_ends_at, products(features)')
      .eq('license_key', license_key.trim())
      .single();

    if (error || !data) {
      return res.status(404).json({ valid: false, error: 'License not found' });
    }

    const now = new Date();
    const expired = data.expires_at && new Date(data.expires_at) < now;
    const trialExpired = data.trial_ends_at && new Date(data.trial_ends_at) < now;

    let status = data.status;
    if (data.status === 'trialing' && trialExpired) status = 'expired';
    else if (data.status === 'active' && expired) status = 'expired';

    const valid = status === 'active' || status === 'trialing';

    return res.status(200).json({
      valid,
      product: data.product_slug,
      status,
      features: data.products?.features || [],
      expires_at: data.expires_at || data.trial_ends_at,
    });
  } catch (err) {
    console.error('validate error:', err);
    return res.status(500).json({ valid: false, error: 'Internal error' });
  }
};
