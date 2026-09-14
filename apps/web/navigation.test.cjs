const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");

const moduleContext = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync(`${__dirname}/app/navigation.ts`, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText,
  { exports: moduleContext.exports, Object },
);

const { navigationPaths, pageFromPathname } = moduleContext.exports;

for (const [page, pathname] of Object.entries(navigationPaths)) {
  assert.equal(pageFromPathname(pathname), page);
}

assert.equal(navigationPaths.Customers, "/customers");
assert.equal(navigationPaths.Dashboard, "/dashboard");
assert.equal(navigationPaths.Jobs, "/jobs");
assert.equal(navigationPaths.Invoices, "/invoices");
assert.equal(navigationPaths.Costs, "/costs");
assert.equal(pageFromPathname("/not-a-page"), "Dashboard");
assert.equal(pageFromPathname("/"), "Dashboard");

console.log("PASS: each portal section has a stable URL mapping");
