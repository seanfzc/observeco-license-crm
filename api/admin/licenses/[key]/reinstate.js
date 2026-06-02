// POST /api/admin/licenses/[key]/reinstate — Reinstate a suspended license
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

    if (existing.status !== 'expired') {
      return res.status(400).json({ error: 'Only expired/suspended licenses can be reinstated' });
    }

    const { data, error } = await supabase
      .from('licenses')
      .update({
        status: 'active',
        metadata: {
          ...(existing.metadata || {}),
          reinstated_at: new Date().toISOString(),
          reinstated_reason: req.body?.reason || '',
        },
        updated_at: new Date().toISOString(),
      })
      .eq('license_key', key)
      .select('id, email, name, product_slug, license_key, status, expires_at')
      .single();

    if (error) {
      console.error('admin reinstate error:', error);
      return res.status(500).json({ error: 'Reinstate failed' });
    }

    logAudit({
      action: 'reinstate_license',
      license_key: key,
      old_values: existing,
      new_values: data,
      ip: extractIp(req),
    });

    return res.status(200).json({ message: 'License reinstated', license: data });
  } catch (err) {
    console.error('admin reinstate error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
};