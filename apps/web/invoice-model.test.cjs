const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const moduleContext = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(`${__dirname}/app/invoice-model.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports: moduleContext.exports });
const { billingReducer: reduce } = moduleContext.exports;
const line = { id: 'one', name: 'Land Transport', qty: 1, uom: 'JOB', currency: 'AED', rate: 100, vat: 5, container: 'legacy' };
const initial = { chargesByJob: { a: [line], b: [{ ...line }] }, invoices: [], nextSequence: 145 };
const changed = reduce(initial, { type: 'updateCharge', jobId: 'a', charge: { ...line, rate: 250, qty: 2 } });
assert.equal(changed.chargesByJob.a.length, 1);
assert.equal(changed.chargesByJob.a[0].id, 'one');
assert.equal(changed.chargesByJob.a[0].rate, 250);
assert.equal(changed.chargesByJob.a[0].qty, 2);
assert.equal(changed.chargesByJob.b[0].rate, 100);
assert.equal(initial.chargesByJob.a[0].rate, 100);
assert.equal(reduce(initial, { type: 'addCharge', jobId: 'a', charge: { ...line, id: 'two', name: '  LAND   Transport  ' } }), initial);
assert.equal(reduce(initial, { type: 'updateCharge', jobId: 'missing', charge: line }), initial);
assert.equal(reduce(initial, { type: 'updateCharge', jobId: 'a', charge: { ...line, id: 'missing' } }), initial);
assert.equal(reduce(initial, { type: 'updateCharge', jobId: 'a', charge: { ...line, rate: -1 } }), initial);
const legacy = { ...initial, chargesByJob: { a: [line, { ...line, id: 'legacy-two' }] } };
const legacyUpdated = reduce(legacy, { type: 'updateCharge', jobId: 'a', charge: { ...line, id: 'legacy-two', rate: 400 } });
assert.equal(legacyUpdated.chargesByJob.a.length, 2);
assert.equal(legacyUpdated.chargesByJob.a[0].rate, 100);
assert.equal(legacyUpdated.chargesByJob.a[1].rate, 400);
const job = {
  id: 'a',
  services: ['Land Transport'],
  containers: [],
  pol: 'Shanghai (CNSHA)',
  transshipmentPort: 'Singapore (SGSIN)',
  pod: 'Jebel Ali (AEJEA)',
};
const drafted = reduce(initial, { type: 'createDraft', job, chargeIds: ['one'], customerTrn: '', paymentTerms: '', createdAt: '2026-09-11' });
assert.equal(drafted.invoices[0].job.transshipmentPort, 'Singapore (SGSIN)');
assert.equal(reduce(drafted, { type: 'updateCharge', jobId: 'a', charge: { ...line, rate: 500 } }), drafted);
assert.equal(drafted.invoices[0].lines[0].rate, 100);
assert.equal(reduce(drafted, { type: 'addCharge', jobId: 'a', charge: { ...line, id: 'three' } }), drafted);
console.log('PASS: charge updates, normalized duplicates, job isolation, legacy duplicate IDs, allocated charge protection');
assert.equal(drafted.invoices[0].status, 'DRAFT');
assert.equal(drafted.invoices[0].issuedAt, null);
const issue = { type: 'issueInvoice', invoiceId: drafted.invoices[0].id, issuedAt: '2026-09-11T12:00:00.000Z' };
const issued = reduce(drafted, issue);
assert.equal(issued.invoices[0].status, 'ISSUED');
assert.equal(issued.invoices[0].issuedAt, issue.issuedAt);
assert.equal(drafted.invoices[0].status, 'DRAFT');
assert.equal(issued.invoices[0].job, drafted.invoices[0].job);
assert.equal(issued.invoices[0].lines, drafted.invoices[0].lines);
assert.equal(issued.chargesByJob, drafted.chargesByJob);
assert.equal(issued.nextSequence, drafted.nextSequence);
assert.equal(reduce(issued, { ...issue, issuedAt: '2026-09-12T12:00:00.000Z' }), issued);
assert.equal(reduce(drafted, { ...issue, invoiceId: 'missing' }), drafted);
assert.equal(reduce(drafted, { ...issue, issuedAt: 'invalid' }), drafted);
assert.equal(reduce(issued, { type: 'updateCharge', jobId: 'a', charge: { ...line, rate: 500 } }), issued);
console.log('PASS: issue transition, idempotency, unknown invoice, snapshot preservation, issued charge lock');
