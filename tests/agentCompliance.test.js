import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  collectComplianceFailures,
  inspectCssFonts,
  inspectSource,
  sha256,
} from "../scripts/check-agent-compliance.mjs";

test('instruction hashes are platform independent but reject changed content', () => {
  assert.equal(sha256('rule\r\nnext\r\n'), sha256('rule\nnext\n'));
  assert.notEqual(sha256('rule\nnext\n'), sha256('changed\nnext\n'));
});

test("يرتبط فاحص AGENTS ببوابة نخب ويجتاز المشروع", async () => {
  const packageJson = JSON.parse(await readFile(path.resolve("package.json"), "utf8"));
  assert.equal(packageJson.scripts.compliance, "node scripts/check-agent-compliance.mjs");
  assert.match(packageJson.scripts["verify:quick"], /^npm run compliance &&/);
  assert.deepEqual(await collectComplianceFailures(), []);
});

test("يرفض الفاحص الخطوط الخارجية والحوارات الأصلية والمفاتيح الظاهرة", () => {
  assert.equal(inspectCssFonts(".page{font-family:Arial}", "src/page.css").length, 1);
  assert.equal(inspectCssFonts(".page{font-family:var(--font-ui)}", "src/page.css").length, 0);
  assert.equal(inspectSource("window" + ".alert('x')", "src/page.jsx").length, 1);
  assert.equal(inspectSource("const token = '" + "sk-" + "user--abcdefghijklmnopqrstuvwxyz1234567890'", "server/api.js").length, 1);
  assert.equal(inspectSource("try { run(); } catch {}", "server/api.js").length, 1);
  assert.equal(inspectSource("console." + "log('debug')", "src/page.jsx").length, 1);
  assert.equal(inspectSource("console.warn('operational warning')", "server/api.js").length, 0);
});
