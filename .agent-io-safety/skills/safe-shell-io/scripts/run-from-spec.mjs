#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_BYTES = 16 * 1024 * 1024;

function fail(message, code = 2) {
  process.stderr.write(`run-from-spec: ${message}\n`);
  process.exit(code);
}

function usage() {
  process.stderr.write("usage: node run-from-spec.mjs <spec.json>\n");
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertString(value, field, { allowEmpty = false } = {}) {
  if (typeof value !== "string" || (!allowEmpty && value.length === 0) || value.includes("\0")) {
    throw new Error(`${field} must be ${allowEmpty ? "a" : "a non-empty"} string without NUL`);
  }
}

function resolveFrom(base, value) {
  return path.isAbsolute(value) ? value : path.resolve(base, value);
}

function decodeOutput(buffer, encoding, field) {
  if (encoding === "raw") return buffer;
  try {
    const decoder = new TextDecoder(encoding, { fatal: true });
    return Buffer.from(decoder.decode(buffer), "utf8");
  } catch (error) {
    throw new Error(`${field} is not valid ${encoding}: ${error.message}`);
  }
}

async function loadSpec(specPath) {
  const bytes = await readFile(specPath);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    throw new Error("spec must be UTF-8 without BOM");
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const spec = JSON.parse(text);
  if (!isObject(spec)) throw new Error("spec root must be an object");
  return spec;
}

function validateSpec(spec, specDirectory) {
  assertString(spec.command, "command");
  const args = spec.args ?? [];
  if (!Array.isArray(args)) throw new Error("args must be an array of strings");
  args.forEach((value, index) => assertString(value, `args[${index}]`, { allowEmpty: true }));

  const cwdValue = spec.cwd ?? ".";
  assertString(cwdValue, "cwd");
  const cwd = resolveFrom(specDirectory, cwdValue);

  const env = { ...process.env };
  if (spec.env !== undefined) {
    if (!isObject(spec.env)) throw new Error("env must be an object");
    for (const [name, value] of Object.entries(spec.env)) {
      assertString(name, "env key");
      if (value === null) delete env[name];
      else {
        assertString(value, `env.${name}`, { allowEmpty: true });
        env[name] = value;
      }
    }
  }

  if (spec.stdin !== undefined && spec.stdinFile !== undefined) {
    throw new Error("stdin and stdinFile are mutually exclusive");
  }
  if (spec.stdin !== undefined) assertString(spec.stdin, "stdin", { allowEmpty: true });
  if (spec.stdinFile !== undefined) assertString(spec.stdinFile, "stdinFile");
  if (spec.stdoutFile !== undefined) assertString(spec.stdoutFile, "stdoutFile");
  if (spec.stderrFile !== undefined) assertString(spec.stderrFile, "stderrFile");

  for (const field of ["stdoutEncoding", "stderrEncoding"]) {
    if (spec[field] !== undefined) assertString(spec[field], field);
  }

  const timeoutMs = spec.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutputBytes = spec.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new Error("timeoutMs must be a positive integer");
  if (!Number.isInteger(maxOutputBytes) || maxOutputBytes <= 0) {
    throw new Error("maxOutputBytes must be a positive integer");
  }

  return {
    command: spec.command,
    args,
    cwd,
    env,
    stdin: spec.stdin,
    stdinFile: spec.stdinFile ? resolveFrom(cwd, spec.stdinFile) : undefined,
    stdoutFile: spec.stdoutFile ? resolveFrom(cwd, spec.stdoutFile) : undefined,
    stderrFile: spec.stderrFile ? resolveFrom(cwd, spec.stderrFile) : undefined,
    stdoutEncoding: spec.stdoutEncoding ?? "utf8",
    stderrEncoding: spec.stderrEncoding ?? "utf8",
    timeoutMs,
    maxOutputBytes,
  };
}

async function run(config) {
  const stdinBytes = config.stdinFile
    ? await readFile(config.stdinFile)
    : Buffer.from(config.stdin ?? "", "utf8");

  const child = spawn(config.command, config.args, {
    cwd: config.cwd,
    env: config.env,
    shell: false,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });

  const stdout = [];
  const stderr = [];
  let stdoutSize = 0;
  let stderrSize = 0;
  let limitError;

  child.stdout.on("data", (chunk) => {
    stdoutSize += chunk.length;
    if (stdoutSize > config.maxOutputBytes) {
      limitError = new Error(`stdout exceeded maxOutputBytes (${config.maxOutputBytes})`);
      child.kill();
      return;
    }
    stdout.push(chunk);
  });
  child.stderr.on("data", (chunk) => {
    stderrSize += chunk.length;
    if (stderrSize > config.maxOutputBytes) {
      limitError = new Error(`stderr exceeded maxOutputBytes (${config.maxOutputBytes})`);
      child.kill();
      return;
    }
    stderr.push(chunk);
  });

  child.stdin.end(stdinBytes);

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, config.timeoutMs);

  const result = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  }).finally(() => clearTimeout(timer));

  if (limitError) throw limitError;

  const stdoutBytes = decodeOutput(Buffer.concat(stdout), config.stdoutEncoding, "stdout");
  const stderrBytes = decodeOutput(Buffer.concat(stderr), config.stderrEncoding, "stderr");

  if (config.stdoutFile) await writeFile(config.stdoutFile, stdoutBytes);
  else if (stdoutBytes.length > 0) process.stdout.write(stdoutBytes);

  if (config.stderrFile) await writeFile(config.stderrFile, stderrBytes);
  else if (stderrBytes.length > 0) process.stderr.write(stderrBytes);

  if (timedOut) {
    process.stderr.write(`run-from-spec: timed out after ${config.timeoutMs} ms\n`);
    return 124;
  }
  if (result.signal) {
    process.stderr.write(`run-from-spec: child terminated by signal ${result.signal}\n`);
    return 1;
  }
  return result.code ?? 1;
}

if (process.argv.length === 3 && (process.argv[2] === "--help" || process.argv[2] === "-h")) {
  usage();
  process.exitCode = 0;
  process.exit();
}

if (process.argv.length !== 3) {
  usage();
  fail("expected exactly one spec path");
}

try {
  const specPath = path.resolve(process.argv[2]);
  const spec = await loadSpec(specPath);
  const config = validateSpec(spec, path.dirname(specPath));
  process.exitCode = await run(config);
} catch (error) {
  fail(error.message);
}
