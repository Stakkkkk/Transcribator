# Codex hooks integration

[Russian version](ru/codex-hooks.md)

Codex hooks are the enforcement counterpart to this kit's rules and skills. Use them when guidance is not enough and you want checks around tool calls.

Official docs: <https://developers.openai.com/codex/hooks>

## When to use Codex hooks

Use hooks for mechanical boundaries:

- `PreToolUse` for `Bash` before shell commands run;
- `PermissionRequest` for approval-sensitive operations;
- `PostToolUse` for shell output review or edited-file accounting;
- `Stop` for final quality gates.

Keep `AGENTS.md`, `RULE.md`, and skills for the reasoning workflow. Put only narrow, deterministic checks in hooks.

## Recommended policy

Start with these checks:

- deny `rsync -e "ssh -n ..."` because rsync needs the SSH stdin/stdout channel;
- ask or deny SSH commands containing literal `\n` escapes, especially from PowerShell;
- deny PowerShell `Select-Object -Index 94..112`; require `-Index (94..112)` or `-Skip/-First`;
- deny inline interpreter one-liners around config/env/secrets; require a native tool/API, a script file, `run-from-spec.mjs`, `run-node-utf8.mjs --spec`, or `node_repl`, and allowlisted output;
- ask on complex inline interpreter one-liners such as `node -e`, `python -c`, `powershell -Command`, `cmd /c`, `bash -c`, or `sh -c` with `$`, regex, pipes, nested quotes, or redaction logic;
- ask on `rg "-pattern"` before `--`; require `rg -- "-pattern"` or `rg --fixed-strings -- "-literal"` for literal user text;
- ask on Bash `set -u` / `set -o nounset` with `$...` inside double quotes; require single quotes, fixed-string search, or a script file for config text;
- after text-file edits, run `skills/safe-text-io/scripts/inspect-text.mjs` where the hook payload provides enough file context.

## Configuration template

Codex hook configuration lives in `.codex/hooks.json` or inline `[hooks]` tables in `.codex/config.toml`.

The exact command payload shape can vary by Codex surface and tool. Treat the following as a starting template, then verify it with `/hooks` and a local dry run before relying on it:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node .agent-io-safety/examples/cursor-hooks/io-safety-hook.mjs --event beforeShellExecution",
            "timeout": 30,
            "statusMessage": "Checking shell I/O safety"
          }
        ]
      }
    ]
  }
}
```

If your Codex installation passes a different JSON shape than Cursor's `beforeShellExecution`, keep the policy logic but adapt the payload parser. Do not silently fail closed until you have verified the hook input and trust flow in your environment.

## Distribution note

Codex hooks are Codex-specific. This project keeps them as an optional integration rather than a required installer step so the core kit remains portable across agents.
