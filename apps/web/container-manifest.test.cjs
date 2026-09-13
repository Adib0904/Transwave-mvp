const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");

const moduleContext = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync(`${__dirname}/app/container-manifest.ts`, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText,
  { exports: moduleContext.exports, Set }
);

const { parseContainerManifest } = moduleContext.exports;
const suppliedManifest = `DOLU2008497 / 20SD CRXU3126290 / 20SD DFSU2129583 / 20SD DOLU2006350 / 20SD DOLU2011377 / 20SD
CLHU3097350 / 20SD FSCU7832742 / 20SD TEMU2608799 / 20SD DFSU2027750 / 20SD VSBU2605986 / 20SD
TRHU1838569 / 20SD TGHU1070503 / 20SD GESU3836452 / 20SD HMCU3015703 / 20SD TGHU0437718 / 20SD
TGHU0542760 / 20SD CXDU1966160 / 20SD TEMU2233120 / 20SD GESU1290634 / 20SD FCIU4061241 / 20SD
CMAU1229830 / 20SD VSBU2070138 / 20SD TGHU2925537 / 20SD TGHU3459623 / 20SD TGHU3545763 / 20SD
TGHU0639940 / 20SD AMFU3271442 / 20SD TGHU0386879 / 20SD TEMU5524520 / 20SD DOLU2007612 / 20SD
TGHU0343178 / 20SD TGHU3946663 / 20SD TGHU0470505 / 20SD TEMU4477907 / 20SD VSBU2022398 / 20SD
TEMU5270489 / 20SD TCKU3839571 / 20SD TEMU3422258 / 20SD CAXU6642737 / 20SD DOLU2002400 / 20SD
TEMU4796437 / 20SD AMFU3231331 / 20SD 20\`SD`;

const parsed = Array.from(parseContainerManifest(suppliedManifest));
assert.equal(parsed.length, 42);
assert.equal(parsed[0], "DOLU2008497");
assert.equal(parsed.at(-1), "AMFU3231331");
assert.deepEqual(Array.from(parseContainerManifest("mscu1234567, MSCU1234567 / 40HC")), ["MSCU1234567"]);
assert.deepEqual(Array.from(parseContainerManifest("20SD / invalid")), []);
console.log("PASS: manifest parser accepts number/equipment pairs, whitespace, case and duplicates");
