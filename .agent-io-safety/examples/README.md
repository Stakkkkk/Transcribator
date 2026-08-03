# Examples

These examples are intentionally small. They demonstrate where agents should stop trying new quoting combinations and switch to deterministic I/O.

## Safe shell argv

Run the echo example from the repository root:

```sh
node skills/safe-shell-io/scripts/run-from-spec.mjs examples/safe-shell-command.json
```

The spec passes spaces, quotes, `$`, `&`, a backslash, a newline, and non-ASCII text as exact `argv` items.

## Text inspection

Inspect the repository text policy:

```sh
node skills/safe-text-io/scripts/inspect-text.mjs --all-files --fail-on-bom --eol lf --ps51-safe .
```

Inspect a single generated file without assuming shell defaults:

```sh
node skills/safe-text-io/scripts/inspect-text.mjs examples/safe-shell-command.json
```

## Remote and PowerShell boundaries

- `skills/safe-shell-io/scripts/run-node-utf8.mjs` runs a Node script file or UTF-8 JSON spec instead of inline Node through PowerShell stdin.
- `skills/safe-shell-io/scripts/remote-bash.mjs` normalizes Windows CRLF to LF before streaming Bash to `ssh host bash -s`.
- `windows-powershell-ssh.md` shows a fixed remote command with script bytes sent through stdin.
- `powershell-ssh-newlines.md` explains why `\n` should not be trusted across PowerShell → SSH → remote shell quoting.
- `powershell-select-object.md` shows safe range syntax for `Select-Object -Index`.
- `ripgrep-leading-dash.md` shows why `rg -- "-pattern"` is required when a pattern starts with `-`.
- `remote-script-boundaries.md` shows why multi-level here-doc strings are fragile.

## Hook examples

`cursor-hooks/` contains a dependency-free Cursor `beforeShellExecution` hook example. It blocks `rsync -e "ssh -n ..."`, blocks bare PowerShell ranges, and asks for review when SSH commands contain literal `\n` newline escapes, obvious `rg "-pattern"` searches without `--`, or Bash nounset commands with `$...` inside double quotes.

## Agent instruction snippets

Use the managed snippets in `snippets/` for root agent instruction files such as `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`, or Cursor rule files.
