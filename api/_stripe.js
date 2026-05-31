// Shared Stripe client factory (CommonJS)
const Stripe = require('stripe');

let client = null;

function getStripe() {
  if (client) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('Missing STRIPE_SECRET_KEY');
  client = new Stripe(key);
  return client;
}

module.exports = { getStripe };
