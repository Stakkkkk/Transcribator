# Transcribator

Local helper for transcribing audio and video files with `ffmpeg` and `whisper.cpp`.

The repository stores source code, agent rules, the transcription skill, and safe shell/text I/O rules. It intentionally excludes media, transcripts, models, downloaded binaries, temporary files, and local agent history.

## Local environment

All machine-dependent paths and defaults live in [`.agent/localization.json`](.agent/localization.json). `${REPOSITORY_ROOT}` resolves to the clone directory, `${PROJECT_ROOT}` resolves from `projectRoot`, and other `${NAME}` tokens resolve from environment variables.

Edit this file when tool locations or working directories differ on another machine. Do not duplicate those values in `AGENTS.md`, skills, README examples, or source code, and do not store secrets in it.

CLI options have the highest priority, followed by environment variables and localization candidates.

## Requirements

- Node.js 20 or newer.
- `ffmpeg` available through a configured command or path.
- `whisper-cli` from `whisper.cpp`.
- A multilingual `whisper.cpp` model, such as `ggml-small-q5_1.bin`.

## Usage

```powershell
node .\src\transcribe-local-media.mjs `
  --source "<absolute-media-path>" `
  --language ru
```

By default, the script reads `.agent/localization.json` and creates a per-source folder under `paths.artifactsOutput` containing:

- `<source stem> - транскрипция.txt`
- `<source stem> - субтитры.srt`
- `<source stem> - транскрипция.json`

## Useful options

- `--source <path>`: required audio/video source.
- `--config <path>`: alternate localization file.
- `--project-root <path>`: override the localized project root.
- `--language <code>`: override the localized Whisper language.
- `--output-root <path>`: parent folder for per-source output folders.
- `--output-dir <path>`: exact output folder.
- `--ffmpeg <path>`: explicit ffmpeg binary.
- `--whisper-cli <path>`: explicit whisper-cli binary.
- `--model <path>`: explicit whisper.cpp model.
- `--threads <n>`: CPU threads.
- `--beam-size <n>`: Whisper beam size.
- `--best-of <n>`: Whisper best-of value.

## Notes

The localized defaults use `beamSize=1` and `bestOf=1` for a fast first pass on long CPU-only meetings. Re-run important recordings with a larger model or stronger decoding settings when final quality matters.

Names, release numbers, domain terms, and repeated noisy fragments still need manual review before client-facing use.
