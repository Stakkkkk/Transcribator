#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const TXT_SUFFIX = " - \u0442\u0440\u0430\u043d\u0441\u043a\u0440\u0438\u043f\u0446\u0438\u044f.txt";
const SRT_SUFFIX = " - \u0441\u0443\u0431\u0442\u0438\u0442\u0440\u044b.srt";
const JSON_SUFFIX = " - \u0442\u0440\u0430\u043d\u0441\u043a\u0440\u0438\u043f\u0446\u0438\u044f.json";

function printHelp() {
  process.stdout.write(`Transcribator

Usage:
  node ./src/transcribe-local-media.mjs --source <media> [options]

Options:
  --source <path>       Required audio/video source.
  --language <code>     Whisper language. Default: ru.
  --output-root <path>  Parent folder for per-source output folders.
  --output-dir <path>   Exact output folder.
  --ffmpeg <path>       Explicit ffmpeg binary.
  --whisper-cli <path>  Explicit whisper-cli binary.
  --model <path>        Explicit whisper.cpp model.
  --threads <n>         CPU threads. Default: up to 8.
  --beam-size <n>       Whisper beam size. Default: 1.
  --best-of <n>         Whisper best-of. Default: 1.
  --help                Show this help.
`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseArgs(argv) {
  const options = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      options.set("help", "true");
      continue;
    }
    if (!token.startsWith("--")) {
      fail(`Unexpected argument: ${token}`);
    }
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      fail(`Missing value for --${key}`);
    }
    options.set(key, value);
    index += 1;
  }
  return options;
}

function decodeBuffer(buffer) {
  if (!buffer || buffer.length === 0) {
    return "";
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
}

function runCommand(command, args) {
  const result = spawnSync(command, args, {
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 1024 * 1024 * 64,
  });

  const stdout = decodeBuffer(result.stdout);
  const stderr = decodeBuffer(result.stderr);

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const error = new Error(`Command failed: ${command}`);
    error.stdout = stdout;
    error.stderr = stderr;
    error.status = result.status;
    throw error;
  }

  return { stdout, stderr, status: result.status };
}

function probeCommand(command, args) {
  const result = spawnSync(command, args, {
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 1024 * 1024 * 16,
  });
  return {
    stdout: decodeBuffer(result.stdout),
    stderr: decodeBuffer(result.stderr),
    status: result.status ?? 0,
    error: result.error ?? null,
  };
}

function firstExistingPath(paths) {
  for (const candidate of paths) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function findOnPath(binaryName) {
  const locator = process.platform === "win32" ? "where" : "which";
  const result = probeCommand(locator, [binaryName]);
  if (result.error || result.status !== 0) {
    return null;
  }
  const lines = result.stdout
    .split(/\r\n|\n|\r/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines[0] || null;
}

function readUtf8(pathname) {
  const bytes = fs.readFileSync(pathname);
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function ensureTempDir(baseDir) {
  fs.mkdirSync(baseDir, { recursive: true });
  return fs.mkdtempSync(path.join(baseDir, "run-"));
}

function cleanupTempDir(tempDir, tempRoot) {
  const resolvedTempDir = path.resolve(tempDir);
  const resolvedTempRoot = path.resolve(tempRoot);
  if (
    resolvedTempDir === resolvedTempRoot ||
    !resolvedTempDir.startsWith(`${resolvedTempRoot}${path.sep}`)
  ) {
    throw new Error(`Refusing to remove unexpected temp dir: ${resolvedTempDir}`);
  }
  fs.rmSync(resolvedTempDir, { recursive: true, force: true });
}

function parseDuration(stderr) {
  const match = stderr.match(/Duration:\s*([0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?)/);
  return match ? match[1] : null;
}

function parsePositiveInteger(value, optionName) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    fail(`${optionName} must be a positive integer.`);
  }
  return String(parsed);
}

const options = parseArgs(process.argv.slice(2));
if (options.has("help")) {
  printHelp();
  process.exit(0);
}

const sourcePath = options.get("source");
const language = options.get("language") || "ru";
const cwd = process.cwd();
const localAppData = process.env.LOCALAPPDATA || "";

if (!sourcePath) {
  fail("Required argument: --source");
}

if (!fs.existsSync(sourcePath)) {
  fail(`Source media not found: ${sourcePath}`);
}

const ffmpegPath = firstExistingPath([
  options.get("ffmpeg"),
  process.env.FFMPEG_PATH,
  findOnPath("ffmpeg.exe"),
  findOnPath("ffmpeg"),
  "C:\\Program Files\\DownloadHelper CoApp\\ffmpeg.exe",
]);

if (!ffmpegPath) {
  fail("ffmpeg was not found. Use --ffmpeg or set FFMPEG_PATH.");
}

const defaultWhisperRoot = localAppData
  ? path.join(localAppData, "CodexTools", "whisper.cpp")
  : "";

const whisperCli = firstExistingPath([
  options.get("whisper-cli"),
  process.env.WHISPER_CLI_PATH,
  defaultWhisperRoot ? path.join(defaultWhisperRoot, "Release", "whisper-cli.exe") : null,
  path.join(cwd, "tools", "whisper.cpp", "Release", "whisper-cli.exe"),
]);

const modelPath = firstExistingPath([
  options.get("model"),
  process.env.WHISPER_MODEL_PATH,
  defaultWhisperRoot ? path.join(defaultWhisperRoot, "models", "ggml-small-q5_1.bin") : null,
  path.join(cwd, "tools", "whisper.cpp", "models", "ggml-small-q5_1.bin"),
]);

if (!whisperCli || !modelPath) {
  fail("whisper-cli/model were not found. Use --whisper-cli/--model or set WHISPER_CLI_PATH/WHISPER_MODEL_PATH.");
}

const sourceStem = path.parse(sourcePath).name;
const outputRoot =
  options.get("output-root") ||
  (options.get("project-root") ? path.join(options.get("project-root"), "artefacts", "out") : null) ||
  path.join(cwd, "artefacts", "out");
const outputDir = options.get("output-dir") || path.join(outputRoot, sourceStem);
fs.mkdirSync(outputDir, { recursive: true });

const tempRoot = path.join(os.tmpdir(), "transcribator");
const workDir = ensureTempDir(tempRoot);
const wavPath = path.join(workDir, "audio_16k.wav");
const whisperOutBase = path.join(workDir, "transcript");
const threadCount = options.has("threads")
  ? parsePositiveInteger(options.get("threads"), "--threads")
  : String(Math.max(1, Math.min(os.cpus().length || 4, 8)));
const beamSize = options.has("beam-size")
  ? parsePositiveInteger(options.get("beam-size"), "--beam-size")
  : "1";
const bestOf = options.has("best-of")
  ? parsePositiveInteger(options.get("best-of"), "--best-of")
  : "1";

const outputTxt = path.join(outputDir, `${sourceStem}${TXT_SUFFIX}`);
const outputSrt = path.join(outputDir, `${sourceStem}${SRT_SUFFIX}`);
const outputJson = path.join(outputDir, `${sourceStem}${JSON_SUFFIX}`);

let duration = null;
const startedAt = Date.now();

try {
  const inspect = probeCommand(ffmpegPath, ["-hide_banner", "-i", sourcePath]);
  duration = parseDuration(inspect.stderr);

  runCommand(ffmpegPath, [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    sourcePath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "pcm_s16le",
    wavPath,
  ]);

  runCommand(whisperCli, [
    "-m",
    modelPath,
    "-f",
    wavPath,
    "-l",
    language,
    "-t",
    threadCount,
    "-bs",
    beamSize,
    "-bo",
    bestOf,
    "-otxt",
    "-osrt",
    "-oj",
    "-ojf",
    "-of",
    whisperOutBase,
    "--print-progress",
  ]);

  fs.copyFileSync(`${whisperOutBase}.txt`, outputTxt);
  fs.copyFileSync(`${whisperOutBase}.srt`, outputSrt);
  fs.copyFileSync(`${whisperOutBase}.json`, outputJson);

  readUtf8(outputTxt);
  readUtf8(outputSrt);
  readUtf8(outputJson);

  const finishedAt = Date.now();
  const summary = {
    source: path.resolve(sourcePath),
    outputDir: path.resolve(outputDir),
    transcript: path.resolve(outputTxt),
    subtitles: path.resolve(outputSrt),
    json: path.resolve(outputJson),
    ffmpeg: path.resolve(ffmpegPath),
    whisperCli: path.resolve(whisperCli),
    model: path.resolve(modelPath),
    language,
    duration,
    processingSeconds: Math.round((finishedAt - startedAt) / 1000),
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} finally {
  cleanupTempDir(workDir, tempRoot);
}
