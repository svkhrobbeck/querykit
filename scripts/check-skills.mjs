/**
 * Checks the agent skills shipped inside the packages (`packages/<pkg>/skills/querykit-<pkg>/SKILL.md`).
 *
 *   bun run test:skills
 *
 * 1. Shape: frontmatter with only `name` (= folder name) and `description` (1–600 chars);
 *    the first `##` heading is `## Safety rules`; `packages/<pkg>/skills/` holds only `querykit-<pkg>`.
 * 2. Examples: every ```ts / ```tsx block is written to `.cache/skill-examples/` and typechecked by
 *    `tsc --noEmit` against the package sources (`paths` → `packages/<pkg>/src`), so an example cannot
 *    drift from the version it ships with. A block may import fixture types from
 *    `@querykitjs/<pkg>/skill-prelude` when `packages/<pkg>/test/skill-prelude.ts` exists (never published).
 *    `packages/<pkg>/skills/tsconfig.skill.json` adds that package's `compilerOptions` (decorators, DOM,
 *    JSX) in a program of its own; all other packages share one program. Other fences are not checked.
 *
 * Errors name the SKILL.md file and line; any error ⇒ exit code 1.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, writeSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGES_DIR = join(ROOT, "packages");
const OUT_DIR = join(ROOT, ".cache", "skill-examples");
const TSC = join(ROOT, "node_modules", "typescript", "bin", "tsc");

const SKILL_PREFIX = "querykit-";
const FRONTMATTER_KEYS = ["name", "description"];
const MAX_DESCRIPTION = 600;
const FIRST_SECTION = "## Safety rules";
const CHECKED_FENCES = new Set(["ts", "tsx"]);
/** Optional per-package compilerOptions for the examples (decorators, DOM, JSX); never published. */
const SKILL_TSCONFIG = "tsconfig.skill.json";
/** Sub-path entry points published next to a package's main entry. */
const EXTRA_ENTRIES = { "@querykitjs/web/react": "packages/web/src/react/index.ts" };

const errors = [];
const toPosix = p => p.split("\\").join("/");
const rel = p => toPosix(relative(ROOT, p));
const fail = (file, line, message) => errors.push(`${rel(file)}:${line} — ${message}`);
// `process.exit` right after a write can lose output on Windows pipes; write synchronously.
const print = text => writeSync(1, `${text}\n`);

function listDirs(dir) {
  return existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name)
    : [];
}

function unquote(value) {
  const v = value.trim();
  return /^(["']).*\1$/.test(v) ? v.slice(1, -1) : v;
}

/** Frontmatter as `{ key: { value, line } }`, or null when the file does not start with `---`. */
function readFrontmatter(lines) {
  if (lines[0]?.trim() !== "---") return null;
  const fields = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "---") return { fields, endLine: i + 1 };
    const match = /^([\w-]+):\s*(.*)$/.exec(line);
    if (match) fields[match[1]] = { value: unquote(match[2]), line: i + 1 };
  }
  return null;
}

function checkFrontmatter(file, lines, folder) {
  const fm = readFrontmatter(lines);
  if (!fm) {
    fail(file, 1, "missing frontmatter (the file must start with a `---` block)");
    return 1;
  }
  for (const [key, { line }] of Object.entries(fm.fields)) {
    if (!FRONTMATTER_KEYS.includes(key)) fail(file, line, `frontmatter key "${key}" is not allowed (only ${FRONTMATTER_KEYS.join(", ")})`);
  }
  const { name, description } = fm.fields;
  if (!name) fail(file, 1, "frontmatter has no `name`");
  else if (name.value !== folder) fail(file, name.line, `name "${name.value}" must equal the folder name "${folder}"`);
  if (!description) fail(file, 1, "frontmatter has no `description`");
  else if (/^[>|][+-]?$/.test(description.value))
    fail(file, description.line, "description must be a single-line value (block scalars `>` / `|` are not checked)");
  else {
    const length = [...description.value].length;
    if (length < 1 || length > MAX_DESCRIPTION) fail(file, description.line, `description is ${length} chars (allowed 1–${MAX_DESCRIPTION})`);
  }
  return fm.endLine;
}

/** Walks the body once: the first `##` heading and the code blocks to typecheck. */
function scanBody(lines, startIndex) {
  let firstSection = null;
  const blocks = [];
  let open = null;
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    const fence = /^\s*```\s*([\w-]*)/.exec(line);
    if (fence && !open) {
      open = { lang: fence[1].toLowerCase(), startLine: i + 1, body: [] };
      continue;
    }
    if (fence && open) {
      if (CHECKED_FENCES.has(open.lang)) blocks.push(open);
      open = null;
      continue;
    }
    if (open) open.body.push(line);
    else if (!firstSection && /^##\s/.test(line)) firstSection = { text: line.trim(), line: i + 1 };
  }
  return { firstSection, blocks };
}

function checkSkill(pkg, folder) {
  const file = join(PACKAGES_DIR, pkg, "skills", folder, "SKILL.md");
  if (!existsSync(file)) {
    fail(join(PACKAGES_DIR, pkg, "skills", folder), 0, "folder has no SKILL.md");
    return [];
  }
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  const bodyStart = checkFrontmatter(file, lines, folder);
  const { firstSection, blocks } = scanBody(lines, bodyStart);
  if (!firstSection) fail(file, bodyStart, `no \`##\` section (the first one must be \`${FIRST_SECTION}\`)`);
  else if (firstSection.text !== FIRST_SECTION) fail(file, firstSection.line, `first section is "${firstSection.text}", must be "${FIRST_SECTION}"`);
  return blocks.map((block, index) => ({ ...block, pkg, file, index: index + 1 }));
}

function collectSkills() {
  const skills = [];
  for (const pkg of listDirs(PACKAGES_DIR)) {
    const skillsDir = join(PACKAGES_DIR, pkg, "skills");
    for (const folder of listDirs(skillsDir)) {
      if (folder !== `${SKILL_PREFIX}${pkg}`) {
        fail(join(skillsDir, folder), 0, `only "${SKILL_PREFIX}${pkg}" is allowed in ${rel(skillsDir)}/`);
        continue;
      }
      skills.push({ name: folder, blocks: checkSkill(pkg, folder) });
    }
  }
  return skills;
}

function buildPaths() {
  const paths = {};
  for (const pkg of listDirs(PACKAGES_DIR)) {
    const entry = join(PACKAGES_DIR, pkg, "src", "index.ts");
    if (existsSync(entry)) paths[`@querykitjs/${pkg}`] = [toPosix(entry)];
    // Subpath entries (R17): `@querykitjs/core/internal` and the like resolve to src as well.
    const internal = join(PACKAGES_DIR, pkg, "src", "internal", "index.ts");
    if (existsSync(internal)) paths[`@querykitjs/${pkg}/internal`] = [toPosix(internal)];
    const testing = join(PACKAGES_DIR, pkg, "src", "testing.ts");
    if (existsSync(testing)) paths[`@querykitjs/${pkg}/testing`] = [toPosix(testing)];
    const prelude = join(PACKAGES_DIR, pkg, "test", "skill-prelude.ts");
    if (existsSync(prelude)) paths[`@querykitjs/${pkg}/skill-prelude`] = [toPosix(prelude)];
    // A skill imports its package's peers (`mongodb`, `zod`); bun links them per package, not at the root.
    const manifest = JSON.parse(readFileSync(join(PACKAGES_DIR, pkg, "package.json"), "utf8"));
    for (const peer of Object.keys(manifest.peerDependencies ?? {})) {
      const linked = join(PACKAGES_DIR, pkg, "node_modules", peer);
      if (!paths[peer] && existsSync(linked)) {
        paths[peer] = [toPosix(linked)];
        paths[`${peer}/*`] = [`${toPosix(linked)}/*`]; // subpath entries such as `drizzle-orm/pg-core`
      }
    }
  }
  for (const [specifier, entry] of Object.entries(EXTRA_ENTRIES)) paths[specifier] = [toPosix(join(ROOT, entry))];
  return paths;
}

/** A package's own compilerOptions for its examples (`skills/tsconfig.skill.json`), or `undefined`. */
function skillCompilerOptions(pkg) {
  const file = join(PACKAGES_DIR, pkg, "skills", SKILL_TSCONFIG);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")).compilerOptions ?? {}) : undefined;
}

/**
 * One tsc program per option set, so options never leak between packages: every package
 * without a `tsconfig.skill.json` shares one program; each package with one gets its own.
 */
function groupPrograms(blocks) {
  const programs = new Map();
  for (const block of blocks) {
    const options = skillCompilerOptions(block.pkg);
    const name = options ? block.pkg : "shared";
    if (!programs.has(name)) programs.set(name, { name, options: options ?? {}, blocks: [] });
    programs.get(name).blocks.push(block);
  }
  return [...programs.values()];
}

/** Writes one program's blocks and its tsconfig; returns the tsconfig path and a map from file name to block. */
function writeExamples(program, paths) {
  const byFile = new Map();
  for (const block of program.blocks) {
    const name = `${block.pkg}-block-${block.index}.${block.lang}`;
    writeFileSync(join(OUT_DIR, name), `${block.body.join("\n")}\n`);
    byFile.set(name, block);
  }
  const tsconfig = {
    extends: toPosix(relative(OUT_DIR, join(ROOT, "tsconfig.base.json"))),
    compilerOptions: { noEmit: true, noUnusedLocals: false, paths, ...program.options },
    files: [...byFile.keys()],
  };
  const tsconfigPath = join(OUT_DIR, `tsconfig.${program.name}.json`);
  writeFileSync(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`);
  return { tsconfigPath, byFile };
}

/** Maps `file(line,col): error TS…` to the SKILL.md line it came from; other errors are kept verbatim. */
function reportTscOutput(output, byFile) {
  let reported = 0;
  for (const line of output.split(/\r?\n/)) {
    const match = /^(.+?)\((\d+),(\d+)\): (error .*)$/.exec(line.trim());
    if (!match) continue;
    const block = byFile.get(toPosix(match[1]).split("/").pop());
    if (block) fail(block.file, block.startLine + Number(match[2]), `ts block ${block.index}: ${match[4]}`);
    else errors.push(`${toPosix(match[1])}:${match[2]} — ${match[4]}`);
    reported++;
  }
  return reported;
}

function typecheck(blocks) {
  if (blocks.length === 0) return;
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  const paths = buildPaths();
  try {
    for (const program of groupPrograms(blocks)) {
      const { tsconfigPath, byFile } = writeExamples(program, paths);
      const result = spawnSync(process.execPath, [TSC, "--noEmit", "--pretty", "false", "-p", tsconfigPath], { encoding: "utf8" });
      if (result.status === 0) continue;
      const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
      if (reportTscOutput(output, byFile) === 0) errors.push(`tsc failed (exit ${result.status}): ${output.trim() || result.error?.message}`);
    }
  } finally {
    // Generated files would otherwise be picked up by `eslint .`.
    rmSync(OUT_DIR, { recursive: true, force: true });
  }
}

const skills = collectSkills();
const blocks = skills.flatMap(skill => skill.blocks);
typecheck(blocks);

for (const skill of skills) print(`${skill.name} — ${skill.blocks.length} ts block(s)`);
print(`${skills.length} skill(s), ${blocks.length} ts block(s) checked`);
if (errors.length > 0) {
  for (const error of errors) print(`✖ ${error}`);
  process.exitCode = 1;
}
