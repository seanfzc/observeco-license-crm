// POST /api/admin/licenses/[key]/suspend — Suspend a license (revoke without deleting)
const { getSupabase } = require('../../../_supabase.js');
const { logAudit, extractIp } = require('../../../_audit.js');

function checkAuth(req) {
  const auth = req.headers['authorization'] || '';
  const key = process.env.ADMIN_API_KEY;
  return !!(key && auth === `Bearer ${key}`);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!checkAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { key } = req.query;

  if (!key) {
    return res.status(400).json({ error: 'License key is required' });
  }

  try {
    const supabase = getSupabase();

    const { data: existing } = await supabase
      .from('licenses')
      .select('*')
      .eq('license_key', key)
      .single();

    if (!existing) {
      return res.status(404).json({ error: 'License not found' });
    }

    if (existing.status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot suspend a cancelled license' });
    }

    const { data, error } = await supabase
      .from('licenses')
      .update({
        status: 'expired',
        metadata: {
          ...(existing.metadata || {}),
          suspended_at: new Date().toISOString(),
          suspend_reason: req.body?.reason || '',
        },
        updated_at: new Date().toISOString(),
      })
      .eq('license_key', key)
      .select('id, email, name, product_slug, license_key, status, expires_at')
      .single();

    if (error) {
      console.error('admin suspend error:', error);
      return res.status(500).json({ error: 'Suspend failed' });
    }

    logAudit({
      action: 'suspend_license',
      license_key: key,
      old_values: existing,
      new_values: data,
      ip: extractIp(req),
    });

    return res.status(200).json({ message: 'License suspended', license: data });
  } catch (err) {
    console.error('admin suspend error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
};