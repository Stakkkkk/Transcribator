---
name: safe-shell-io
description: Execute external commands with exact argv semantics and without accidental shell re-parsing. Use when commands contain user-controlled text, non-ASCII characters, spaces in paths, nested quotes, shell metacharacters, JSON/YAML/SQL/regex payloads, multiline values, stdin/stdout text, or after any quoting, parsing, or command-encoding failure.
---

# Безопасный запуск команд

## Выбрать путь

1. Использовать нативный tool/API с массивом аргументов, если он доступен.
2. Для простой команды использовать один shell-слой, literal path и отдельные аргументы.
3. Для сложных или пользовательских значений создать JSON-spec и выполнить `scripts/run-from-spec.mjs`.

После первой ошибки escaping или парсинга немедленно перейти к пункту 3. Не тратить попытки на новые комбинации кавычек.

## Не допускать повторный парсинг

- Не собирать строку команды из пользовательских данных.
- Не вкладывать `powershell -Command`, `cmd /c`, `sh -c` или `bash -c` без необходимости.
- Не передавать JSON, SQL, regex или многострочный текст как фрагмент shell-синтаксиса.
- Для CLI tools с option parsing ставить `--` перед user-controlled positional values, которые могут начинаться с `-`; для `rg` используйте `rg -- "-pattern"` или `rg --fixed-strings -- "-literal"`.
- Не использовать `eval`, `Invoke-Expression` и `shell: true`.
- Не помещать секреты в диагностический вывод или spec, который будет сохранён в репозитории.

## Inline interpreter one-liners

Считать `node -e`, `node --eval`, `node -p`, `python -c`, `python3 -c`, `py -c`, `ruby -e`, `perl -e`, `powershell -Command`, `pwsh -Command`, `cmd /c`, `bash -c` и `sh -c` unsafe по умолчанию, если они затрагивают project files, config/env/secrets, JSON/YAML/TOML, regex, non-ASCII data, paths with spaces или код с `$`, кавычками, backticks, braces, brackets, pipes, redirects или command separators.

Не использовать inline interpreter one-liners для redaction или transformation of config output. Использовать один из маршрутов:

- native MCP/API/tool access;
- script file, созданный структурированным редактором или patch API;
- `scripts/run-from-spec.mjs`;
- `scripts/run-node-utf8.mjs --spec <spec.json>`;
- `node_repl`, если он доступен и подходит.

Единственное нормальное исключение — fixed ASCII diagnostics вроде `node --version`, без project data, regex, secrets и nested quoting.

## Config/env/secrets output

При чтении `.env`, `.toml`, `.json`, `.yaml`, `.yml`, service configs или файлов, где вероятны tokens/passwords, не делать redaction через shell regex или inline interpreter code. По возможности парсить структурно и печатать только allowlisted metadata: имена секций, наличие ключей, counts, server names, URL hostnames или форму auth header. Никогда не печатать raw values.

## Remote и PowerShell edge cases

Перед SSH, rsync, SFTP, remote shell, here-doc или долгими remote-операциями прочитайте `../../docs/ru/field-notes.md` и `../../docs/ru/remote-io-recipes.md`.

Применяйте эти правила маршрутизации:

- используйте `ssh -n` только когда SSH-процесс не должен читать stdin родительского процесса; не кладите `ssh -n` внутрь `rsync -e`;
- не передавайте non-ASCII inline Node.js code или literals через PowerShell stdin; используйте `scripts/run-node-utf8.mjs --spec <spec.json>` или script file плюс JSON/Base64 payload;
- не передавайте переводы строк как `\n` через PowerShell/SSH quoting; repeated fixed `echo` допустим только для маленького fixed text, иначе загружайте/стримьте данные или используйте JSON/Base64;
- при отправке Bash из Windows в SSH сначала нормализуйте CRLF в LF; предпочитайте `scripts/remote-bash.mjs <host> <script>`;
- если SSH command содержит pipes, `$`, regex, кавычки, `sed`, `awk` или `grep`, не отправляйте её одной command string; используйте script via stdin/file/spec;
- помните, что `ssh host command args...` всё равно проходит через remote shell; локальная argv-безопасность не защищает сложные remote snippets;
- для сложных remote scripts загружайте script file, передавайте байты через stdin или передавайте данные файлом/Base64 payload вместо многоуровневых here-doc strings;
- под Bash `set -u` не кладите `$...` patterns вроде nginx variables в double quotes; используйте single quotes, fixed-string search или script file;
- для долгих SSH/rsync-задач предпочитайте remote supervision + log + polling, а не привязку процесса к локальному клиенту;
- для PowerShell ranges прочитайте `../../examples/powershell-select-object.md` и используйте `-Index (94..112)` или `-Skip/-First`;
- для PowerShell/SSH newline escapes прочитайте `../../examples/powershell-ssh-newlines.md`;
- перед встраиванием скрипта в строку host-языка прочитайте `../../examples/remote-script-boundaries.md`.

## Запускать Node с UTF-8 данными

Не вставляйте non-ASCII пути или JavaScript literals в inline Node scripts, переданные через PowerShell stdin. Код держите в `.mjs` файле, данные передавайте через UTF-8 JSON spec:

```text
node <skill-dir>/scripts/run-node-utf8.mjs --spec <spec.json>
```

Форма spec:

```json
{
  "script": "scripts/find-instruction.mjs",
  "args": ["Инструкция_агента.md"],
  "stdin": "{\"anchor\":\"Instruction\"}",
  "cwd": "."
}
```

Относительные `script` и `cwd` разрешаются от каталога spec. Helper запускает Node с `shell: false`, отправляет stdin как UTF-8 bytes и строго декодирует child stdout/stderr как UTF-8.

## Запускать remote Bash безопасно

Если Bash script создан или хранится на Windows, не стримьте PowerShell here-string напрямую в `ssh host bash -s`: CRLF может попасть в remote parser. Используйте:

```text
node <skill-dir>/scripts/remote-bash.mjs <host> <script>
```

Helper читает script как strict UTF-8, нормализует `CRLF`/`CR` в `LF` и запускает `ssh <host> bash -s`, передавая нормализованные bytes в stdin. `--print-normalized` показывает точный script перед отправкой.

## Запустить через spec

Создать spec структурированным редактором или patch API в UTF-8 без BOM:

```json
{
  "command": "node",
  "args": ["script.mjs", "Денис: \"точный аргумент\"", "$5 & 10%"],
  "cwd": ".",
  "stdin": "строка 1\nстрока 2\n",
  "stdoutEncoding": "utf8",
  "stderrEncoding": "utf8",
  "timeoutMs": 30000
}
```

Выполнить:

```text
node <skill-dir>/scripts/run-from-spec.mjs <spec.json>
```

Runner использует `spawn` с `shell: false`, передаёт каждый элемент `args` отдельно и строго декодирует текстовый stdout/stderr. Относительные `cwd` и файловые поля разрешаются от каталога spec.

Полную схему читать в `references/spec-format.md` только при использовании дополнительных полей.

## Проверить

Проверить код возврата процесса. Для рискованного пути прогнать канарейку с пробелом, одинарной и двойной кавычкой, `$`, `&`, обратным слешем, переводом строки и не-ASCII символом. Если команда пишет текстовый файл, дополнительно применить `safe-text-io`.
