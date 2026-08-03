# PowerShell + SSH newline escaping

Avoid sending newline escapes as `\n` through a PowerShell → SSH → remote shell chain. The backslash can be interpreted by the wrong layer, left literal, or degraded into output such as `n...n`.

Risky:

```powershell
ssh host "printf 'line 1\nline 2\n'"
```

Safer for tiny fixed text:

```powershell
ssh host "echo 'line 1'; echo 'line 2'"
```

Safer for real payloads:

- upload a script or data file with SFTP/scp;
- stream bytes through stdin when the SSH channel is not already used by a protocol;
- pass JSON or Base64 data and decode it on the remote side;
- keep the remote command fixed and small.

Do not use `echo` for user-controlled or structured data. It is only a small fixed-string fallback.
