const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");

const moduleContext = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync(`${__dirname}/app/text-input.ts`, "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText,
  { exports: moduleContext.exports, Set },
);

const { shouldUppercaseApplicationInput } = moduleContext.exports;
assert.equal(shouldUppercaseApplicationInput("input", "text"), true);
assert.equal(shouldUppercaseApplicationInput("textarea"), true);
assert.equal(shouldUppercaseApplicationInput("input", "email"), false);
assert.equal(shouldUppercaseApplicationInput("input", "password"), false);
assert.equal(shouldUppercaseApplicationInput("input", "file"), false);
assert.equal(shouldUppercaseApplicationInput("input", "number"), false);
assert.equal(shouldUppercaseApplicationInput("input", "text", true), false);

console.log("PASS: application text is uppercased without changing sensitive input types");
