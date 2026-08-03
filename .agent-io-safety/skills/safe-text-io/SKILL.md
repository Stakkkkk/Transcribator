---
name: safe-text-io
description: Inspect, read, create, edit, validate, and transcode text with explicit encoding, BOM, and line-ending semantics. Use for non-ASCII text, generated files, PowerShell 5.1 scripts, mojibake, UTF-8/UTF-16/legacy encoding questions, BOM problems, newline normalization, or any file operation where shell defaults could alter bytes.
---

# Безопасный текстовый I/O

## Определить политику

Выбрать формат в порядке приоритета:

1. явное требование пользователя;
2. инструкции проекта;
3. `.editorconfig`, `.gitattributes`, конфигурация инструмента и существующие байты файла;
4. для нового текста без политики — UTF-8 без BOM и LF.

Не угадывать legacy-кодировку. Не декодировать с replacement characters и не сохранять результат поверх исходника.

## Выбрать операцию

- Для обычной правки использовать структурированный редактор или patch API.
- Для чтения Markdown, JSON, rules, skills или другого UTF-8 текста через terminal/tool boundary запускать `scripts/read-text.mjs`.
- Для диагностики запустить `scripts/inspect-text.mjs`.
- Для явного преобразования использовать `scripts/transcode-text.mjs`.
- Для ASCII-only правок в non-UTF-8 или unknown-encoding файлах использовать `scripts/replace-ascii-bytes.mjs`.
- Для команды, которая генерирует текст, дополнительно применить `safe-shell-io` и указать кодировку stdout.

Не использовать shell redirection, `Set-Content`, `Out-File`, `echo` или неявный `Get-Content`, если их точная байтовая семантика не проверена для текущей версии оболочки.

## Читать текст безопасно

Когда агенту нужно прочитать текст через stdout, особенно на Windows или PowerShell, используйте строгий reader:

```text
node <skill-dir>/scripts/read-text.mjs <path> [<path> ...]
```

Он читает bytes напрямую, принимает UTF-8 с BOM и без BOM, отклоняет UTF-16 BOM и невалидный UTF-8, убирает UTF-8 BOM только для вывода и пишет UTF-8 bytes в stdout.

Используйте его для `RULE.md`, `SKILL.md`, Markdown, JSON и других instruction files, когда границей является terminal output. Не чините mojibake через `Get-Content`, `[Console]::OutputEncoding` или inline `powershell -Command` encoding snippets вроде `[System.Text.UTF8Encoding]::new($false)`.

## Проверить файлы

Диагностика одного файла или каталога:

```text
node <skill-dir>/scripts/inspect-text.mjs <path> [<path> ...]
```

Полезные строгие флаги:

- `--fail-on-bom` — запретить любой BOM;
- `--eol lf|crlf` — проверить окончания строк;
- `--ps51-safe` — потребовать ASCII-only либо UTF-8 BOM для PowerShell 5.1;
- `--json` — вернуть машинно-читаемый отчёт.

Невалидный UTF-8 и UTF-16 всегда возвращают ошибку. Бинарные файлы пропускаются.

## Преобразовать явно

```text
node <skill-dir>/scripts/transcode-text.mjs --input <source> --output <target> --source-encoding auto --target-encoding utf8 --bom none --eol preserve
```

Не перезаписывать существующий target без `--force`. Для изменения исходника на месте передать `--in-place` и не указывать `--output`. Для предварительного сравнения добавить `--check`.

Подробную матрицу читать в `references/encoding-policy.md` при работе с PowerShell, UTF-16 или существующей политикой проекта.

## Заменить ASCII-байты без декодирования

Если файл не проходит строгую UTF-8 проверку, но нужная правка — только замена ASCII-последовательности байтов, не декодируйте весь файл. Используйте byte replacement tool:

```text
node <skill-dir>/scripts/replace-ascii-bytes.mjs --input <source> --output <target> --search old/ascii --replace new/ascii
```

`--in-place` используйте только когда действительно нужно изменить исходник. Для явных байтовых последовательностей есть `--search-hex` / `--replace-hex`. Для смысловых non-ASCII правок эта утилита не подходит.

## PowerShell 5.1

Для переносимых `.ps1` предпочитать ASCII-only в UTF-8 без BOM. Если скрипт обязан содержать не-ASCII и запускаться Windows PowerShell 5.1, использовать UTF-8 BOM как явно задокументированное исключение. Не переносить это исключение на остальные файлы.

После записи повторно запустить `inspect-text.mjs` на затронутых файлах и выполнить потребляющий их инструмент.
