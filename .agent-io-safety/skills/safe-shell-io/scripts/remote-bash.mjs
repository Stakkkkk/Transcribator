#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import process from "node:process";
import { TextDecoder } from "node:util";

function usage() {
  process.stderr.write(
    "usage: node remote-bash.mjs [--print-normalized] [--ssh <ssh>] [--ssh-arg <arg>] <host> <script>\n",
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
  const options = {
    ssh: "ssh",
    sshArgs: [],
    printNormalized: false,
  };
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--help" || value === "-h") options.help = true;
    else if (value === "--print-normalized") options.printNormalized = true;
    else if (value === "--ssh") {
      options.ssh = argv[++index];
      if (!options.ssh) throw new Error("--ssh requires a value");
    } else if (value === "--ssh-arg") {
      const sshArg = argv[++index];
      if (sshArg === undefined) throw new Error("--ssh-arg requires a value");
      options.sshArgs.push(sshArg);
    } else if (value.startsWith("--")) {
      throw new Error(`unknown option: ${value}`);
    } else {
      positional.push(value);
    }
  }

  if (!options.help) {
    if (positional.length !== 2) throw new Error("expected <host> and <script>");
    [options.host, options.scriptPath] = positional;
  }
  return options;
}

async function loadNormalizedScript(scriptPath) {
  const text = decodeUtf8(await readFile(scriptPath), scriptPath);
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function collect(stream) {
  const chunks = [];
  stream.on("data", (chunk) => chunks.push(chunk));
  return chunks;
}

async function runRemote(options, scriptText) {
  const child = spawn(options.ssh, [...options.sshArgs, options.host, "bash", "-s"], {
    shell: false,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });

  const stdout = collect(child.stdout);
  const stderr = collect(child.stderr);
  child.stdin.end(Buffer.from(scriptText, "utf8"));

  const result = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });

  process.stdout.write(Buffer.concat(stdout));
  process.stderr.write(Buffer.concat(stderr));

  if (result.signal) {
    process.stderr.write(`remote-bash: ssh exited from signal ${result.signal}\n`);
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
  } else {
    const scriptText = await loadNormalizedScript(options.scriptPath);
    if (options.printNormalized) process.stdout.write(Buffer.from(scriptText, "utf8"));
    else await runRemote(options, scriptText);
  }
} catch (error) {
  usage();
  process.stderr.write(`remote-bash: ${error.message}\n`);
  process.exitCode = 1;
}
