#!/usr/bin/env node
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function fail(message, code = 2) {
  process.stderr.write(`replace-ascii-bytes: ${message}\n`);
  process.exit(code);
}

function usage() {
  process.stderr.write(
    "usage: node replace-ascii-bytes.mjs --input file (--output file|--in-place) " +
      "(--search ascii|--search-hex hex) (--replace ascii|--replace-hex hex) " +
      "[--count n] [--check] [--force]\n",
  );
}

function requireValue(argv, index, flag) {
  if (index + 1 >= argv.length) throw new Error(`${flag} requires a value`);
  return argv[index + 1];
}

function parseArgs(argv) {
  const options = {
    help: false,
    check: false,
    force: false,
    inPlace: false,
    searchMode: undefined,
    replaceMode: undefined,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--help" || value === "-h") options.help = true;
    else if (value === "--input") {
      options.input = requireValue(argv, index, value);
      index += 1;
    } else if (value === "--output") {
      options.output = requireValue(argv, index, value);
      index += 1;
    } else if (value === "--search") {
      if (options.searchMode) throw new Error("use only one search option");
      options.searchMode = "ascii";
      options.search = requireValue(argv, index, value);
      index += 1;
    } else if (value === "--search-hex") {
      if (options.searchMode) throw new Error("use only one search option");
      options.searchMode = "hex";
      options.search = requireValue(argv, index, value);
      index += 1;
    } else if (value === "--replace") {
      if (options.replaceMode) throw new Error("use only one replacement option");
      options.replaceMode = "ascii";
      options.replace = requireValue(argv, index, value);
      index += 1;
    } else if (value === "--replace-hex") {
      if (options.replaceMode) throw new Error("use only one replacement option");
      options.replaceMode = "hex";
      options.replace = requireValue(argv, index, value);
      index += 1;
    } else if (value === "--count") {
      const rawCount = requireValue(argv, index, value);
      if (!/^[1-9][0-9]*$/.test(rawCount)) throw new Error("--count must be a positive integer");
      options.count = Number(rawCount);
      if (!Number.isSafeInteger(options.count)) throw new Error("--count is too large");
      index += 1;
    } else if (value === "--check") options.check = true;
    else if (value === "--force") options.force = true;
    else if (value === "--in-place") options.inPlace = true;
    else throw new Error(`unknown option: ${value}`);
  }
  if (options.help) return options;
  if (!options.input) throw new Error("--input is required");
  if (options.inPlace && options.output) throw new Error("--in-place and --output are mutually exclusive");
  if (!options.inPlace && !options.output) throw new Error("--output or --in-place is required");
  if (!options.searchMode) throw new Error("--search or --search-hex is required");
  if (!options.replaceMode) throw new Error("--replace or --replace-hex is required");
  return options;
}

function asciiBytes(value, label, { allowEmpty }) {
  if (value.length === 0 && !allowEmpty) throw new Error(`${label} must not be empty`);
  if (value.includes("\0")) throw new Error(`${label} must not contain NUL; use hex mode if byte-level NUL is intentional`);
  const bytes = Buffer.from(value, "utf8");
  if ([...bytes].some((byte) => byte > 0x7f)) throw new Error(`${label} must be ASCII-only; use hex mode for raw bytes`);
  return bytes;
}

function hexBytes(value, label, { allowEmpty }) {
  if (value.length === 0 && !allowEmpty) throw new Error(`${label} must not be empty`);
  if (value.length % 2 !== 0) throw new Error(`${label} hex length must be even`);
  if (!/^[0-9a-fA-F]*$/.test(value)) throw new Error(`${label} must contain only hex digits`);
  return Buffer.from(value, "hex");
}

function buildBytes(value, mode, label, options) {
  return mode === "ascii" ? asciiBytes(value, label, options) : hexBytes(value, label, options);
}

function replaceBytes(inputBytes, searchBytes, replacementBytes, count) {
  const chunks = [];
  let offset = 0;
  let replacements = 0;
  const maxCount = count ?? Number.POSITIVE_INFINITY;
  while (replacements < maxCount) {
    const matchIndex = inputBytes.indexOf(searchBytes, offset);
    if (matchIndex === -1) break;
    chunks.push(inputBytes.subarray(offset, matchIndex));
    chunks.push(replacementBytes);
    offset = matchIndex + searchBytes.length;
    replacements += 1;
  }
  if (replacements === 0) return { outputBytes: inputBytes, replacements };
  chunks.push(inputBytes.subarray(offset));
  return { outputBytes: Buffer.concat(chunks), replacements };
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    process.exitCode = 0;
    process.exit();
  }

  const inputPath = path.resolve(options.input);
  const outputPath = options.inPlace ? inputPath : path.resolve(options.output);
  if (!options.inPlace && inputPath === outputPath) throw new Error("use --in-place to modify the input file");

  const searchBytes = buildBytes(options.search, options.searchMode, "search", { allowEmpty: false });
  const replacementBytes = buildBytes(options.replace, options.replaceMode, "replacement", { allowEmpty: true });
  const inputBytes = await readFile(inputPath);
  const { outputBytes, replacements } = replaceBytes(inputBytes, searchBytes, replacementBytes, options.count);

  const outputExists = await exists(outputPath);
  const currentBytes = outputExists ? await readFile(outputPath) : undefined;
  const identical = currentBytes?.equals(outputBytes) ?? false;

  if (options.check) {
    process.stdout.write(`${identical ? "OK" : "DIFF"} ${outputPath}: replacements=${replacements}\n`);
    process.exitCode = identical ? 0 : 1;
  } else if (identical) {
    process.stdout.write(`UNCHANGED ${outputPath}: replacements=${replacements}\n`);
  } else {
    if (outputExists && !options.inPlace && !options.force) {
      throw new Error("output exists; pass --force to replace it");
    }
    await writeFile(outputPath, outputBytes);
    process.stdout.write(`WROTE ${outputPath}: replacements=${replacements}\n`);
  }
} catch (error) {
  usage();
  fail(error.message);
}
