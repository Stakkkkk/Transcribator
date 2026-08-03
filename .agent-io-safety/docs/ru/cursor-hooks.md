# Интеграция Cursor hooks

[English version](../cursor-hooks.md)

Cursor Hooks добавляют enforcement-слой поверх правил и skills из этого комплекта.

Используйте эту интеграцию, когда нужно, чтобы Cursor проверял рискованные действия до того, как модель положится на память или дисциплину.

Официальная документация: <https://cursor.com/docs/hooks>

## Что дают hooks

Rules и skills — advisory-слой: агент должен сам решить прочитать и выполнить их. Hooks запускаются на lifecycle-границах: shell execution, file reads, file edits, MCP calls, prompt submission и stop.

Хорошие первые точки enforcement:

- `beforeShellExecution` — блокировать или спрашивать на опасных формах команд;
- `afterShellExecution` — аудит вывода на mojibake и похожие признаки;
- `beforeReadFile` — запрещать чтение чувствительных файлов;
- `afterFileEdit` — запускать форматтеры или text checks после правок;
- `beforeMCPExecution` — gate для рискованных MCP tool calls.

Cursor command hooks получают JSON через stdin и возвращают JSON через stdout. Для поддерживаемых pre-action событий hook может вернуть `permission: "allow"`, `"ask"` или `"deny"`. Exit code `2` тоже блокирует действие. Для security-critical проверок ставьте `failClosed: true`.

## Минимальная настройка в проекте

После deploy комплекта в целевой проект скопируйте пример:

```sh
mkdir -p .cursor
cp .agent-io-safety/examples/cursor-hooks/hooks.json .cursor/hooks.json
```

Пример запускает:

```sh
node .agent-io-safety/examples/cursor-hooks/io-safety-hook.mjs --event beforeShellExecution
```

Сейчас он ловит семь практических ловушек:

- `rsync -e "ssh -n ..."` — deny, потому что rsync использует SSH stdin/stdout как protocol channel;
- `Select-Object -Index 94..112` — deny; используйте `-Index (94..112)` или `-Skip/-First`;
- inline interpreter one-liners вокруг config/env/secrets — deny; используйте native tool/API, script file, `run-from-spec.mjs`, `run-node-utf8.mjs --spec` или `node_repl`, а в вывод печатайте только allowlisted metadata;
- сложные inline interpreter one-liners вроде `node -e`, `python -c`, `powershell -Command`, `cmd /c`, `bash -c` или `sh -c` с `$`, regex, pipes, nested quotes или redaction logic — ask for review и route к script/spec path;
- SSH-команды с literal `\n` escapes — ask for review, потому что PowerShell/SSH quoting может дать remote output вида `n...n`;
- `rg "-pattern"` до `--` — ask for review, потому что ripgrep воспринимает значения с начальным `-` как options, пока option parsing не остановлен;
- Bash `set -u` / `set -o nounset` с `$...` внутри double quotes — ask for review, потому что config text вроде nginx variables может раскрыться как unset shell variable.

## Cloud agents

Cursor cloud agents могут читать project hooks из `.cursor/hooks.json`. User-level hooks из `~/.cursor/hooks.json` в cloud agents недоступны. Поддержка cloud отличается по hook events, поэтому держите project hooks command-based и тестируйте local/cloud пути отдельно.

## Дизайн

Hooks должны быть маленькими и детерминированными. Hook решает, безопасна ли форма операции; подробный remediation должен отправлять агента обратно в:

- `docs/ru/field-notes.md`;
- `docs/ru/remote-io-recipes.md`;
- `examples/powershell-ssh-newlines.md`;
- `examples/powershell-select-object.md`;
- `examples/ripgrep-leading-dash.md`;
- `skills/safe-shell-io/SKILL.md`.

Hooks не заменяют комплект. Они принудительно закрывают механические риски и возвращают агента к безопасному deterministic path.
