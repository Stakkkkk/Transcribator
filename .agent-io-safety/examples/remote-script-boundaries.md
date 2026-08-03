# Remote script boundaries

Avoid building a multi-level remote script inside a host-language string when user data or escape sequences are involved.

## Risky pattern

```python
payload = "line 1\\nline 2"
command = f"""ssh host 'python3 - <<PY
text = "{payload}"
print(text)
PY'"""
```

Depending on escape layers, `\\n` may become a real newline inside the remote Python string literal.

## Safer pattern

Upload or stream bytes instead:

```python
script = b"import sys\nprint(sys.stdin.buffer.read().decode('utf-8'))\n"
payload = "line 1\\nline 2".encode("utf-8")
```

Then send `script` and `payload` through well-defined channels:

- SFTP/scp script upload;
- stdin file;
- Base64 JSON payload;
- fixed remote command.

For command invocation from this repository, prefer `safe-shell-io/scripts/run-from-spec.mjs` for the local process boundary.
