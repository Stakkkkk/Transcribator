# Правило безопасного shell и текстового I/O

## Обязательный маршрут

Перед первой связанной операцией определить границу риска и загрузить нужный skill:

- Команда содержит пользовательский текст, сложные аргументы, пробелы в путях, кавычки, shell-метасимволы, JSON/YAML/SQL/regex, многострочные или не-ASCII значения — прочитать `./skills/safe-shell-io/SKILL.md`.
- Операция читает, создаёт, изменяет, генерирует или преобразует текстовые файлы; важны кодировка, BOM или окончания строк — прочитать `./skills/safe-text-io/SKILL.md`.
- Команда создаёт текстовый файл или передаёт текст между процессами — применить оба skills.

Пути разрешать относительно этого файла. Не считать автоматическое обнаружение skills обязательным.

## Приоритет политики

Определять формат текста в следующем порядке:

1. явное требование пользователя;
2. инструкции проекта;
3. `.editorconfig`, `.gitattributes`, настройки инструмента и существующий формат файла;
4. при отсутствии политики — UTF-8 без BOM и LF для нового текста.

Не угадывать legacy-кодировку и не переписывать файл после декодирования с заменой символов. Если в non-UTF-8 или unknown-encoding файле нужно заменить только ASCII-последовательность байтов, использовать `safe-text-io/scripts/replace-ascii-bytes.mjs` вместо декодирования всего файла как текста. При неоднозначности остановить преобразование, сообщить обнаруженные байты/BOM и запросить решение.

## Безопасные способы работы

1. Для обычного редактирования файлов использовать структурированный редактор или patch API, а не shell-перенаправление.
2. Для простых команд использовать один слой оболочки и передавать данные отдельными аргументами.
3. Не вкладывать `sh -c`, `cmd /c`, `powershell -Command` или аналог внутрь уже работающей оболочки без неизбежной причины.
4. Не интерполировать пользовательские значения в командную строку, скрипт, regex или JSON.
5. Для сложного argv создать UTF-8 JSON-spec и запустить `safe-shell-io/scripts/run-from-spec.mjs`.
6. Для чтения `RULE.md`, `SKILL.md`, Markdown, JSON или другого UTF-8 текста через terminal output использовать `safe-text-io/scripts/read-text.mjs <path>`; не использовать PowerShell `Get-Content` плюс `[Console]::OutputEncoding`.
7. Для анализа кодировки, преобразования и ASCII-safe byte replacement использовать скрипты `safe-text-io`; не полагаться на дефолты shell.
8. Не встраивать `[System.Text.UTF8Encoding]::new($false)` и похожие encoding fixes внутрь `powershell -Command`; вложенный quoting может изменить `$false` или сломать команду.
9. Не передавать non-ASCII inline Node.js code или literals через PowerShell stdin; использовать `safe-shell-io/scripts/run-node-utf8.mjs --spec <spec.json>` или script file плюс JSON/Base64 payload.
10. Не отправлять сложные SSH commands с pipes, `$`, regex, кавычками, `sed`, `awk` или `grep` одной command string; использовать `safe-shell-io/scripts/remote-bash.mjs`, stdin, файл или spec.
11. После первой ошибки quoting, парсинга или mojibake прекратить перебор вариантов и перейти к детерминированному пути из skills.

## Inline interpreter one-liners

Команды вроде `node -e`, `node --eval`, `node -p`, `python -c`, `python3 -c`, `py -c`, `ruby -e`, `perl -e`, `powershell -Command`, `pwsh -Command`, `cmd /c`, `bash -c` и `sh -c` по умолчанию unsafe, если они читают или преобразуют пользовательские/проектные файлы, config/env/secrets, JSON/YAML/TOML, regex, пути с пробелами, non-ASCII текст или содержат `$`, кавычки, backticks, `{}`, `[]`, `|`, `&`, `;`, `<` или `>`.

В этих случаях использовать один из маршрутов:

- native MCP/API/tool access;
- отдельный script file, созданный через структурированный редактор или patch API;
- `safe-shell-io/scripts/run-from-spec.mjs`;
- `safe-shell-io/scripts/run-node-utf8.mjs --spec <spec.json>`;
- `node_repl`, если он доступен и подходит.

Узкое исключение — fixed ASCII diagnostics без пользовательских/проектных данных, regex, secrets и вложенных кавычек, например `node --version`.

## Config/env/secrets

Если команда читает `.env`, `.toml`, `.json`, `.yaml`, `.yml`, service config files или файлы, где вероятны tokens/passwords, не делать redaction inline в shell-команде. Читать через безопасный script/API, по возможности парсить структурно и печатать только allowlist: имена секций, наличие ключей, URL hostnames, counts, server names или форму auth header. Никогда не печатать raw secret values.

## Внешние инструменты

- Если в проекте уже настроен специализированный линтер, formatter, schema validator или scanner для затронутого типа файла, запускать его после того, как стабилизированы shell/text I/O границы этим комплектом.
- Отсутствие внешнего инструмента не заменять самовольным скачиванием или установкой. Сообщить, какой инструмент полезен, дать официальный источник и запросить явное разрешение на установку.
- Внешние инструменты не отменяют базовые гарантии комплекта: точную передачу argv, строгую проверку декодирования и явную политику BOM/окончаний строк.
- Детектор кодировки использовать только как диагностическую подсказку. Не переписывать файл по результату вероятностного определения без явного решения пользователя.
- Для обзора рекомендуемых инструментов см. `docs/external-tools.md`.

## Project skills

- Этот комплект не заменяет проектные или предметные skills. Он находится ниже уровнем и контролирует shell/text I/O границы.
- Используйте project skills, чтобы решить, какая операция нужна; используйте этот комплект, чтобы выполнить shell/text I/O безопасно.
- Модель слоёв описана в `docs/ru/project-skills-layering.md`.

## Рецепты из практики

Читайте `docs/ru/field-notes.md`, если операция затрагивает одну из известных ловушек:

- terminal/tool output показывает mojibake, но байты файла могут быть корректными;
- используются SSH, rsync, SFTP, remote shell, here-doc или долгие remote-операции;
- Windows/PowerShell передаёт Node.js scripts или данные с non-ASCII текстом;
- inline interpreter one-liners читают config/env/secrets, structured files, regex или non-ASCII data;
- Windows/PowerShell отправляет Bash в SSH, особенно из here-string или CRLF source file;
- SSH command strings содержат pipes, `$`, regex, кавычки, `sed`, `awk`, `grep` или nginx variables под `set -u`;
- PowerShell/SSH command strings содержат `\n` newline escapes;
- используются PowerShell ranges или выборка окон строк;
- CLI search patterns или user-controlled positional values могут начинаться с `-`, особенно `rg` patterns;
- в non-UTF-8 файле нужна ASCII-only замена байтов;
- мигрируются или сохраняются плавающие Docker tags.

Читайте `docs/ru/remote-io-recipes.md` перед составлением многоуровневых remote-команд. Используйте `safe-shell-io/scripts/run-node-utf8.mjs` для Node scripts/data, проходящих через PowerShell, `safe-shell-io/scripts/remote-bash.mjs` для Bash scripts, проходящих из Windows в SSH, `examples/powershell-select-object.md` для PowerShell range syntax, `examples/powershell-ssh-newlines.md` для PowerShell/SSH newline escaping, `examples/ripgrep-leading-dash.md` для `rg -- "-pattern"` и `examples/remote-script-boundaries.md` перед встраиванием скриптов в строки host-языка.

## Optional hook enforcement

Если host agent поддерживает lifecycle hooks, используйте их как механический enforcement-слой вокруг этого правила. См. `docs/ru/cursor-hooks.md` и `docs/ru/codex-hooks.md`. Hooks не заменяют skills; они блокируют или маршрутизируют самые очевидные unsafe tool-call shapes.

## PowerShell

- Всегда учитывать различие Windows PowerShell 5.1 и PowerShell 7+.
- В Windows PowerShell 5.1 не полагаться на `Get-Content`, `Set-Content`, `Out-File`, `$OutputEncoding`, активную code page и перенаправление без явной проверки формата.
- Если terminal output PowerShell показывает mojibake при чтении инструкций, не встраивать fixes через `[Console]::OutputEncoding` или `[System.Text.UTF8Encoding]::new($false)`; читать файл через `node .agent-io-safety/skills/safe-text-io/scripts/read-text.mjs <path>`.
- Для совместимых с PowerShell 5.1 `.ps1` предпочитать ASCII-only. Если не-ASCII необходим, явно выбрать поддерживаемую кодировку с BOM и зафиксировать исключение в политике проекта.
- Использовать `-LiteralPath` для путей и массивы/splatting для аргументов.

## Проверка результата

Перед завершением задачи:

1. проверить затронутые текстовые файлы через `inspect-text.mjs`;
2. подтвердить ожидаемые кодировку, BOM и окончания строк;
3. выполнить релевантную команду или тест с данными, содержащими кавычки и не-ASCII символы;
4. убедиться, что ни один этап не использовал неявное повторное shell-разборивание данных.

Явная политика проекта может изменить формат файлов, но не отменяет точную передачу аргументов, строгую проверку декодирования и запрет на пробное «лечение» повреждённого текста.
