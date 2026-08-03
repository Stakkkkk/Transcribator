---
name: transcribe-local-audio
description: Transcribe local audio or video files into text, subtitles, and timestamped JSON using local ffmpeg and whisper.cpp tools. Use when the user asks to transcribe a local media file, create subtitles, extract speech from a meeting recording, or produce a meeting transcript without pasting a large transcript into chat.
---

# Local Audio Transcription

Use local transcription first. Save full transcripts to files and report paths; do not paste a full transcript into chat unless the user explicitly asks.

## Localization

Before resolving any project or tool path, read `.agent/localization.json` from the repository root.

- Resolve `${REPOSITORY_ROOT}` to the repository directory.
- Resolve `${PROJECT_ROOT}` from `projectRoot`.
- Resolve remaining `${NAME}` tokens from environment variables.
- Treat CLI paths supplied by the user as higher priority than localized candidates.
- Do not duplicate machine-specific paths in this skill.

## Outputs

For chat attachments and media under `paths.artifactsInput`, create a per-source folder under `paths.artifactsOutput` containing:

- `<source stem> - транскрипция.txt`
- `<source stem> - субтитры.srt`
- `<source stem> - транскрипция.json`

For long meetings, offer a memo or summary only after the transcript exists.

## Workflow

1. Verify the source file and inspect duration and audio streams.
2. Locate `ffmpeg` through explicit arguments, environment variables, then `tools.ffmpegCommands` and `tools.ffmpegPaths` from localization.
3. Locate an existing `whisper-cli` and model through explicit arguments, environment variables, then `tools.whisperCliCommands`, `tools.whisperCliPaths`, and `tools.whisperModelPaths`.
4. If no transcription tool exists, use portable `whisper.cpp` in an ASCII-only tools or temporary folder. Do not install global dependencies unless the user approves it.
5. Convert media to 16 kHz mono WAV with `ffmpeg`.
6. Use the localized language unless the user specifies another language. For a first pass on a long CPU-only meeting, use localized beam and best-of defaults.
7. Write results under the localized output directory unless the user explicitly requests another location.
8. Verify TXT, SRT, and JSON as UTF-8. If console output looks like mojibake, use the strict reader from `.agent-io-safety` before deciding the file is damaged.
9. Remove only the current run directory created inside `paths.tempRoot`. Never remove persistent binaries or models.

## Recommended Models

- Fast rough draft: `ggml-base-q5_1.bin`
- Balanced default for Russian meetings: `ggml-small-q5_1.bin`
- Higher quality, slower: `ggml-medium-q5_0.bin`

## Script

Prefer the repository script:

```powershell
node .\src\transcribe-local-media.mjs --source "<absolute-media-path>"
```

Pass `--config`, `--ffmpeg`, `--whisper-cli`, `--model`, or output options only when the localized discovery is not sufficient.

## Practical Rules

- Give progress updates for long files; CPU transcription may take tens of minutes.
- Prefer ASCII-only temporary and Whisper execution paths on Windows.
- Watch for repeated hallucinated phrases in noisy or silent sections.
- Read large transcripts from disk in chunks when producing a memo.
- Mention that names, release numbers, system names, and domain terms need manual correction.

## Final Response

Report absolute paths to created files, the model/tool used, duration and rough processing time when known, and quality caveats. Keep the answer concise.
