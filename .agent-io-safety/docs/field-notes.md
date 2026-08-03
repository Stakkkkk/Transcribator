# Field notes: real I/O traps

[Russian version](ru/field-notes.md)

These notes are practical traps observed during real agent work. They are not all core rules, but they are good routing hints for agents.

## UTF-8 bytes are valid, but terminal output is mojibake

PowerShell, terminal code pages, tool stdout encoding, and file bytes are separate boundaries. If a UTF-8 file looks corrupted only in the terminal:

1. do not rewrite the file;
2. inspect bytes first:

```sh
node skills/safe-text-io/scripts/inspect-text.mjs path/to/file.md
```

3. if you need terminal/tool stdout for Markdown, JSON, rules, or skills, read with the strict UTF-8 reader:

```sh
node skills/safe-text-io/scripts/read-text.mjs path/to/file.md
```

4. do not try to fix PowerShell output with inline `[Console]::OutputEncoding` or `[System.Text.UTF8Encoding]::new($false)` snippets;
5. if needed, inspect hex bytes or read the file with another known decoder;
6. treat the terminal/tool output as suspect until byte-level checks confirm damage.

## Windows PowerShell + SSH + UTF-8 + secrets

These are high-risk boundaries because data crosses PowerShell, Node.js, SSH, remote shell, and terminal rendering.

### PowerShell to Node stdin can corrupt non-ASCII literals

If an inline Node.js script is passed through PowerShell stdin, Cyrillic paths or string literals can arrive as `????`.

Do not put non-ASCII paths or literals directly inside inline scripts. Prefer:

- a real `.mjs` script file;
- a UTF-8 JSON spec with args/stdin;
- Base64 for opaque payloads;
- ASCII anchors plus filesystem/API lookup when the exact filename may be mojibake in terminal output.

Use:

```sh
node skills/safe-shell-io/scripts/run-node-utf8.mjs --spec node-task.json
```

### PowerShell here-strings can send CRLF to remote Bash

A script streamed from a Windows here-string to `ssh host bash -s` can preserve `\r\n`. Remote tools such as `sed`, `awk`, or shell parsers can then receive stray `\r`.

Normalize to LF before sending:

```sh
node skills/safe-shell-io/scripts/remote-bash.mjs host script.sh
```

Use `--print-normalized` to inspect the exact script before SSH.

### Complex SSH command strings are not one safe layer

Pipes, `$`, regex, quotes, `sed`, `awk`, and `grep` inside `ssh host "..."` are parsed by multiple shells. Even local argv arrays do not remove the remote shell layer: `ssh host command args...` still joins arguments for remote shell execution.

For complex remote snippets, send a script through stdin/file/spec instead of a one-line SSH command.

### Inline interpreter one-liners can bypass the safe route

`node -e`, `python -c`, `powershell -Command`, `cmd /c`, `bash -c`, `sh -c`, and similar one-liners are easy to underestimate. If they read config/env/secrets, parse structured files, perform redaction, or contain regex, `$`, nested quotes, pipes, or non-ASCII data, treat them as unsafe.

Use a native tool/API, a real script file, `run-from-spec.mjs`, `run-node-utf8.mjs --spec`, or `node_repl`. For secrets, print only allowlisted metadata such as section names, URL hosts, counts, booleans, and auth presence flags; never inline-redact raw values in a shell command.

### Bash `set -u` expands `$...` inside double quotes

Under `set -u`, a command such as `grep "map $http_authorization"` can try to expand an unset Bash variable. For nginx or shell-looking config text:

- prefer single quotes: `grep 'map $http_authorization'`;
- use fixed-string matching where possible;
- put complex checks in a script file instead of nested quoting.

### Mojibake from `rg --files` is display evidence only

Cyrillic filenames shown as `????` in terminal output do not prove the filesystem bytes or file contents are damaged. Verify through filesystem APIs, `inspect-text.mjs`, or `read-text.mjs` before changing files.

### Smoke tests must redact secrets

Smoke tests that read `Authorization` or `Bearer` values must print only status, counts, server names, and non-secret metadata. Standard log redaction:

```js
const safe = text.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer <redacted>");
```

Never print raw tokens from MCP, HTTP, or service configs.

## `ssh -n` is useful, but not inside `rsync -e`

`ssh -n` prevents an SSH command from reading stdin. This helps nested read-only SSH commands that should not consume the parent script’s stdin.

Do not use it inside `rsync -e "ssh -n ..."`. `rsync` uses the SSH process stdin/stdout as its protocol channel, so `ssh -n` can break the transfer.

## Multi-level here-docs can corrupt string literals

If Python creates a shell here-doc that embeds Python code, escape layers can turn `\\n` into a real newline inside a remote string literal.

Prefer:

- upload a script file via SFTP/scp;
- send raw bytes through stdin;
- use Base64 for data payloads;
- keep remote command strings fixed and small.

See `docs/remote-io-recipes.md`.

## PowerShell + SSH can degrade `\n` into `n...n`

If PowerShell builds an SSH command string that contains `\n`, that sequence may be interpreted by the wrong layer, remain literal, or degrade into output such as `n...n`.

Do not depend on `\n` escaping across PowerShell → SSH → remote shell. For tiny fixed text, use repeated fixed `echo` commands. For real payloads, upload a file, stream stdin, or pass JSON/Base64 data.

See `examples/powershell-ssh-newlines.md`.

## Paramiko SFTP rename may not overwrite

`sftp.rename(tmp, target)` can fail when `target` already exists. Some servers return a generic `Failure`.

Safer pattern:

1. prefer `posix_rename` when available;
2. otherwise remove the target explicitly, then rename;
3. accept that remove+rename is not atomic;
4. verify the final file.

## PowerShell ranges need expression syntax

This can fail or be parsed unexpectedly:

```powershell
Select-Object -Index 94..112
```

Prefer:

```powershell
Select-Object -Index (94..112)
```

or:

```powershell
Select-Object -Skip 94 -First 19
```

See `examples/powershell-select-object.md`.

## `rg` patterns starting with `-` need `--`

`rg` treats an argument that starts with `-` as an option. If the search pattern itself can start with `-`, stop option parsing first:

```sh
rg -- "-TODO"
rg --fixed-strings -- "-literal-user-text"
```

See `examples/ripgrep-leading-dash.md`.

## Long SSH/rsync operations should survive client disconnects

Long remote operations should not depend on a local terminal or SSH session staying alive.

Prefer remote supervision:

- `nohup ... >log 2>&1 &`;
- `systemd-run --user ...`;
- `tmux` / `screen` where policy allows;
- remote log file plus polling.

## Non-UTF-8 files should not be “fixed” with replacement decoding

If a file is not valid UTF-8 and the needed edit is ASCII-only, byte-level ASCII replacement is safer than decoding the whole file with replacement characters.

Use:

```sh
node skills/safe-text-io/scripts/replace-ascii-bytes.mjs --input file --in-place --search old/ascii/path --replace new/ascii/path
```

Do not use this for non-ASCII edits or unknown semantic changes.

## Floating Docker tags are a migration risk

This is not a core shell/text I/O rule, but it is a useful deployment-safety recipe.

Do not blindly `docker pull` floating tags such as `latest` or an unpinned `IMAGE_TAG` during migration. First compare image ID/digest. If exact preservation matters, use `docker save` and `docker load`.
