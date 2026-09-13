const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");

const moduleContext = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync(`${__dirname}/app/job-form-draft.ts`, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText,
  { exports: moduleContext.exports, Date, JSON, Set }
);

const { clearJobFormDraft, jobDraftStorageKey, parseJobFormDraft, readJobFormDraft, saveJobFormDraft } = moduleContext.exports;
const values = new Map();
const storage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: key => values.delete(key)
};

assert.equal(jobDraftStorageKey("user-1"), "transwave:new-job-draft:user-1");
assert.equal(parseJobFormDraft(null), null);
assert.equal(parseJobFormDraft("not-json"), null);
assert.equal(parseJobFormDraft(JSON.stringify({ version: 1, savedAt: "now", values: { vessel: 5 }, serviceIds: [] })), null);

const saved = saveJobFormDraft("user-1", { vessel: "OSHAIRIJ", pol: "port-1" }, ["ocean", "ocean"], storage);
assert.equal(saved.version, 1);
assert.deepEqual(readJobFormDraft("user-1", storage).values, { vessel: "OSHAIRIJ", pol: "port-1" });
assert.deepEqual(Array.from(readJobFormDraft("user-1", storage).serviceIds), ["ocean"]);

clearJobFormDraft("user-1", storage);
assert.equal(readJobFormDraft("user-1", storage), null);
console.log("PASS: new-job draft save, validation, restore, user isolation and clear");
