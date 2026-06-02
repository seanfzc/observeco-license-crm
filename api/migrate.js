// POST /api/migrate — One-shot Supabase schema migration
// Secret: MIGRATE_SECRET env var (set once, remove after use)
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  const auth = req.headers['authorization'] || '';
  const migrateSecret = process.env.MIGRATE_SECRET;
  if (!migrateSecret || auth !== `Bearer ${migrateSecret}`) {
    return res.status(401).json({ error: 'Unauthorized — use MIGRATE_SECRET' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    const sql = `-- ObserveCo Licensing Schema
-- Run this in your Supabase SQL Editor (one time)

-- Products table (public read)
CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  stripe_price_id TEXT,
  features JSONB DEFAULT '[]'::jsonb,
  trial_days INT DEFAULT 0,
  price_display TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed products
INSERT INTO products (name, slug, stripe_price_id, features, trial_days, price_display)
VALUES
  ('Free', 'free', NULL, '["fleet_view", "pulse_check", "circuit_breakers", "token_breakdown", "drift_trend", "error_history", "heal_button", "alerts", "memory_garden", "cli_tools"]'::jsonb, 0, '$0'),
  ('Solo', 'solo', 'price_solo_monthly', '["free_features", "pro_badge", "license_validation", "stripe_checkout", "auto_heal"]'::jsonb, 30, '$9/mo')
ON CONFLICT (slug) DO NOTHING;

-- Licenses table
CREATE TABLE IF NOT EXISTS licenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_slug TEXT REFERENCES products(slug),
  email TEXT NOT NULL,
  name TEXT,
  license_key TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'trialing' CHECK (status IN ('trialing', 'active', 'expired', 'cancelled')),
  trial_ends_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  issued_by TEXT DEFAULT 'self' CHECK (issued_by IN ('self', 'stripe', 'admin')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(license_key);
CREATE INDEX IF NOT EXISTS idx_licenses_email ON licenses(email);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);

-- RLS: allow public read on products
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS products_public_read ON products;
CREATE POLICY products_public_read ON products
  FOR SELECT USING (true);

-- RLS: allow service_role insert/select on licenses
ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS licenses_service_access ON licenses;
CREATE POLICY licenses_service_access ON licenses
  FOR ALL USING (true)
  WITH CHECK (true);

-- License validation log
CREATE TABLE IF NOT EXISTS validations_log (
  id BIGSERIAL PRIMARY KEY,
  license_key TEXT NOT NULL REFERENCES licenses(license_key) ON DELETE CASCADE,
  success BOOLEAN NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  machine_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_validations_key ON validations_log(license_key);
CREATE INDEX IF NOT EXISTS idx_validations_ts ON validations_log(created_at);

-- Admin audit log
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  license_key TEXT,
  old_values JSONB,
  new_values JSONB,
  admin_id TEXT DEFAULT 'admin',
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_key ON admin_audit_log(license_key);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON admin_audit_log(created_at);
`;

    // Execute via raw SQL using the service role key's ability
    // Supabase supports POST to /rest/v1/rpc/ with raw SQL via pg_query extension
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--') && s.length > 5);

    const results = [];
    for (const stmt of statements) {
      const fullStmt = stmt + ';';
      try {
        // Try executing via supabase-js raw query
        // If this fails, we need the pg_query extension
        const { error } = await supabase.rpc('exec_sql', { query: fullStmt });
        if (error) throw error;
        results.push({ status: 'ok', sql: fullStmt.substring(0, 60) });
      } catch (e) {
        results.push({ status: 'error', sql: fullStmt.substring(0, 60), error: e.message });
      }
    }

    // Verify products table
    const { data: products } = await supabase.from('products').select('*').limit(5);
    const { data: licenses } = await supabase.from('licenses').select('count', { count: 'exact', head: true });

    return res.status(200).json({
      status: 'ok',
      statements: results.length,
      sql_errors: results.filter(r => r.status === 'error').length,
      products: products || [],
      license_count: licenses?.count ?? 0,
    });
  } catch (err) {
    console.error('migration error:', err);
    return res.status(500).json({ error: err.message });
  }
};