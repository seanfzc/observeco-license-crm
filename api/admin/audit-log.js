// GET /api/admin/audit-log — Recent admin actions
const { getSupabase } = require('../_supabase.js');

module.exports = async function handler(req, res) {
  const auth = req.headers['authorization'] || '';
  const key = process.env.ADMIN_API_KEY;
  if (!key || auth !== `Bearer ${key}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const limit = Math.min(parseInt(req.query.limit || '50'), 200);

  try {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('admin_audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('audit log query error:', error);
      return res.status(500).json({ error: 'Query failed' });
    }

    return res.status(200).json(data || []);
  } catch (err) {
    console.error('audit log error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
};