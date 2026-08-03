#!/usr/bin/env node
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function fail(message, code = 2) {
  process.stderr.write(`transcode-text: ${message}\n`);
  process.exit(code);
}

function usage() {
  process.stderr.write(
    "usage: node transcode-text.mjs --input file (--output file|--in-place) " +
      "--bom none|add|keep [--source-encoding auto|utf8|utf16le|utf16be] " +
      "[--target-encoding utf8|utf16le|utf16be] [--eol preserve|lf|crlf] [--check] [--force]\n",
  );
}

function parseArgs(argv) {
  const options = {
    help: false,
    sourceEncoding: "auto",
    targetEncoding: "utf8",
    eol: "preserve",
    check: false,
    force: false,
    inPlace: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--help" || value === "-h") options.help = true;
    else if (value === "--input") options.input = argv[++index];
    else if (value === "--output") options.output = argv[++index];
    else if (value === "--source-encoding") options.sourceEncoding = argv[++index];
    else if (value === "--target-encoding") options.targetEncoding = argv[++index];
    else if (value === "--bom") options.bom = argv[++index];
    else if (value === "--eol") options.eol = argv[++index];
    else if (value === "--check") options.check = true;
    else if (value === "--force") options.force = true;
    else if (value === "--in-place") options.inPlace = true;
    else throw new Error(`unknown option: ${value}`);
  }
  if (options.help) return options;
  if (!options.input) throw new Error("--input is required");
  if (!options.bom || !new Set(["none", "add", "keep"]).has(options.bom)) {
    throw new Error("--bom none|add|keep is required");
  }
  if (!new Set(["auto", "utf8", "utf16le", "utf16be"]).has(options.sourceEncoding)) {
    throw new Error("unsupported --source-encoding");
  }
  if (!new Set(["utf8", "utf16le", "utf16be"]).has(options.targetEncoding)) {
    throw new Error("unsupported --target-encoding");
  }
  if (!new Set(["preserve", "lf", "crlf"]).has(options.eol)) throw new Error("unsupported --eol");
  if (options.inPlace && options.output) throw new Error("--in-place and --output are mutually exclusive");
  if (!options.inPlace && !options.output) throw new Error("--output or --in-place is required");
  return options;
}

function detectBom(bytes) {
  if (bytes.length >= 3 && bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) return { encoding: "utf8", size: 3 };
  if (bytes.length >= 2 && bytes.subarray(0, 2).equals(Buffer.from([0xff, 0xfe]))) return { encoding: "utf16le", size: 2 };
  if (bytes.length >= 2 && bytes.subarray(0, 2).equals(Buffer.from([0xfe, 0xff]))) return { encoding: "utf16be", size: 2 };
  return { encoding: undefined, size: 0 };
}

function swapPairs(bytes) {
  if (bytes.length % 2 !== 0) throw new Error("UTF-16 byte length must be even");
  const output = Buffer.alloc(bytes.length);
  for (let index = 0; index < bytes.length; index += 2) {
    output[index] = bytes[index + 1];
    output[index + 1] = bytes[index];
  }
  return output;
}

function decode(bytes, encoding) {
  if (encoding === "utf16be") return new TextDecoder("utf-16le", { fatal: true }).decode(swapPairs(bytes));
  const label = encoding === "utf8" ? "utf-8" : "utf-16le";
  return new TextDecoder(label, { fatal: true }).decode(bytes);
}

function encode(text, encoding) {
  if (encoding === "utf8") return Buffer.from(text, "utf8");
  const littleEndian = Buffer.from(text, "utf16le");
  return encoding === "utf16le" ? littleEndian : swapPairs(littleEndian);
}

function bomBytes(encoding) {
  if (encoding === "utf8") return Buffer.from([0xef, 0xbb, 0xbf]);
  if (encoding === "utf16le") return Buffer.from([0xff, 0xfe]);
  return Buffer.from([0xfe, 0xff]);
}

function normalizeEol(text, eol) {
  if (eol === "preserve") return text;
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return eol === "crlf" ? normalized.replace(/\n/g, "\r\n") : normalized;
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
  const inputBytes = await readFile(inputPath);
  const detected = detectBom(inputBytes);
  const sourceEncoding = options.sourceEncoding === "auto" ? (detected.encoding ?? "utf8") : options.sourceEncoding;
  if (detected.encoding && options.sourceEncoding !== "auto" && detected.encoding !== sourceEncoding) {
    throw new Error(`BOM declares ${detected.encoding}, but --source-encoding is ${sourceEncoding}`);
  }

  const contentBytes = detected.size > 0 ? inputBytes.subarray(detected.size) : inputBytes;
  const text = normalizeEol(decode(contentBytes, sourceEncoding), options.eol);
  let outputBytes = encode(text, options.targetEncoding);
  const addBom = options.bom === "add" || (options.bom === "keep" && detected.size > 0);
  if (addBom) outputBytes = Buffer.concat([bomBytes(options.targetEncoding), outputBytes]);

  const outputExists = await exists(outputPath);
  const currentBytes = outputExists ? await readFile(outputPath) : undefined;
  const identical = currentBytes?.equals(outputBytes) ?? false;

  if (options.check) {
    process.stdout.write(`${identical ? "OK" : "DIFF"} ${outputPath}\n`);
    process.exitCode = identical ? 0 : 1;
  } else if (identical) {
    process.stdout.write(`UNCHANGED ${outputPath}\n`);
  } else {
    if (outputExists && !options.inPlace && !options.force) {
      throw new Error("output exists; pass --force to replace it");
    }
    await writeFile(outputPath, outputBytes);
    process.stdout.write(`WROTE ${outputPath}: encoding=${options.targetEncoding} bom=${addBom ? "yes" : "no"} eol=${options.eol}\n`);
  }
} catch (error) {
  fail(error.message);
}
