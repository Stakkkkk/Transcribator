---
name: transcribe-local-audio
description: Transcribe local audio or video files into text, subtitles, and timestamped JSON using local tools. Use when the user asks to transcribe a local .webm, .mp4, .m4a, .mp3, .wav, or similar media file; create SRT/VTT subtitles; extract speech from a meeting recording; or produce a meeting transcript while avoiding pasting large transcripts into chat.
---

# Local Audio Transcription

Use local transcription first. Do not paste a full transcript into chat unless the user explicitly asks; save artifacts to files and report paths.

## Outputs

Write outputs into a per-source folder:

`artefacts/out/<source stem>/`

Inside that folder, create:

- `<source stem> - транскрипция.txt`
- `<source stem> - субтитры.srt`
- `<source stem> - транскрипция.json`

For long meetings, offer a memo or summary only after the transcript exists.

## Workflow

1. Verify the source file exists and inspect duration/audio streams.
2. Locate `ffmpeg`. Check `PATH` first, then common Windows installs such as `C:\Program Files\DownloadHelper CoApp\ffmpeg.exe`.
3. Locate an existing transcription CLI/model before downloading:
   - `WHISPER_CLI_PATH` and `WHISPER_MODEL_PATH`;
   - `%LOCALAPPDATA%\CodexTools\whisper.cpp\Release\whisper-cli.exe`;
   - `%LOCALAPPDATA%\CodexTools\whisper.cpp\models\ggml-small-q5_1.bin`;
   - a project-local `tools/whisper.cpp` mirror.
4. If no transcription tool exists, use portable `whisper.cpp` in an ASCII-only temp or tools folder. Do not install global dependencies unless the user approves it.
5. Convert media to 16 kHz mono WAV with `ffmpeg`.
6. Run transcription with Russian language when the user speaks Russian; otherwise use `-l auto` or the known language. For a first pass on long CPU-only meetings, prefer fast greedy decoding: `-bs 1 -bo 1`.
7. Copy results to `artefacts/out/<source stem>/` unless the user requested another folder.
8. Verify outputs are readable as UTF-8.
9. Remove temporary WAV/log files after copying outputs. Never remove persistent `whisper.cpp` binaries or models.

## Recommended Models

- Fast rough draft: `ggml-base-q5_1.bin`
- Balanced default for Russian meetings: `ggml-small-q5_1.bin`
- Higher quality, slower: `ggml-medium-q5_0.bin`

## Script

Use the repository script when available:

```powershell
node .\src\transcribe-local-media.mjs --source "C:\path\to\meeting.webm" --language ru
```

Use explicit paths when auto-discovery is not enough:

```powershell
node .\src\transcribe-local-media.mjs `
  --source "C:\path\to\meeting.webm" `
  --ffmpeg "C:\path\to\ffmpeg.exe" `
  --whisper-cli "C:\path\to\whisper-cli.exe" `
  --model "C:\path\to\ggml-small-q5_1.bin"
```

## Practical Rules

- Give progress updates for long files. CPU transcription may take tens of minutes.
- Use ASCII-only temporary paths for `whisper.cpp`.
- If console output shows mojibake, re-read files with a strict UTF-8 reader before deciding the file is broken.
- Watch for repeated hallucinated phrases on noisy or silent sections.
- Mention that names, release numbers, system names, and terms need manual correction.

## Final Response

Report only the important result:

- absolute paths to created files;
- model/tool used;
- duration and rough processing time when known;
- quality caveats.
