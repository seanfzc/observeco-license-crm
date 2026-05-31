-- ObserveCo Licensing Schema
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

-- RLS: allow public read on products (anonymous key can read)
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
