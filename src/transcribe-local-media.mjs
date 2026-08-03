#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_LOCALIZATION_PATH = path.join(REPOSITORY_ROOT, ".agent", "localization.json");
const TXT_SUFFIX = " - \u0442\u0440\u0430\u043d\u0441\u043a\u0440\u0438\u043f\u0446\u0438\u044f.txt";
const SRT_SUFFIX = " - \u0441\u0443\u0431\u0442\u0438\u0442\u0440\u044b.srt";
const JSON_SUFFIX = " - \u0442\u0440\u0430\u043d\u0441\u043a\u0440\u0438\u043f\u0446\u0438\u044f.json";

function printHelp() {
  process.stdout.write(`Transcribator

Usage:
  node ./src/transcribe-local-media.mjs --source <media> [options]

Options:
  --source <path>        Required audio/video source.
  --config <path>        Localization JSON. Default: .agent/localization.json.
  --project-root <path>  Override the localized project root.
  --language <code>      Whisper language. Default: localized value.
  --output-root <path>   Parent folder for per-source output folders.
  --output-dir <path>    Exact output folder.
  --ffmpeg <path>        Explicit ffmpeg binary.
  --whisper-cli <path>   Explicit whisper-cli binary.
  --model <path>         Explicit whisper.cpp model.
  --threads <n>          CPU threads. Default: localized maximum.
  --beam-size <n>        Whisper beam size. Default: localized value.
  --best-of <n>          Whisper best-of. Default: localized value.
  --help                 Show this help.
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

function firstCommandOnPath(binaryNames) {
  for (const binaryName of binaryNames) {
    const candidate = findOnPath(binaryName);
    if (candidate) {
      return candidate;
    }
  }
  return null;
}

function readUtf8(pathname) {
  const bytes = fs.readFileSync(pathname);
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function loadLocalization(pathname) {
  if (!fs.existsSync(pathname)) {
    fail(`Localization file not found: ${pathname}`);
  }

  let localization;
  try {
    localization = JSON.parse(readUtf8(pathname));
  } catch (error) {
    fail(`Cannot read localization file ${pathname}: ${error.message}`);
  }

  if (!localization || typeof localization !== "object" || Array.isArray(localization)) {
    fail(`Localization file must contain a JSON object: ${pathname}`);
  }
  if (localization.version !== 1) {
    fail(`Unsupported localization version in ${pathname}: ${localization.version}`);
  }
  return localization;
}

function createVariableMap(extraValues = {}) {
  const variables = new Map();
  for (const [name, value] of Object.entries(process.env)) {
    if (value) {
      variables.set(name.toUpperCase(), value);
    }
  }
  for (const [name, value] of Object.entries(extraValues)) {
    if (value) {
      variables.set(name.toUpperCase(), value);
    }
  }
  return variables;
}

function expandTokens(value, variables, label) {
  if (typeof value !== "string" || value.length === 0) {
    fail(`${label} must be a non-empty string.`);
  }

  let unresolved = false;
  const expanded = value.replace(/\$\{([A-Z0-9_]+)\}/gi, (_match, name) => {
    const replacement = variables.get(name.toUpperCase());
    if (!replacement) {
      unresolved = true;
      return "";
    }
    return replacement;
  });
  return unresolved ? null : expanded;
}

function resolveConfiguredPath(value, baseDir, variables, label) {
  const expanded = expandTokens(value, variables, label);
  if (!expanded) {
    return null;
  }
  return path.isAbsolute(expanded) ? path.normalize(expanded) : path.resolve(baseDir, expanded);
}

function stringArray(config, key, label) {
  const value = config?.[key];
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item)) {
    fail(`${label} must be an array of non-empty strings.`);
  }
  return value;
}

function configuredPaths(values, baseDir, variables, label) {
  return values
    .map((value, index) => resolveConfiguredPath(value, baseDir, variables, `${label}[${index}]`))
    .filter(Boolean);
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
  if (!Number.isInteger(parsed) || parsed < 1 || String(parsed) !== String(value)) {
    fail(`${optionName} must be a positive integer.`);
  }
  return String(parsed);
}

function localizedPositiveInteger(defaults, key, fallback) {
  const value = defaults?.[key] ?? fallback;
  return Number.parseInt(parsePositiveInteger(String(value), `transcriptionDefaults.${key}`), 10);
}

function cliPath(value, cwd) {
  if (!value) {
    return null;
  }
  return path.isAbsolute(value) ? path.normalize(value) : path.resolve(cwd, value);
}

const options = parseArgs(process.argv.slice(2));
if (options.has("help")) {
  printHelp();
  process.exit(0);
}

const cwd = process.cwd();
const configPath = cliPath(
  options.get("config") || process.env.TRANSCRIBATOR_CONFIG || DEFAULT_LOCALIZATION_PATH,
  cwd,
);
const localization = loadLocalization(configPath);
const baseVariables = createVariableMap({
  REPOSITORY_ROOT,
  TEMP: os.tmpdir(),
});
const projectRootSource = options.get("project-root") || localization.projectRoot;
const projectRootBase = options.has("project-root") ? cwd : REPOSITORY_ROOT;
const projectRoot = resolveConfiguredPath(
  projectRootSource,
  projectRootBase,
  baseVariables,
  "projectRoot",
);

if (!projectRoot) {
  fail("projectRoot contains an unresolved localization variable.");
}

const variables = createVariableMap({
  REPOSITORY_ROOT,
  PROJECT_ROOT: projectRoot,
  TEMP: os.tmpdir(),
});
const pathConfig = localization.paths || {};
const toolConfig = localization.tools || {};
const defaults = localization.transcriptionDefaults || {};
const sourceArgument = options.get("source");
const language = options.get("language") || defaults.language || "ru";

if (!sourceArgument) {
  fail("Required argument: --source");
}

const sourcePath = cliPath(sourceArgument, cwd);
if (!fs.existsSync(sourcePath)) {
  fail(`Source media not found: ${sourcePath}`);
}

const ffmpegCommands = stringArray(toolConfig, "ffmpegCommands", "tools.ffmpegCommands");
const ffmpegCandidates = configuredPaths(
  stringArray(toolConfig, "ffmpegPaths", "tools.ffmpegPaths"),
  projectRoot,
  variables,
  "tools.ffmpegPaths",
);
const ffmpegPath =
  firstExistingPath([
    cliPath(options.get("ffmpeg"), cwd),
    cliPath(process.env.FFMPEG_PATH, cwd),
  ]) ||
  firstCommandOnPath(ffmpegCommands) ||
  firstExistingPath(ffmpegCandidates);

if (!ffmpegPath) {
  fail("ffmpeg was not found. Use --ffmpeg, FFMPEG_PATH, or tools.ffmpeg* in localization.");
}

const whisperCliCommands = stringArray(
  toolConfig,
  "whisperCliCommands",
  "tools.whisperCliCommands",
);
const whisperCliCandidates = configuredPaths(
  stringArray(toolConfig, "whisperCliPaths", "tools.whisperCliPaths"),
  projectRoot,
  variables,
  "tools.whisperCliPaths",
);
const modelCandidates = configuredPaths(
  stringArray(toolConfig, "whisperModelPaths", "tools.whisperModelPaths"),
  projectRoot,
  variables,
  "tools.whisperModelPaths",
);
const whisperCli =
  firstExistingPath([
    cliPath(options.get("whisper-cli"), cwd),
    cliPath(process.env.WHISPER_CLI_PATH, cwd),
  ]) ||
  firstCommandOnPath(whisperCliCommands) ||
  firstExistingPath(whisperCliCandidates);
const modelPath = firstExistingPath([
  cliPath(options.get("model"), cwd),
  cliPath(process.env.WHISPER_MODEL_PATH, cwd),
  ...modelCandidates,
]);

if (!whisperCli || !modelPath) {
  fail("whisper-cli/model were not found. Use CLI options, environment variables, or localization candidates.");
}

const sourceStem = path.parse(sourcePath).name;
const localizedOutputRoot = pathConfig.artifactsOutput
  ? resolveConfiguredPath(
      pathConfig.artifactsOutput,
      projectRoot,
      variables,
      "paths.artifactsOutput",
    )
  : path.join(projectRoot, "artefacts", "out");
const outputRoot = cliPath(options.get("output-root"), cwd) || localizedOutputRoot;
const outputDir = cliPath(options.get("output-dir"), cwd) || path.join(outputRoot, sourceStem);
fs.mkdirSync(outputDir, { recursive: true });

const tempRoot = pathConfig.tempRoot
  ? resolveConfiguredPath(pathConfig.tempRoot, projectRoot, variables, "paths.tempRoot")
  : path.join(os.tmpdir(), "transcribator");
if (!tempRoot) {
  fail("paths.tempRoot contains an unresolved localization variable.");
}

const workDir = ensureTempDir(tempRoot);
const wavPath = path.join(workDir, "audio_16k.wav");
const whisperOutBase = path.join(workDir, "transcript");
const threadsMax = localizedPositiveInteger(defaults, "threadsMax", 8);
const defaultBeamSize = localizedPositiveInteger(defaults, "beamSize", 1);
const defaultBestOf = localizedPositiveInteger(defaults, "bestOf", 1);
const threadCount = options.has("threads")
  ? parsePositiveInteger(options.get("threads"), "--threads")
  : String(Math.max(1, Math.min(os.cpus().length || 4, threadsMax)));
const beamSize = options.has("beam-size")
  ? parsePositiveInteger(options.get("beam-size"), "--beam-size")
  : String(defaultBeamSize);
const bestOf = options.has("best-of")
  ? parsePositiveInteger(options.get("best-of"), "--best-of")
  : String(defaultBestOf);

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
    localization: path.resolve(configPath),
    projectRoot: path.resolve(projectRoot),
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
