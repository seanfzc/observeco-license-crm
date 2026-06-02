// Shared admin audit logging utility
const { getSupabase } = require('./_supabase.js');

async function logAudit({ action, license_key, old_values, new_values, ip }) {
  try {
    const supabase = getSupabase();
    await supabase.from('admin_audit_log').insert({
      action,
      license_key,
      old_values: old_values || null,
      new_values: new_values || null,
      admin_id: 'admin',
      ip_address: ip || null,
    });
  } catch (err) {
    console.error('audit log error:', err?.message || String(err));
  }
}

function extractIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.socket?.remoteAddress
    || 'unknown';
}

module.exports = { logAudit, extractIp };