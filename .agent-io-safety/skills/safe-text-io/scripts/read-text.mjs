#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import process from "node:process";
import { TextDecoder } from "node:util";

function usage() {
  process.stderr.write("usage: node read-text.mjs <path> [<path> ...]\n");
}

function isUtf8Bom(bytes) {
  return bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
}

function isUtf16Bom(bytes) {
  return bytes.length >= 2 &&
    ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff));
}

function decodeUtf8Strict(bytes, label) {
  if (isUtf16Bom(bytes)) {
    throw new Error(`${label}: UTF-16 BOM is not supported; transcode explicitly before reading`);
  }

  const content = isUtf8Bom(bytes) ? bytes.subarray(3) : bytes;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch (error) {
    throw new Error(`${label}: invalid UTF-8: ${error.message}`);
  }
}

async function main(argv) {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    usage();
    process.exitCode = argv.length === 0 ? 2 : 0;
    return;
  }

  const texts = [];
  for (const filePath of argv) {
    const bytes = await readFile(filePath);
    texts.push(decodeUtf8Strict(bytes, filePath));
  }

  for (const text of texts) {
    process.stdout.write(Buffer.from(text, "utf8"));
  }
}

try {
  await main(process.argv.slice(2));
} catch (error) {
  usage();
  process.stderr.write(`read-text: ${error.message}\n`);
  process.exitCode = 1;
}
