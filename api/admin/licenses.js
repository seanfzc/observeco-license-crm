// GET /api/admin/licenses — List all licenses
// POST /api/admin/licenses — Issue a free license
const { getSupabase } = require('../_supabase.js');
const crypto = require('crypto');

function checkAuth(req) {
  const auth = req.headers['authorization'] || '';
  const key = process.env.ADMIN_API_KEY;
  return !!(key && auth === `Bearer ${key}`);
}

module.exports = async function handler(req, res) {
  if (!checkAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const supabase = getSupabase();

    // GET — list all licenses
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('licenses')
        .select('id, email, name, product_slug, status, created_at, expires_at, license_key, issued_by')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) {
        console.error('admin list error:', error);
        return res.status(500).json({ error: 'Query failed' });
      }

      return res.status(200).json(data || []);
    }

    // POST — issue free license
    if (req.method === 'POST') {
      const { email, name, product_slug = 'solo', expires_in_days = 365 } = req.body || {};

      if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Valid email required' });
      }

      const license_key = 'OBS-' + crypto.randomUUID().slice(0, 8).toUpperCase();
      const expires_at = new Date(Date.now() + expires_in_days * 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('licenses')
        .insert({
          product_slug,
          email: email.toLowerCase(),
          name: name || email.split('@')[0],
          license_key,
          status: 'active',
          expires_at,
          issued_by: 'admin',
        })
        .select('id, email, name, product_slug, license_key, status, expires_at')
        .single();

      if (error) {
        console.error('admin insert error:', error);
        return res.status(500).json({ error: 'Failed to create license' });
      }

      return res.status(201).json(data);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('admin error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
};
