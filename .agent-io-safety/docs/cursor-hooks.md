# Cursor hooks integration

[Russian version](ru/cursor-hooks.md)

Cursor Hooks can add an enforcement layer around the same policies that this kit documents as rules and skills.

Use this integration when you want Cursor to check risky actions before the model relies on memory or discipline.

Official docs: <https://cursor.com/docs/hooks>

## What hooks add

Rules and skills are advisory: the agent must decide to read and follow them. Hooks run at lifecycle boundaries such as shell execution, file reads, file edits, MCP calls, prompt submission, and stop.

Good first enforcement points:

- `beforeShellExecution` — block or ask on dangerous command shapes;
- `afterShellExecution` — audit output for mojibake or other smells;
- `beforeReadFile` — deny reads of sensitive files;
- `afterFileEdit` — run formatters or text checks after edits;
- `beforeMCPExecution` — gate risky MCP tool calls.

Cursor command hooks receive JSON on stdin and return JSON on stdout. A hook can return `permission: "allow"`, `"ask"`, or `"deny"` for supported pre-action events. Exit code `2` also blocks the action. For security-critical checks, set `failClosed: true`.

## Minimal project setup

After deploying this kit to a target project, copy the example hook config:

```sh
mkdir -p .cursor
cp .agent-io-safety/examples/cursor-hooks/hooks.json .cursor/hooks.json
```

The example config runs:

```sh
node .agent-io-safety/examples/cursor-hooks/io-safety-hook.mjs --event beforeShellExecution
```

It currently catches seven field-tested traps:

- `rsync -e "ssh -n ..."` — denied because rsync uses SSH stdin/stdout as its protocol;
- `Select-Object -Index 94..112` — denied; use `-Index (94..112)` or `-Skip/-First`;
- inline interpreter one-liners around config/env/secrets — denied; use a native tool/API, a script file, `run-from-spec.mjs`, `run-node-utf8.mjs --spec`, or `node_repl`, and print only allowlisted metadata;
- complex inline interpreter one-liners such as `node -e`, `python -c`, `powershell -Command`, `cmd /c`, `bash -c`, or `sh -c` with `$`, regex, pipes, nested quotes, or redaction logic — ask for review and route to a script/spec path;
- SSH commands containing literal `\n` escapes — ask for review because PowerShell/SSH quoting can produce remote `n...n` output;
- `rg "-pattern"` before `--` — ask for review because ripgrep treats leading-dash values as options unless option parsing is terminated;
- Bash `set -u` / `set -o nounset` with `$...` inside double quotes — ask for review because config text such as nginx variables can expand as unset shell variables.

## Cloud agents

Cursor cloud agents can load project hooks from `.cursor/hooks.json`. User-level hooks from `~/.cursor/hooks.json` are not available in cloud agents. Cloud support is not identical for every hook event, so keep project hooks command-based and test both local and cloud paths before relying on them.

## Design notes

Keep hooks small and deterministic. The hook should decide whether the operation shape is safe; the detailed remediation should point back to:

- `docs/field-notes.md`;
- `docs/remote-io-recipes.md`;
- `examples/powershell-ssh-newlines.md`;
- `examples/powershell-select-object.md`;
- `examples/ripgrep-leading-dash.md`;
- `skills/safe-shell-io/SKILL.md`.

Hooks do not replace the kit. They enforce the most mechanical parts and route the agent back to the safer deterministic path.
