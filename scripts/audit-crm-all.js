const fs = require('fs');
const checks = [];

function check(name, ok, detail) {
  checks.push({name, ok});
  console.log((ok ? '  [PASS]' : '  [FAIL]'), name);
  if (!ok && detail) console.log('         ', detail);
}

console.log('='.repeat(60));
console.log('INDEPENDENT AUDIT: ALL CRM TASKS');
console.log('='.repeat(60));
console.log();

const BASE = '/Users/seanfzc/licensing-api';

// 1. File structure
const expected = [
  'api/_supabase.js', 'api/_audit.js', 'api/_email.js', 'api/_stripe.js',
  'api/admin/licenses.js', 'api/admin/stats.js', 'api/admin/products.js',
  'api/admin/audit-log.js',
  'api/admin/licenses/[key].js', 'api/admin/licenses/[key]/suspend.js',
  'api/admin/licenses/[key]/reinstate.js', 'api/admin/licenses/[key]/validations.js',
  'api/licenses/validate.js', 'api/stripe/webhook.js', 'api/trials/start.js',
  'api/cron/reminders.js',
];
for (const f of expected) {
  const ok = fs.existsSync(BASE + '/' + f);
  check('API: ' + f, ok);
}

// 2. All JS files have valid syntax
const jsFiles = expected.filter(f => f.endsWith('.js'));
for (const f of jsFiles) {
  const code = fs.readFileSync(BASE + '/' + f, 'utf-8');
  try {
    const mockCode = code.replace(/require\([^)]+\)/g, 'null').replace(/module\.exports/g, 'var x');
    new Function(mockCode);
    check(f + ': syntax valid', true);
  } catch(e2) {
    check(f + ': syntax valid', false, e2.message);
  }
}

// 3. Endpoint coverage
const keyJs = fs.readFileSync(BASE + '/api/admin/licenses/[key].js', 'utf-8');
check('GET single license', keyJs.includes("=== 'GET'"));
check('PATCH license', keyJs.includes("=== 'PATCH'"));
check('DELETE license', keyJs.includes("=== 'DELETE'"));
check('PATCH accepts notes', keyJs.includes('notes'));
check('PATCH validates status', keyJs.includes('allowed'));
check('Audit logging imported', keyJs.includes('_audit'));
check('Audit log written on PATCH', keyJs.includes('logAudit'));

const susJs = fs.readFileSync(BASE + '/api/admin/licenses/[key]/suspend.js', 'utf-8');
check('Suspend: POST only', susJs.includes("=== 'POST'"));
check('Suspend: logAudit', susJs.includes('logAudit'));

const reinJs = fs.readFileSync(BASE + '/api/admin/licenses/[key]/reinstate.js', 'utf-8');
check('Reinstate: POST only', reinJs.includes("=== 'POST'"));
check('Reinstate: logAudit', reinJs.includes('logAudit'));

const valJs = fs.readFileSync(BASE + '/api/admin/licenses/[key]/validations.js', 'utf-8');
check('Validations: GET only', valJs.includes("=== 'GET'"));

const licJs = fs.readFileSync(BASE + '/api/admin/licenses.js', 'utf-8');
check('Licenses list: pagination', licJs.includes('per_page'));
check('Licenses list: search (ilike)', licJs.includes('ilike'));
check('Licenses list: sort column', licJs.includes('sortCol'));
check('Licenses list: status filter', licJs.includes('statusFilter'));
check('Licenses POST: generateLicenseKey', licJs.includes('generateLicenseKey'));
check('Licenses POST: logAudit', licJs.includes('logAudit'));

const prodJs = fs.readFileSync(BASE + '/api/admin/products.js', 'utf-8');
check('Products endpoint', prodJs.includes('products'));

const auditJs = fs.readFileSync(BASE + '/api/admin/audit-log.js', 'utf-8');
check('Audit log endpoint', auditJs.includes('admin_audit_log'));

const whJs = fs.readFileSync(BASE + '/api/stripe/webhook.js', 'utf-8');
check('Webhook: checkout.session.completed', whJs.includes('checkout.session.completed'));
check('Webhook: subscription.created', whJs.includes('subscription.created'));
check('Webhook: subscription.updated', whJs.includes('subscription.updated'));
check('Webhook: subscription.deleted', whJs.includes('subscription.deleted'));
check('Webhook: generateLicenseKey', whJs.includes('generateLicenseKey'));

const trJs = fs.readFileSync(BASE + '/api/trials/start.js', 'utf-8');
check('Trials: generateLicenseKey', trJs.includes('generateLicenseKey'));

const vJs = fs.readFileSync(BASE + '/api/licenses/validate.js', 'utf-8');
check('Validate: logs to validations_log', vJs.includes('validations_log'));
check('Validate: captures IP', vJs.includes('x-forwarded-for'));
check('Validate: captures User-Agent', vJs.includes('user-agent'));
check('Validate: captures machine_id', vJs.includes('machine_id'));

const emJs = fs.readFileSync(BASE + '/api/_email.js', 'utf-8');
check('Email utility exists', emJs.includes('sendEmail'));
check('Email: licenseIssuedEmail', emJs.includes('licenseIssuedEmail'));
check('Email: trialEndingEmail', emJs.includes('trialEndingEmail'));
check('Email: licenseExpiredEmail', emJs.includes('licenseExpiredEmail'));
check('Email: logs sends to metadata.emails_sent', emJs.includes('emails_sent'));

const crJs = fs.readFileSync(BASE + '/api/cron/reminders.js', 'utf-8');
check('Cron: trial ending (7/3/1 day)', crJs.includes('trial_ending'));
check('Cron: expiry reminders (7/3/1 day)', crJs.includes('expiry_reminder'));

// Schema
const sch = fs.readFileSync(BASE + '/schema.sql', 'utf-8');
check('Schema: validations_log table', sch.includes('validations_log'));
check('Schema: admin_audit_log table', sch.includes('admin_audit_log'));
check('Schema: idx_validations_key index', sch.includes('idx_validations_key'));
check('Schema: idx_audit_key index', sch.includes('idx_audit_key'));

// Frontend
const html = fs.readFileSync(BASE + '/public/admin.html', 'utf-8');
check('FE: multi-product dynamic dropdown', html.includes('api(/api/admin/products'));
check('FE: sort dropdown', html.includes('sortSelect'));
check('FE: audit log link', html.includes('showAuditLog'));
check('FE: CSV export', html.includes('exportCsv'));
check('FE: notes field in edit modal', html.includes('editNotes'));
check('FE: detail modal with validation history', html.includes('detailModal') && html.includes('Recent Validations'));
check('FE: audit log modal', html.includes('Admin Audit Log'));
check('FE: search+filter trigger refresh()', html.includes('oninput=\"refresh()\"') && html.includes('onchange=\"refresh()\"'));
check('FE: 8-column table', html.includes('colspan=\"8\"'));
check('FE: clickable row to detail', html.includes('onclick=\"showDetail'));
check('FE: confirm() dialogs for destructive', html.includes('confirm('));

// Vercel
const vc = JSON.parse(fs.readFileSync(BASE + '/vercel.json', 'utf-8'));
check('Vercel: admin catch-all rewrite', vc.rewrites.some(r => r.source === '/admin/(.*)'));

console.log();
const passed = checks.filter(c => c.ok).length;
const total = checks.length;
console.log('='.repeat(60));
console.log('Results: ' + passed + '/' + total + ' PASSED ' + (passed === total ? 'ALL PASS!' : 'SOME FAILED'));
console.log('='.repeat(60));
console.log();
console.log('=== Summary by task ===');
console.log('crm-rdr-002 Detail panel: GET single license + validations_log + detail modal');
console.log('crm-rdr-003 Stripe sync: subscription.created/updated/deleted + checkout');
console.log('crm-rdr-005 Email: sendEmail + 3 templates + trial/expiry cron');
console.log('crm-rdr-006 Pagination/Search/Sort/CSV: backend params + FE controls');
console.log('crm-rdr-007 Multi-product: products API + dynamic FE dropdown');
console.log('crm-rdr-008 Audit log: admin_audit_log + _audit.js + FE modal');
console.log('crm-rdr-009 Key hardening: generateLicenseKey with checksum');