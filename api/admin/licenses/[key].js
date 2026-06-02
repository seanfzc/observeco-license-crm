// GET /api/admin/licenses/[key] — Single license with detail
// PATCH /api/admin/licenses/[key] — Edit a license
// DELETE /api/admin/licenses/[key] — Soft-delete (set status=cancelled)
const { getSupabase } = require('../../_supabase.js');
const { logAudit, extractIp } = require('../../_audit.js');

function checkAuth(req) {
  const auth = req.headers['authorization'] || '';
  const key = process.env.ADMIN_API_KEY;
  return !!(key && auth === `Bearer ${key}`);
}

module.exports = async function handler(req, res) {
  if (!checkAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { key } = req.query;

  if (!key) {
    return res.status(400).json({ error: 'License key is required' });
  }

  try {
    const supabase = getSupabase();

    // GET — single license with full detail
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('licenses')
        .select('*')
        .eq('license_key', key)
        .single();

      if (error || !data) {
        return res.status(404).json({ error: 'License not found' });
      }

      return res.status(200).json(data);
    }

    // PATCH — edit license fields
    if (req.method === 'PATCH') {
      const { name, email, product_slug, expires_at, status, metadata, notes } = req.body || {};

      // Build allowed update fields
      const updates = {};
      if (name !== undefined) updates.name = name;
      if (email !== undefined) updates.email = email.toLowerCase();
      if (product_slug !== undefined) updates.product_slug = product_slug;
      if (expires_at !== undefined) updates.expires_at = expires_at;
      if (status !== undefined) {
        const allowed = ['trialing', 'active', 'expired', 'cancelled'];
        if (!allowed.includes(status)) {
          return res.status(400).json({ error: `Status must be one of: ${allowed.join(', ')}` });
        }
        updates.status = status;
      }
      if (metadata !== undefined) updates.metadata = metadata;
      if (notes !== undefined) {
        // Store notes inside metadata.notes
        updates.metadata = { ...(updates.metadata || {}), notes };
      }
      updates.updated_at = new Date().toISOString();

      if (Object.keys(updates).length <= 1) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }

      const { data: before } = await supabase
        .from('licenses')
        .select('*')
        .eq('license_key', key)
        .single();

      if (!before) {
        return res.status(404).json({ error: 'License not found' });
      }

      const { data, error } = await supabase
        .from('licenses')
        .update(updates)
        .eq('license_key', key)
        .select('id, email, name, product_slug, license_key, status, expires_at, created_at, updated_at')
        .single();

      if (error) {
        console.error('admin patch error:', error);
        return res.status(500).json({ error: 'Update failed' });
      }

      // Audit log
      logAudit({
        action: 'patch_license',
        license_key: key,
        old_values: before,
        new_values: data,
        ip: extractIp(req),
      });

      return res.status(200).json({
        message: 'License updated',
        license: data,
        changes: Object.keys(updates).filter(k => k !== 'updated_at'),
      });
    }

    // DELETE — soft-delete (set status=cancelled)
    if (req.method === 'DELETE') {
      const { data: before } = await supabase
        .from('licenses')
        .select('*')
        .eq('license_key', key)
        .single();

      if (!before) {
        return res.status(404).json({ error: 'License not found' });
      }

      const { data, error } = await supabase
        .from('licenses')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('license_key', key)
        .select('id, email, name, product_slug, license_key, status, expires_at')
        .single();

      if (error) {
        console.error('admin delete error:', error);
        return res.status(500).json({ error: 'Delete failed' });
      }

      return res.status(200).json({ message: 'License cancelled', license: data });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('admin license key error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
};