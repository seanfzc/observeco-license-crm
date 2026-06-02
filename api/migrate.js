// POST /api/migrate — Run Supabase schema migration once.
// Usage: POST with header "Authorization: Bearer <MIGRATE_SECRET>"
const { createClient } = require('@supabase/supabase-js');

const SQL = `
CREATE TABLE IF NOT EXISTS public.products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  stripe_price_id TEXT,
  features JSONB DEFAULT '[]'::jsonb,
  trial_days INT DEFAULT 0,
  price_display TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
INSERT INTO public.products (name, slug, stripe_price_id, features, trial_days, price_display)
VALUES
  ('Free', 'free', NULL, '["fleet_view","pulse_check","circuit_breakers","token_breakdown","drift_trend","error_history","heal_button","alerts","memory_garden","cli_tools"]'::jsonb, 0, '$0'),
  ('Solo', 'solo', 'price_solo_monthly', '["free_features","pro_badge","license_validation","stripe_checkout","auto_heal"]'::jsonb, 30, '$9/mo')
ON CONFLICT (slug) DO NOTHING;
CREATE TABLE IF NOT EXISTS public.licenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_slug TEXT REFERENCES public.products(slug),
  email TEXT NOT NULL,
  name TEXT,
  license_key TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'trialing' CHECK (status IN ('trialing','active','expired','cancelled','suspended')),
  trial_ends_at TIMESTAMPTZ, expires_at TIMESTAMPTZ,
  stripe_subscription_id TEXT, stripe_customer_id TEXT,
  issued_by TEXT DEFAULT 'self' CHECK (issued_by IN ('self','stripe','admin')),
  notes TEXT DEFAULT '', metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_licenses_key ON public.licenses(license_key);
CREATE INDEX IF NOT EXISTS idx_licenses_email ON public.licenses(email);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON public.licenses(status);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS products_public_read ON public.products;
CREATE POLICY products_public_read ON public.products FOR SELECT USING (true);
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS licenses_service_access ON public.licenses;
CREATE POLICY licenses_service_access ON public.licenses FOR ALL USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS public.validations_log (
  id BIGSERIAL PRIMARY KEY,
  license_key TEXT NOT NULL REFERENCES public.licenses(license_key) ON DELETE CASCADE,
  success BOOLEAN NOT NULL, ip_address TEXT, user_agent TEXT, machine_id TEXT,
  error_message TEXT, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_validations_key ON public.validations_log(license_key);
CREATE INDEX IF NOT EXISTS idx_validations_ts ON public.validations_log(created_at);
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL, license_key TEXT,
  old_values JSONB, new_values JSONB,
  admin_id TEXT DEFAULT 'admin', ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_key ON public.admin_audit_log(license_key);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON public.admin_audit_log(created_at);
`;

module.exports = async function handler(req, res) {
  const secret = process.env.MIGRATE_SECRET;
  const auth = req.headers['authorization'] || '';
  if (!secret || auth !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // Try rpc-based SQL execution
  const stmts = SQL.split(';').map(s => s.trim()).filter(s => s && s.length > 10 && !s.startsWith('--'));
  const results = [];
  let allOk = true;

  for (let i = 0; i < stmts.length; i++) {
    const sql = stmts[i] + ';';
    try {
      const { error } = await supabase.rpc('exec_sql', { query: sql });
      if (error) {
        results.push({ n: i + 1, status: 'error', error: error.message, sql: sql.substring(0, 60) });
        allOk = false;
      } else {
        results.push({ n: i + 1, status: 'ok', sql: sql.substring(0, 60) });
      }
    } catch (e) {
      results.push({ n: i + 1, status: 'error', error: e.message, sql: sql.substring(0, 60) });
      allOk = false;
    }
  }

  // Verify
  let verify = {};
  try {
    const { data: products } = await supabase.from('products').select('slug').limit(10);
    verify.products = products;
  } catch (e) { verify.productsError = e.message; }
  try {
    const { data: licenses } = await supabase.from('licenses').select('count', { count: 'exact', head: true });
    verify.licenseCount = licenses;
  } catch (e) { verify.licensesError = e.message; }

  return res.status(allOk ? 200 : 500).json({
    status: allOk ? 'ok' : 'partial',
    statements: stmts.length,
    ok: results.filter(r => r.status === 'ok').length,
    failed: results.filter(r => r.status === 'error').length,
    details: results,
    verify,
  });
};