const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(`${__dirname}/app/print-invoice.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: exportsObject });
function fixture() {
  const listeners = new Map(); let fallback; let calls = 0; let cleared = 0;
  const env = { document: { title: 'TransWave' }, print: () => { calls++; assert.equal(env.document.title, 'INV-2026-000145'); }, addEventListener: (event, listener) => listeners.set(event, listener), removeEventListener: event => listeners.delete(event), setTimeout: callback => { fallback = callback; return 1; }, clearTimeout: () => { cleared++; } };
  return { env, listeners, fallback: () => fallback(), calls: () => calls, cleared: () => cleared };
}
const first = fixture();
const cleanup = exportsObject.printInvoice('INV/2026/000145', first.env);
assert.equal(first.calls(), 1);
first.listeners.get('afterprint')();
assert.equal(first.env.document.title, 'TransWave');
assert.equal(first.listeners.size, 0);
cleanup(); assert.equal(first.cleared(), 1);
const second = fixture(); exportsObject.printInvoice('INV/2026/000145', second.env); second.fallback();
assert.equal(second.env.document.title, 'TransWave'); assert.equal(second.listeners.size, 0);
const failure = fixture(); failure.env.print = () => { throw new Error('print failed'); };
assert.throws(() => exportsObject.printInvoice('INV/2026/000145', failure.env));
assert.equal(failure.env.document.title, 'TransWave'); assert.equal(failure.listeners.size, 0);
console.log('PASS: print called once, sanitized title, afterprint/fallback/error cleanup and idempotent restore');
