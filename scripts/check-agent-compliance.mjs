import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const supportedSource = /\.(?:css|js|jsx|mjs|ts|tsx)$/;
const ignoredDirectories = new Set(["node_modules", "dist", ".git", "testsprite_tests"]);

export function sha256(value) {
  // Git checks text out as CRLF on Windows and LF on Linux runners.
  return createHash("sha256").update(String(value).replaceAll("\r\n", "\n")).digest("hex");
}

export function inspectCssFonts(source, relativePath) {
  const failures = [];
  for (const line of source.split(/\r?\n/)) {
    if (/@font-face\b/.test(line)) continue;
    for (const match of line.matchAll(/font-family\s*:\s*([^;}]+)/gi)) {
      if (!/var\(--font-ui\)|inherit/i.test(match[1])) {
        failures.push(`${relativePath}: استخدم var(--font-ui) بدل "${match[1].trim()}"`);
      }
    }
  }
  return failures;
}

function hasEmptyCatchBlock(source) {
  let cursor = 0;
  const skipWhitespace = () => {
    while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
  };
  while (cursor < source.length) {
    const start = source.indexOf("catch", cursor);
    if (start === -1) return false;
    cursor = start + 5;
    skipWhitespace();
    if (source[cursor] === "(") {
      const close = source.indexOf(")", cursor + 1);
      if (close === -1) return false;
      cursor = close + 1;
      skipWhitespace();
    }
    if (source[cursor] !== "{") continue;
    cursor += 1;
    skipWhitespace();
    if (source[cursor] === "}") return true;
  }
  return false;
}

export function inspectSource(source, relativePath) {
  const failures = [];
  const isRuntimeSource = relativePath.startsWith("src/") || relativePath.startsWith("server/");
  if (/\bsk-(?:user--)?[A-Za-z0-9_-]{24,}\b/.test(source)) {
    failures.push(`${relativePath}: يحتوي مفتاح API ظاهرًا`);
  }
  if (relativePath.startsWith("src/") && /\bwindow\.(?:alert|confirm|prompt)\s*\(/.test(source)) {
    failures.push(`${relativePath}: استخدم مكوّن Dialog المشترك بدل حوارات المتصفح الأصلية`);
  }
  if (isRuntimeSource && hasEmptyCatchBlock(source)) {
    failures.push(`${relativePath}: empty catch blocks are not allowed`);
  }
  if (isRuntimeSource && /\bconsole\.(?:log|debug)\s*\(/.test(source)) {
    failures.push(`${relativePath}: production debug logs are not allowed`);
  }
  return failures;
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    if (ignoredDirectories.has(entry.name)) return [];
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return supportedSource.test(entry.name) ? [target] : [];
  }));
  return nested.flat();
}

export async function collectComplianceFailures(root = projectRoot) {
  const failures = [];
  const [agents, policySource, packageSource, html, styles] = await Promise.all([
    readFile(path.join(root, "AGENTS.md"), "utf8"),
    readFile(path.join(root, "config", "agent-compliance.json"), "utf8"),
    readFile(path.join(root, "package.json"), "utf8"),
    readFile(path.join(root, "index.html"), "utf8"),
    readFile(path.join(root, "src", "index.css"), "utf8"),
  ]);
  const policy = JSON.parse(policySource);
  const packageJson = JSON.parse(packageSource);

  if (sha256(agents) !== policy.agentsSha256) {
    failures.push("تغيّر AGENTS.md: راجع التعليمات ثم حدّث agentsSha256 في config/agent-compliance.json");
  }
  for (const section of policy.requiredSections) {
    if (!agents.includes(section)) failures.push(`AGENTS.md يفتقد القسم الإلزامي: ${section}`);
  }
  for (const rule of policy.requiredRules) {
    if (!agents.includes(rule)) failures.push(`AGENTS.md يفتقد القاعدة الإلزامية: ${rule}`);
  }

  if (packageJson.scripts?.compliance !== "node scripts/check-agent-compliance.mjs") {
    failures.push("package.json يفتقد أمر compliance المعتمد");
  }
  if (!packageJson.scripts?.["verify:quick"]?.startsWith("npm run compliance &&")) {
    failures.push("verify:quick يجب أن يبدأ بفاحص الامتثال");
  }
  if (!packageJson.scripts?.verify?.includes("verify:quick")
    || !packageJson.scripts.verify.includes("audit")
    || !packageJson.scripts.verify.includes("build:nukhab")) {
    failures.push("verify يجب أن يشغّل الفحص السريع والتدقيق والبناء");
  }
  if (!/<html[^>]*\blang="ar"[^>]*\bdir="rtl"/s.test(html)) {
    failures.push("index.html يجب أن يثبت lang=\"ar\" وdir=\"rtl\"");
  }
  if (!/<meta[^>]*name="viewport"[^>]*width=device-width/s.test(html)) {
    failures.push("index.html يفتقد viewport المتجاوب");
  }
  if (!/--font-ui\s*:/.test(styles) || !/font-family:\s*var\(--font-ui\)/.test(styles)) {
    failures.push("src/index.css يجب أن يعرّف ويطبّق var(--font-ui)");
  }

  await inspectProjectSources(policy, root, failures);
  return failures;
}

async function inspectProjectSources(policy, root, failures) {
  for (const sourceRoot of policy.sourceRoots) {
    const files = await sourceFiles(path.join(root, sourceRoot));
    for (const file of files) {
      const relativePath = path.relative(root, file).replaceAll("\\", "/");
      const source = await readFile(file, "utf8");
      failures.push(...inspectSource(source, relativePath));
      if (file.endsWith(".css")) failures.push(...inspectCssFonts(source, relativePath));
    }
  }
}

async function main() {
  const failures = await collectComplianceFailures();
  if (failures.length) {
    console.error("فشل فاحص AGENTS:");
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exitCode = 1;
    return;
  }
  console.log("فاحص AGENTS: اجتاز");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
