// GET /api/admin/stats — License dashboard counts
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

  try {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('licenses')
      .select('status');

    if (error) {
      console.error('stats error:', error);
      return res.status(500).json({ error: 'Query failed' });
    }

    const counts = { active: 0, trialing: 0, expired: 0, cancelled: 0, total: 0 };
    for (const row of data || []) {
      if (counts[row.status] !== undefined) counts[row.status]++;
      counts.total++;
    }

    return res.status(200).json(counts);
  } catch (err) {
    console.error('stats error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
};
