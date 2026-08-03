# Repository Rules

- Answer users in Russian unless they explicitly ask for another language.
- Do not commit transcription artifacts, media files, temporary WAV files, Whisper models, downloaded binaries, or local `.agent` state.
- Keep generated outputs under `artefacts/out/<source stem>/` unless the user explicitly asks for another folder.
- Prefer local `ffmpeg` and `whisper.cpp`; do not install global dependencies unless the user approves it.
- For Windows paths with spaces or non-ASCII characters, pass arguments as argv/spec data instead of building shell strings.
- Before changing text files, preserve UTF-8 without BOM and LF unless a file has an established different format.
