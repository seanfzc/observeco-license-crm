// GET /api/admin/licenses — List all licenses with pagination, search, sort
// POST /api/admin/licenses — Issue a free license
const { getSupabase } = require('../_supabase.js');
const { logAudit, extractIp } = require('../_audit.js');
const crypto = require('crypto');

// License key utilities
function generateLicenseKey() {
  const prefix = 'OBS';
  const raw = crypto.randomUUID().slice(0, 8).toUpperCase();
  const checksum = luhnChecksum(raw);
  return `${prefix}-${raw}${checksum}`;
}

function luhnChecksum(str) {
  // Simple mod-10 checksum on hex characters
  let sum = 0;
  let double = false;
  for (let i = str.length - 1; i >= 0; i--) {
    let digit = parseInt(str[i], 16);
    if (isNaN(digit)) digit = 0;
    if (double) {
      digit *= 2;
      if (digit > 15) digit -= 15;
    }
    sum += digit;
    double = !double;
  }
  const check = (10 - (sum % 10)) % 10;
  return check.toString(16).toUpperCase();
}

function validateLicenseKey(key) {
  // Format: OBS-XXXXXXXX-C where C is checksum hex digit
  const match = key.match(/^OBS-([0-9A-F]{8})([0-9A-F])$/i);
  if (!match) return true; // Legacy format, skip validation
  const [, body, checksum] = match;
  return luhnChecksum(body) === checksum.toUpperCase();
}

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

    // GET — list all licenses with pagination, search, sort
    if (req.method === 'GET') {
      const page = Math.max(1, parseInt(req.query.page || '1'));
      const perPage = Math.min(200, Math.max(1, parseInt(req.query.per_page || '50')));
      const sortCol = ['email', 'name', 'product_slug', 'status', 'created_at', 'expires_at', 'license_key'].includes(req.query.sort) ? req.query.sort : 'created_at';
      const sortDir = req.query.order === 'asc' ? { ascending: true } : { ascending: false };
      const search = req.query.q || '';
      const statusFilter = req.query.status || '';

      let query = supabase
        .from('licenses')
        .select('id, email, name, product_slug, status, created_at, expires_at, license_key, issued_by', { count: 'exact' });

      // Apply search
      if (search) {
        query = query.or(`email.ilike.%${search}%,name.ilike.%${search}%,license_key.ilike.%${search}%`);
      }

      // Apply status filter
      if (statusFilter && ['trialing', 'active', 'expired', 'cancelled'].includes(statusFilter)) {
        query = query.eq('status', statusFilter);
      }

      const { data, error, count } = await query
        .order(sortCol, sortDir)
        .range((page - 1) * perPage, page * perPage - 1);

      if (error) {
        console.error('admin list error:', error);
        return res.status(500).json({ error: 'Query failed' });
      }

      return res.status(200).json({
        data: data || [],
        pagination: {
          page,
          per_page: perPage,
          total: count || 0,
          total_pages: Math.ceil((count || 0) / perPage),
        },
      });
    }

    // POST — issue free license
    if (req.method === 'POST') {
      const { email, name, product_slug = 'solo', expires_in_days = 365 } = req.body || {};

      if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Valid email required' });
      }

      const license_key = generateLicenseKey();
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

      logAudit({
        action: 'create_license',
        license_key: data.license_key,
        new_values: data,
        ip: extractIp(req),
      });

      return res.status(201).json(data);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('admin error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
};
