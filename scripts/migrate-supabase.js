// Run Supabase schema migration — sends entire SQL as one batch
// Usage: SUPABASE_ACCESS_TOKEN=sbp_xxx node scripts/migrate-supabase.js
const https = require('https');
const fs = require('fs');
const path = require('path');

const PROJECT_REF = 'vuyhjbmvyimapabdcjjt';
const sql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
const token = process.env.SUPABASE_ACCESS_TOKEN;

if (!token) {
  console.error('ERROR: Set SUPABASE_ACCESS_TOKEN env var');
  process.exit(1);
}

const body = JSON.stringify({ query: sql });

const req = https.request({
  hostname: 'api.supabase.com',
  path: `/v1/projects/${PROJECT_REF}/database/query`,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Authorization': `Bearer ${token}`,
  },
  timeout: 60000,
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log('✅ Schema migration complete');
    } else {
      console.log(`⚠️  HTTP ${res.statusCode}: ${data.substring(0, 1000)}`);
    }
  });
});
req.on('error', (e) => console.error('❌ Error:', e.message));
req.write(body);
req.end();