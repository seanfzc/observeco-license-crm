// GET /api/admin/products — Available product tiers
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
      .from('products')
      .select('*')
      .order('price_display', { ascending: true });

    if (error) {
      console.error('products query error:', error);
      return res.status(500).json({ error: 'Query failed' });
    }

    return res.status(200).json(data || []);
  } catch (err) {
    console.error('products error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
};