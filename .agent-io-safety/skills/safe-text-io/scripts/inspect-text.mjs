#!/usr/bin/env node
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const TEXT_EXTENSIONS = new Set([
  ".bash", ".bat", ".cjs", ".cmd", ".conf", ".css", ".csv", ".env", ".gitattributes",
  ".gitignore", ".htm", ".html", ".ini", ".java", ".js", ".json", ".jsx", ".md", ".mjs",
  ".ps1", ".psd1", ".psm1", ".py", ".rb", ".rs", ".scss", ".sh", ".sql", ".toml", ".ts",
  ".tsv", ".tsx", ".txt", ".xml", ".yaml", ".yml", ".zsh",
]);
const DEFAULT_EXCLUDES = new Set([".git", "node_modules"]);
const PS_EXTENSIONS = new Set([".ps1", ".psd1", ".psm1"]);

function usage() {
  process.stderr.write(
    "usage: node inspect-text.mjs [--json] [--all-files] [--fail-on-bom] " +
      "[--ps51-safe] [--eol lf|crlf] [--exclude name] <path>...\n",
  );
}

function parseArgs(argv) {
  const options = {
    help: false,
    json: false,
    allFiles: false,
    failOnBom: false,
    ps51Safe: false,
    eol: undefined,
    excludes: new Set(DEFAULT_EXCLUDES),
    paths: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--help" || value === "-h") options.help = true;
    else if (value === "--json") options.json = true;
    else if (value === "--all-files") options.allFiles = true;
    else if (value === "--fail-on-bom") options.failOnBom = true;
    else if (value === "--ps51-safe") options.ps51Safe = true;
    else if (value === "--eol") {
      options.eol = argv[++index];
      if (!new Set(["lf", "crlf"]).has(options.eol)) throw new Error("--eol must be lf or crlf");
    } else if (value === "--exclude") {
      const name = argv[++index];
      if (!name) throw new Error("--exclude requires a directory name");
      options.excludes.add(name);
    } else if (value.startsWith("--")) throw new Error(`unknown option: ${value}`);
    else options.paths.push(value);
  }
  if (!options.help && options.paths.length === 0) throw new Error("at least one path is required");
  return options;
}

function detectBom(bytes) {
  if (bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x00, 0x00, 0xfe, 0xff]))) return "utf32be";
  if (bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0xff, 0xfe, 0x00, 0x00]))) return "utf32le";
  if (bytes.length >= 3 && bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) return "utf8";
  if (bytes.length >= 2 && bytes.subarray(0, 2).equals(Buffer.from([0xff, 0xfe]))) return "utf16le";
  if (bytes.length >= 2 && bytes.subarray(0, 2).equals(Buffer.from([0xfe, 0xff]))) return "utf16be";
  return "none";
}

function lineEndings(text) {
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const remainder = text.replace(/\r\n/g, "");
  const lf = (remainder.match(/\n/g) ?? []).length;
  const cr = (remainder.match(/\r/g) ?? []).length;
  const kinds = [["crlf", crlf], ["lf", lf], ["cr", cr]].filter(([, count]) => count > 0);
  return { crlf, lf, cr, style: kinds.length === 0 ? "none" : kinds.length === 1 ? kinds[0][0] : "mixed" };
}

function looksLikeUtf16WithoutBom(bytes) {
  if (bytes.length < 4 || bytes.length % 2 !== 0) return undefined;
  const pairs = bytes.length / 2;
  let evenNulls = 0;
  let oddNulls = 0;
  for (let index = 0; index < bytes.length; index += 2) {
    if (bytes[index] === 0) evenNulls += 1;
    if (bytes[index + 1] === 0) oddNulls += 1;
  }
  const strong = Math.max(2, Math.floor(pairs * 0.2));
  const weak = Math.max(1, Math.floor(pairs * 0.05));
  if (oddNulls >= strong && evenNulls <= weak) return "utf16le";
  if (evenNulls >= strong && oddNulls <= weak) return "utf16be";
  return undefined;
}

function suspiciousControlCount(text) {
  let count = 0;
  for (const character of text) {
    const codePoint = character.codePointAt(0);
    if (codePoint < 0x20 && codePoint !== 0x09 && codePoint !== 0x0a && codePoint !== 0x0d) count += 1;
  }
  return count;
}

function hasKnownTextName(filePath) {
  const name = path.basename(filePath).toLowerCase();
  if (name === "dockerfile" || name === "makefile" || name === "license" || name === "readme") return true;
  return TEXT_EXTENSIONS.has(name) || TEXT_EXTENSIONS.has(path.extname(name));
}

function analyze(bytes, filePath, options) {
  const bom = detectBom(bytes);
  const errors = [];
  const warnings = [];

  if (new Set(["utf16le", "utf16be", "utf32le", "utf32be"]).has(bom)) {
    errors.push(`non-UTF-8 BOM: ${bom}`);
    return { path: filePath, status: "error", bom, encoding: bom, errors, warnings };
  }

  const content = bom === "utf8" ? bytes.subarray(3) : bytes;
  if (content.includes(0)) {
    const utf16Guess = looksLikeUtf16WithoutBom(content);
    if (utf16Guess && hasKnownTextName(filePath)) {
      errors.push(`possible ${utf16Guess} text without BOM`);
      return { path: filePath, status: "error", bom, encoding: utf16Guess, errors, warnings };
    }
    return { path: filePath, status: "binary", bom, encoding: "binary", errors, warnings };
  }

  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch (error) {
    errors.push(`invalid UTF-8: ${error.message}`);
    return { path: filePath, status: "error", bom, encoding: "unknown", errors, warnings };
  }

  const eol = lineEndings(text);
  const nonAscii = [...text].some((character) => character.codePointAt(0) > 0x7f);
  const extension = path.extname(filePath).toLowerCase();
  const controlCount = suspiciousControlCount(text);

  if (options.failOnBom && bom !== "none") errors.push(`BOM is forbidden: ${bom}`);
  if (options.eol && eol.style !== "none" && eol.style !== options.eol) {
    errors.push(`expected ${options.eol} line endings, found ${eol.style}`);
  }
  if (options.ps51Safe && PS_EXTENSIONS.has(extension) && nonAscii && bom !== "utf8") {
    errors.push("PowerShell 5.1 file contains non-ASCII text without UTF-8 BOM");
  }
  if (hasKnownTextName(filePath) && controlCount >= 2 && controlCount / Math.max(1, text.length) > 0.15) {
    errors.push("suspicious control characters; possible UTF-16 without BOM or binary data");
  }

  return {
    path: filePath,
    status: errors.length > 0 ? "error" : "ok",
    bom,
    encoding: "utf8",
    eol,
    nonAscii,
    errors,
    warnings,
  };
}

function shouldInspect(filePath, explicit, allFiles) {
  if (explicit || allFiles) return true;
  return hasKnownTextName(filePath);
}

async function collect(inputPath, options, explicit = true) {
  const absolute = path.resolve(inputPath);
  const metadata = await stat(absolute);
  if (metadata.isFile()) return shouldInspect(absolute, explicit, options.allFiles) ? [absolute] : [];
  if (!metadata.isDirectory()) return [];

  const files = [];
  for (const entry of await readdir(absolute, { withFileTypes: true })) {
    if (entry.isDirectory() && options.excludes.has(entry.name)) continue;
    const child = path.join(absolute, entry.name);
    if (entry.isDirectory()) files.push(...(await collect(child, options, false)));
    else if (entry.isFile() && shouldInspect(child, false, options.allFiles)) files.push(child);
  }
  return files;
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    process.exitCode = 0;
    process.exit();
  }
  const files = [];
  for (const input of options.paths) files.push(...(await collect(input, options)));
  const uniqueFiles = [...new Set(files)].sort((left, right) => left.localeCompare(right));
  const results = [];
  for (const filePath of uniqueFiles) {
    const report = analyze(await readFile(filePath), filePath, options);
    report.path = path.relative(process.cwd(), filePath) || ".";
    results.push(report);
  }

  if (options.json) process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  else {
    for (const result of results) {
      const details = result.status === "error"
        ? result.errors.join("; ")
        : `encoding=${result.encoding} bom=${result.bom}` +
          (result.eol ? ` eol=${result.eol.style} nonAscii=${result.nonAscii ? "yes" : "no"}` : "");
      process.stdout.write(`${result.status.toUpperCase()} ${result.path}: ${details}\n`);
    }
  }
  process.exitCode = results.some((result) => result.status === "error") ? 1 : 0;
} catch (error) {
  usage();
  process.stderr.write(`inspect-text: ${error.message}\n`);
  process.exitCode = 2;
}
