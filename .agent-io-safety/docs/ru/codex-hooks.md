# Интеграция Codex hooks

[English version](../codex-hooks.md)

Codex hooks — enforcement-слой к правилам и skills этого комплекта. Используйте их, когда инструкций недостаточно и нужны проверки вокруг tool calls.

Официальная документация: <https://developers.openai.com/codex/hooks>

## Когда использовать Codex hooks

Hooks подходят для механических границ:

- `PreToolUse` для `Bash` перед запуском shell-команд;
- `PermissionRequest` для операций, чувствительных к approval;
- `PostToolUse` для анализа shell output или учёта изменённых файлов;
- `Stop` для финальных quality gates.

`AGENTS.md`, `RULE.md` и skills оставляйте для reasoning workflow. В hooks кладите только узкие детерминированные проверки.

## Рекомендуемая политика

Начните с этих проверок:

- deny для `rsync -e "ssh -n ..."`, потому что rsync нужен SSH stdin/stdout channel;
- ask или deny для SSH-команд с literal `\n` escapes, особенно из PowerShell;
- deny для PowerShell `Select-Object -Index 94..112`; требовать `-Index (94..112)` или `-Skip/-First`;
- deny для inline interpreter one-liners вокруг config/env/secrets; требовать native tool/API, script file, `run-from-spec.mjs`, `run-node-utf8.mjs --spec` или `node_repl`, и allowlisted output;
- ask для сложных inline interpreter one-liners вроде `node -e`, `python -c`, `powershell -Command`, `cmd /c`, `bash -c` или `sh -c` с `$`, regex, pipes, nested quotes или redaction logic;
- ask для `rg "-pattern"` до `--`; требовать `rg -- "-pattern"` или `rg --fixed-strings -- "-literal"` для literal user text;
- ask для Bash `set -u` / `set -o nounset` с `$...` внутри double quotes; требовать single quotes, fixed-string search или script file для config text;
- после правок text files запускать `skills/safe-text-io/scripts/inspect-text.mjs`, если hook payload даёт достаточно file context.

## Шаблон конфигурации

Codex hook configuration лежит в `.codex/hooks.json` или inline `[hooks]` tables в `.codex/config.toml`.

Точная command payload shape может отличаться между Codex surfaces и tools. Считайте следующий блок стартовым шаблоном и проверьте его через `/hooks` и локальный dry run перед тем, как на него полагаться:

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

Если ваша установка Codex передаёт JSON не так, как Cursor `beforeShellExecution`, сохраните policy logic, но адаптируйте payload parser. Не включайте silent fail-closed, пока не проверили hook input и trust flow в своей среде.

## Замечание по распространению

Codex hooks специфичны для Codex. Этот проект держит их как optional integration, а не обязательный шаг installer, чтобы core kit оставался переносимым между агентами.
