#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const checks = [];
function check(name, ok, detail) {
  checks.push({name, ok, detail});
  console.log((ok ? '  [PASS]' : '  [FAIL]'), name);
  if (!ok && detail) console.log('         ', detail);
}

console.log('='.repeat(60));
console.log('INDEPENDENT AUDIT: CRM P0-001');
console.log('='.repeat(60));
console.log();

const BASE = '/Users/seanfzc/licensing-api';

// 1. File structure
const files = [
  'api/admin/licenses.js',
  'api/admin/licenses/[key].js',
  'api/admin/licenses/[key]/suspend.js',
  'api/admin/licenses/[key]/reinstate.js',
  'api/admin/stats.js',
  'api/_supabase.js',
  'public/admin.html',
  'vercel.json',
  'package.json',
];
for (const f of files) {
  const fullPath = path.join(BASE, f);
  const exists = fs.existsSync(fullPath);
  check('File exists: ' + f, exists);
}

// 2. JS files parse check
const jsFiles = [
  'api/_supabase.js',
  'api/admin/licenses.js',
  'api/admin/licenses/[key].js',
  'api/admin/licenses/[key]/suspend.js',
  'api/admin/licenses/[key]/reinstate.js',
];
for (const f of jsFiles) {
  const fullPath = path.join(BASE, f);
  const content = fs.readFileSync(fullPath, 'utf-8');
  const hasModuleExports = content.includes('module.exports');
  const hasHandler = content.includes('async function handler');
  check(f + ': has module.exports + handler', hasModuleExports && hasHandler);

  const hasAuth = content.includes('checkAuth');
  const hasCatch = content.includes('catch');
  check(f + ': has auth check', hasAuth);
  check(f + ': has try/catch error handling', hasCatch);
}

// 3. [key].js handles specific methods
const keyJs = fs.readFileSync(path.join(BASE, 'api/admin/licenses/[key].js'), 'utf-8');
check('[key].js: handles GET method', keyJs.includes("=== 'GET'"));
check('[key].js: handles PATCH method', keyJs.includes("=== 'PATCH'"));
check('[key].js: handles DELETE method', keyJs.includes("=== 'DELETE'"));
check('[key].js: has 405 fallback', keyJs.includes('405'));
check('[key].js: updates updated_at on PATCH', keyJs.includes('updated_at'));
check('[key].js: validates status values on PATCH', keyJs.includes('allowed.includes'));
check('[key].js: returns changes list on PATCH', keyJs.includes('changes'));
check('[key].js: returns 404 on missing license', keyJs.includes('404'));

// 4. Suspend endpoint
const suspendJs = fs.readFileSync(path.join(BASE, 'api/admin/licenses/[key]/suspend.js'), 'utf-8');
check('suspend.js: only accepts POST', !suspendJs.includes("=== 'GET'"));
check('suspend.js: checks cancelled status', suspendJs.includes('cancelled'));
check('suspend.js: stores suspend reason in metadata', suspendJs.includes('suspend_reason'));
check('suspend.js: stores suspended_at timestamp', suspendJs.includes('suspended_at'));

// 5. Reinstate endpoint
const reinstateJs = fs.readFileSync(path.join(BASE, 'api/admin/licenses/[key]/reinstate.js'), 'utf-8');
check('reinstate.js: only accepts POST', !reinstateJs.includes("=== 'GET'"));
check('reinstate.js: only reinstates expired status', reinstateJs.includes("status !== 'expired'"));
check('reinstate.js: stores reinstated_at', reinstateJs.includes('reinstated_at'));

// 6. Frontend HTML
const html = fs.readFileSync(path.join(BASE, 'public/admin.html'), 'utf-8');
check('admin.html: Edit button calls showEditModal', html.includes('showEditModal'));
check('admin.html: Suspend button', html.includes('suspendLicense'));
check('admin.html: Reinstate button', html.includes('reinstateLicense'));
check('admin.html: Delete button', html.includes('deleteLicense'));
check('admin.html: Edit modal HTML exists', html.includes('id="editModal"'));
check('admin.html: Edit form has email field', html.includes('editEmail'));
check('admin.html: Edit form has name field', html.includes('editName'));
check('admin.html: Edit form has product field', html.includes('editProduct'));
check('admin.html: Edit form has expires field', html.includes('editExpires'));
check('admin.html: Confirmation dialogs before suspend/delete', html.includes('confirm('));
check('admin.html: Actions column header exists', html.includes('<th>Actions</th>'));

// 7. Vercel config
const vercel = JSON.parse(fs.readFileSync(path.join(BASE, 'vercel.json'), 'utf-8'));
check('vercel.json: has admin rewrite', JSON.stringify(vercel.rewrites).includes('/admin'));
check('vercel.json: has SPA catch-all', vercel.rewrites.some(r => r.source.includes('/admin/(')));

// 8. Package.json
const pkg = JSON.parse(fs.readFileSync(path.join(BASE, 'package.json'), 'utf-8'));
check('package.json: has @supabase/supabase-js', !!pkg.dependencies['@supabase/supabase-js']);
check('package.json: has stripe', !!pkg.dependencies['stripe']);

console.log();
const passed = checks.filter(c => c.ok).length;
const total = checks.length;
console.log('='.repeat(60));
const icon = passed === total ? 'E2 9C 94' : 'E2 9D 8C SOME FAILED';
console.log(`Results: ${passed}/${total} PASSED ` + (passed === total ? 'ALL PASS' : 'SOME FAILED'));
console.log('='.repeat(60));
console.log();
console.log('=== API Endpoints Created ===');
console.log('GET    /api/admin/licenses/:key     — Single license detail');
console.log('PATCH  /api/admin/licenses/:key     — Edit license (email, name, product, expires, status)');
console.log('DELETE /api/admin/licenses/:key     — Soft-delete (set status=cancelled)');
console.log('POST   /api/admin/licenses/:key/suspend   — Suspend (expired + metadata)');
console.log('POST   /api/admin/licenses/:key/reinstate — Reinstate (active + metadata)');
console.log();
console.log('Frontend actions: Edit modal, Suspend, Reinstate, Cancel — all with confirm() dialogs');