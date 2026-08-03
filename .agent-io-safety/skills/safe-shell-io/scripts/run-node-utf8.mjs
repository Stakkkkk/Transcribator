#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { TextDecoder } from "node:util";

function usage() {
  process.stderr.write(
    "usage: node run-node-utf8.mjs <script.mjs> [--] [arg ...]\n" +
      "   or: node run-node-utf8.mjs --spec <spec.json>\n",
  );
}

function decodeUtf8(bytes, label) {
  if (bytes.length >= 2 && ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff))) {
    throw new Error(`${label}: UTF-16 BOM is not supported`);
  }
  const content = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
    ? bytes.subarray(3)
    : bytes;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch (error) {
    throw new Error(`${label}: invalid UTF-8: ${error.message}`);
  }
}

function parseArgs(argv) {
  if (argv.length === 0) throw new Error("missing script or --spec");
  if (argv.includes("--help") || argv.includes("-h")) return { help: true };

  if (argv[0] === "--spec") {
    if (!argv[1]) throw new Error("--spec requires a value");
    if (argv.length > 2) throw new Error("--spec mode does not accept extra CLI args");
    return { specPath: argv[1] };
  }

  const separator = argv.indexOf("--");
  if (separator === -1) return { scriptPath: argv[0], args: argv.slice(1) };
  if (separator !== 1) throw new Error("-- separator must follow the script path");
  return { scriptPath: argv[0], args: argv.slice(2) };
}

function assertStringArray(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`${label} must be an array of strings`);
  }
  return value;
}

async function loadSpec(specPath) {
  const absoluteSpec = path.resolve(specPath);
  const specText = decodeUtf8(await readFile(absoluteSpec), specPath);
  const spec = JSON.parse(specText);
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) throw new Error("spec must be an object");
  if (typeof spec.script !== "string" || spec.script.length === 0) throw new Error("spec.script must be a string");
  if (spec.stdin !== undefined && typeof spec.stdin !== "string") throw new Error("spec.stdin must be a string");
  if (spec.cwd !== undefined && typeof spec.cwd !== "string") throw new Error("spec.cwd must be a string");

  const baseDir = path.dirname(absoluteSpec);
  return {
    scriptPath: path.resolve(baseDir, spec.script),
    args: assertStringArray(spec.args, "spec.args"),
    nodeArgs: assertStringArray(spec.nodeArgs, "spec.nodeArgs"),
    cwd: spec.cwd === undefined ? baseDir : path.resolve(baseDir, spec.cwd),
    stdin: spec.stdin,
  };
}

function collect(child, label) {
  const chunks = [];
  child.on("error", (error) => {
    throw new Error(`${label}: ${error.message}`);
  });
  child.on("data", (chunk) => chunks.push(chunk));
  return chunks;
}

async function runNode({ scriptPath, args = [], nodeArgs = [], cwd = process.cwd(), stdin }) {
  const child = spawn(process.execPath, [...nodeArgs, scriptPath, ...args], {
    cwd,
    shell: false,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });

  const stdout = collect(child.stdout, "stdout");
  const stderr = collect(child.stderr, "stderr");
  if (stdin === undefined) child.stdin.end();
  else child.stdin.end(Buffer.from(stdin, "utf8"));

  const result = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });

  const stdoutText = decodeUtf8(Buffer.concat(stdout), "child stdout");
  const stderrText = decodeUtf8(Buffer.concat(stderr), "child stderr");
  process.stdout.write(Buffer.from(stdoutText, "utf8"));
  process.stderr.write(Buffer.from(stderrText, "utf8"));

  if (result.signal) {
    process.stderr.write(`run-node-utf8: child exited from signal ${result.signal}\n`);
    process.exitCode = 1;
  } else {
    process.exitCode = result.code ?? 1;
  }
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    process.exitCode = 0;
  } else if (options.specPath) {
    await runNode(await loadSpec(options.specPath));
  } else {
    await runNode({
      scriptPath: path.resolve(options.scriptPath),
      args: options.args,
    });
  }
} catch (error) {
  usage();
  process.stderr.write(`run-node-utf8: ${error.message}\n`);
  process.exitCode = 1;
}
