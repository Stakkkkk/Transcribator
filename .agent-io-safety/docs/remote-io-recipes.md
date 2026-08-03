# Remote I/O recipes

[Russian version](ru/remote-io-recipes.md)

Remote execution combines several fragile boundaries. Treat each boundary separately.

```text
local process → local argv/shell → transport → remote shell → remote interpreter → remote files
```

## Keep remote command strings fixed

Bad pattern:

```python
command = f"ssh host \"python3 - <<'PY'\nprint('{user_text}')\nPY\""
```

This mixes Python string escaping, local shell quoting, SSH command transport, remote shell parsing, and remote Python parsing.

Safer patterns:

- upload a script file via SFTP/scp, then run a fixed command;
- send script bytes through stdin;
- encode data payloads as Base64 or JSON files;
- pass only stable paths or fixed flags through the remote command line.

If the remote snippet contains pipes, `$`, regex, quotes, `sed`, `awk`, or `grep`, treat it as a script, not as an SSH one-liner. Local argv arrays do not remove the remote shell parser; `ssh host command args...` is still interpreted remotely.

## Windows to remote Bash

PowerShell here-strings and Windows-authored files can carry CRLF into `ssh host bash -s`. Normalize scripts to LF before sending:

```sh
node skills/safe-shell-io/scripts/remote-bash.mjs host script.sh
```

Use `--print-normalized` for a local dry check:

```sh
node skills/safe-shell-io/scripts/remote-bash.mjs --print-normalized host script.sh
```

The helper reads the script as strict UTF-8, rejects UTF-16/invalid UTF-8, converts `CRLF`/`CR` to `LF`, and sends bytes to `ssh host bash -s` without a local shell.

## PowerShell/SSH newline escapes

Do not pass newlines as `\n` through PowerShell → SSH → remote shell quoting. Depending on the layers, the remote side may see a literal backslash-n, a real newline in the wrong place, or output such as `n...n`.

For tiny fixed output, repeated `echo` commands are clearer than cross-layer newline escaping:

```powershell
ssh host "echo 'line 1'; echo 'line 2'"
```

For generated or user-controlled payloads, do not use `echo`. Upload a file, stream bytes through stdin, or send JSON/Base64 data and decode it remotely.

See `examples/powershell-ssh-newlines.md`.

## `ssh -n`

Use `ssh -n` when a nested SSH command must not read the parent script’s stdin.

Do not use `ssh -n` inside `rsync -e`, because rsync uses SSH stdin/stdout as a protocol channel.

## Long-running remote operations

Avoid keeping long migrations tied to a local SSH window.

Prefer:

```sh
nohup ./long-task.sh >long-task.log 2>&1 &
```

or:

```sh
systemd-run --user --unit agent-long-task ./long-task.sh
```

Then poll:

```sh
ssh host tail -n 100 long-task.log
ssh host test -f long-task.done
```

## SFTP atomic-ish replace

For Paramiko-style SFTP clients:

1. upload to a temporary path in the same directory;
2. verify size/hash if practical;
3. use `posix_rename(tmp, target)` when available;
4. fallback to `remove(target)` then `rename(tmp, target)` only when atomic replacement is unavailable and acceptable;
5. verify the final target.

Document the fallback because remove+rename is not atomic.

## Remote text encoding

Remote stdout encoding is a separate boundary. If remote output looks corrupted:

- verify remote file bytes;
- verify the remote program output encoding;
- verify the local decoder;
- do not rewrite remote files based only on terminal appearance.
