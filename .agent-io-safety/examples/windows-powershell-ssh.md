# Windows + PowerShell + SSH example

This is one of the most failure-prone boundaries:

```text
local agent → local shell/argv → ssh client → SSH protocol → remote Windows shell → PowerShell → text encoding
```

`safe-shell-io` can make the local `ssh` invocation deterministic, but it cannot remove the remote shell boundary. Treat the remote command as a separate risk boundary.

## Avoid this pattern

Do not interpolate user data into a remote command string:

```sh
ssh user@windows-host "powershell -Command \"Write-Output '$USER_TEXT'\""
```

This mixes local quoting, SSH command transport, remote shell parsing, PowerShell parsing, and text encoding in one fragile string.

## Safer pattern

Use a fixed remote command and pass the script through stdin:

```sh
node skills/safe-shell-io/scripts/run-from-spec.mjs examples/windows-powershell-ssh-command.json
```

The spec calls `ssh` with exact local argv and sends `windows-powershell-ssh-stdin.ps1` through stdin:

- local argv is protected by `run-from-spec.mjs`;
- the remote command is fixed, not assembled from user data;
- the PowerShell script is ASCII-only for Windows PowerShell 5.1 compatibility;
- non-ASCII payload is represented as UTF-8 bytes encoded in Base64 inside the script.

## Important boundary

OpenSSH still executes a remote command through the server-side command mechanism. Keep that command fixed and small:

```text
powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command -
```

If you need to pass changing user data, prefer one of these:

1. upload a temporary UTF-8 JSON file and pass only its path;
2. pass Base64-encoded UTF-8 data and decode it inside PowerShell;
3. use a project-specific remote script with well-defined parameters;
4. avoid remote shell execution entirely and use a dedicated API if available.

## Newlines

Do not rely on `\n` inside a PowerShell-built SSH command string. It can be interpreted by the wrong layer or arrive remotely as plain `n...n`.

For tiny fixed text, prefer:

```powershell
ssh host "echo 'line 1'; echo 'line 2'"
```

For real payloads, upload or stream data instead of embedding newline escapes. See `examples/powershell-ssh-newlines.md`.

After generating or modifying `.ps1` files, run:

```sh
node skills/safe-text-io/scripts/inspect-text.mjs --ps51-safe path/to/script.ps1
```
