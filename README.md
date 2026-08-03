# Transcribator

Local helper for transcribing audio and video files with `ffmpeg` and `whisper.cpp`.

The repository intentionally does not store media files, transcripts, models, temporary WAV files, or local agent state. Generated artifacts are ignored by git.

## Requirements

- Node.js 20 or newer.
- `ffmpeg` in `PATH`, or at `C:\Program Files\DownloadHelper CoApp\ffmpeg.exe` on Windows.
- `whisper-cli` from `whisper.cpp`.
- A multilingual `whisper.cpp` model, for example `ggml-small-q5_1.bin`.

The script checks these locations first:

- `WHISPER_CLI_PATH` and `WHISPER_MODEL_PATH` environment variables.
- `%LOCALAPPDATA%\CodexTools\whisper.cpp\Release\whisper-cli.exe`
- `%LOCALAPPDATA%\CodexTools\whisper.cpp\models\ggml-small-q5_1.bin`
- `tools\whisper.cpp\Release\whisper-cli.exe`
- `tools\whisper.cpp\models\ggml-small-q5_1.bin`

## Usage

```powershell
node .\src\transcribe-local-media.mjs `
  --source "C:\path\to\meeting.webm" `
  --language ru `
  --output-root ".\artefacts\out"
```

The default output directory is:

```text
<cwd>\artefacts\out\<source stem>\
```

The script creates:

- `<source stem> - транскрипция.txt`
- `<source stem> - субтитры.srt`
- `<source stem> - транскрипция.json`

## Useful Options

- `--source <path>`: required audio/video source.
- `--language <code>`: Whisper language, default `ru`.
- `--output-root <path>`: parent folder for per-source output folders.
- `--output-dir <path>`: exact output folder.
- `--ffmpeg <path>`: explicit ffmpeg binary.
- `--whisper-cli <path>`: explicit whisper-cli binary.
- `--model <path>`: explicit whisper.cpp model.
- `--threads <n>`: CPU threads, default up to 8.
- `--beam-size <n>`: default `1` for faster CPU drafts.
- `--best-of <n>`: default `1` for faster CPU drafts.

## Notes

For long CPU-only meetings, the default `beam-size=1` and `best-of=1` are intentionally fast. Re-run important recordings with a larger model or stronger decoding settings when final quality matters.

Names, release numbers, domain terms, and repeated noisy fragments still need manual review before client-facing use.
