// GET /api/admin/licenses/[key]/validations — Validation history for a license
const { getSupabase } = require('../../../_supabase.js');

function checkAuth(req) {
  const auth = req.headers['authorization'] || '';
  const key = process.env.ADMIN_API_KEY;
  return !!(key && auth === `Bearer ${key}`);
}

module.exports = async function handler(req, res) {
  if (!checkAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { key } = req.query;

  if (!key) {
    return res.status(400).json({ error: 'License key is required' });
  }

  try {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('validations_log')
      .select('*')
      .eq('license_key', key)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('validations query error:', error);
      return res.status(500).json({ error: 'Query failed' });
    }

    return res.status(200).json(data || []);
  } catch (err) {
    console.error('validations error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
};