// POST /api/stripe/webhook
// Stripe webhook endpoint — processes checkout.session.completed
// and customer.subscription.deleted events.
//
// IMPORTANT: bodyParser is disabled. Raw body is consumed manually
// for Stripe signature verification.
const { getSupabase } = require('../_supabase.js');
const { getStripe } = require('../_stripe.js');
const crypto = require('crypto');

function generateLicenseKey() {
  const raw = crypto.randomUUID().slice(0, 8).toUpperCase();
  const checksum = (() => {
    let sum = 0, double = false;
    for (let i = raw.length - 1; i >= 0; i--) {
      let d = parseInt(raw[i], 16);
      if (isNaN(d)) d = 0;
      if (double) { d *= 2; if (d > 15) d -= 15; }
      sum += d; double = !double;
    }
    return ((10 - (sum % 10)) % 10).toString(16).toUpperCase();
  })();
  return `OBS-${raw}${checksum}`;
}

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return res.status(400).json({ error: 'Missing stripe-signature or webhook secret' });
  }

  let rawBody;
  try {
    rawBody = await getRawBody(req);
  } catch (err) {
    return res.status(400).json({ error: 'Failed to read request body' });
  }

  if (!rawBody || rawBody.length === 0) {
    return res.status(400).json({ error: 'Empty request body' });
  }

  let event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('webhook signature error:', err.message);
    return res.status(400).json({ error: 'Invalid signature: ' + err.message });
  }

  try {
    const supabase = getSupabase();

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const email = session.customer_details?.email || session.customer_email;
      const customerId = session.customer;
      const subscriptionId = session.subscription;

      if (!email) {
        return res.status(200).json({ received: true });
      }

      const license_key = generateLicenseKey();
      const expires_at = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

      const { error: insertError } = await supabase
        .from('licenses')
        .insert({
          product_slug: 'solo',
          email: email.toLowerCase(),
          name: session.customer_details?.name || email.split('@')[0],
          license_key,
          status: 'active',
          expires_at,
          stripe_subscription_id: subscriptionId,
          stripe_customer_id: customerId,
          issued_by: 'stripe',
        });

      if (insertError) {
        console.error('webhook insert error:', insertError.message);
      }

      return res.status(200).json({ received: true, license_key });
    }

    if (event.type === 'customer.subscription.created') {
      const sub = event.data.object;
      const email = sub.customer_email || sub.customer?.email || '';
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
      const subscriptionId = sub.id;
      const items = sub.items?.data || [];
      const price = items[0]?.price;
      const productSlug = price?.metadata?.product_slug || 'solo';
      const interval = price?.recurring?.interval || 'month';
      const now = new Date();
      const expires_at = new Date(now.getTime() + (interval === 'year' ? 365 : 30) * 24 * 60 * 60 * 1000).toISOString();

      if (!email) {
        return res.status(200).json({ received: true });
      }

      // Check if license already exists for this subscription
      const { data: existing } = await supabase
        .from('licenses')
        .select('id, status')
        .eq('stripe_subscription_id', subscriptionId)
        .single();

      if (existing) {
        // Update existing license
        await supabase
          .from('licenses')
          .update({ status: 'active', expires_at, updated_at: now.toISOString() })
          .eq('stripe_subscription_id', subscriptionId);
      } else {
        // Create new license
        const license_key = generateLicenseKey();
        await supabase
          .from('licenses')
          .insert({
            product_slug: productSlug,
            email: email.toLowerCase(),
            name: email.split('@')[0],
            license_key,
            status: 'active',
            expires_at,
            stripe_subscription_id: subscriptionId,
            stripe_customer_id: customerId,
            issued_by: 'stripe',
          });
      }

      return res.status(200).json({ received: true });
    }

    if (event.type === 'customer.subscription.updated') {
      const sub = event.data.object;
      if (sub.status === 'past_due' || sub.status === 'unpaid') {
        await supabase
          .from('licenses')
          .update({ status: 'expired', updated_at: new Date().toISOString() })
          .eq('stripe_subscription_id', sub.id);
      } else if (sub.status === 'active') {
        // Extend expiration
        const items = sub.items?.data || [];
        const price = items[0]?.price;
        const interval = price?.recurring?.interval || 'month';
        const now = new Date();
        const expires_at = new Date(now.getTime() + (interval === 'year' ? 365 : 30) * 24 * 60 * 60 * 1000).toISOString();
        await supabase
          .from('licenses')
          .update({ status: 'active', expires_at, updated_at: now.toISOString() })
          .eq('stripe_subscription_id', sub.id);
      }
      return res.status(200).json({ received: true });
    }

    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      const { error: updateError } = await supabase
        .from('licenses')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('stripe_subscription_id', sub.id);

      if (updateError) {
        console.error('cancel update error:', updateError.message);
      }

      return res.status(200).json({ received: true });
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('webhook error:', err.message);
    return res.status(500).json({ error: 'Internal error' });
  }
};

// Disable Vercel's default body parser for Stripe raw body
module.exports.config = {
  api: {
    bodyParser: false,
  },
};
