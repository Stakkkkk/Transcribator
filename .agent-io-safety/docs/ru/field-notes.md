# Полевые заметки: реальные I/O-ловушки

[English version](../field-notes.md)

Эти заметки собраны из практической работы агентов. Не всё здесь является core rule, но это хорошие подсказки для маршрутизации.

## UTF-8 байты валидны, но вывод в терминале выглядит как mojibake

PowerShell, terminal code page, кодировка stdout инструмента и байты файла — разные границы. Если UTF-8 файл выглядит повреждённым только на экране:

1. не переписывайте файл;
2. сначала проверьте байты:

```sh
node skills/safe-text-io/scripts/inspect-text.mjs path/to/file.md
```

3. если нужен stdout через terminal/tool для Markdown, JSON, rules или skills, читайте строгим UTF-8 reader:

```sh
node skills/safe-text-io/scripts/read-text.mjs path/to/file.md
```

4. не чините PowerShell output inline snippets через `[Console]::OutputEncoding` или `[System.Text.UTF8Encoding]::new($false)`;
5. при необходимости посмотрите hex bytes или прочитайте файл другим известным decoder;
6. считайте terminal/tool output подозрительным, пока byte-level проверки не подтвердят повреждение.

## Windows PowerShell + SSH + UTF-8 + secrets

Это зона повышенного риска: данные проходят через PowerShell, Node.js, SSH, remote shell и terminal rendering.

### PowerShell to Node stdin может повредить non-ASCII literals

Если inline Node.js script передаётся через PowerShell stdin, кириллические пути или строковые literals могут приехать как `????`.

Не кладите non-ASCII пути или literals прямо в inline scripts. Предпочитайте:

- настоящий `.mjs` script file;
- UTF-8 JSON spec с args/stdin;
- Base64 для opaque payload;
- ASCII anchors плюс filesystem/API lookup, если точное имя файла может быть mojibake в terminal output.

Используйте:

```sh
node skills/safe-shell-io/scripts/run-node-utf8.mjs --spec node-task.json
```

### PowerShell here-strings могут отправить CRLF в remote Bash

Script, отправленный из Windows here-string в `ssh host bash -s`, может сохранить `\r\n`. Remote tools вроде `sed`, `awk` или shell parsers тогда получают лишний `\r`.

Перед отправкой нормализуйте к LF:

```sh
node skills/safe-shell-io/scripts/remote-bash.mjs host script.sh
```

`--print-normalized` показывает точный script перед SSH.

### Сложные SSH command strings не являются одним безопасным слоем

Pipes, `$`, regex, кавычки, `sed`, `awk` и `grep` внутри `ssh host "..."` проходят через несколько shells. Даже локальный argv array не убирает remote shell layer: `ssh host command args...` всё равно собирается для remote shell execution.

Для сложных remote snippets отправляйте script через stdin/file/spec, а не one-line SSH command.

### Inline interpreter one-liners могут обойти безопасный маршрут

`node -e`, `python -c`, `powershell -Command`, `cmd /c`, `bash -c`, `sh -c` и похожие one-liners легко недооценить. Если они читают config/env/secrets, парсят structured files, делают redaction или содержат regex, `$`, nested quotes, pipes либо non-ASCII данные, считайте их unsafe.

Используйте native tool/API, настоящий script file, `run-from-spec.mjs`, `run-node-utf8.mjs --spec` или `node_repl`. Для secrets печатайте только allowlisted metadata: имена секций, URL hosts, counts, booleans и признаки наличия auth; не делайте inline-redaction raw values в shell-команде.

### Bash `set -u` раскрывает `$...` внутри double quotes

Под `set -u` команда вроде `grep "map $http_authorization"` может попытаться раскрыть unset Bash variable. Для nginx или shell-looking config text:

- предпочитайте single quotes: `grep 'map $http_authorization'`;
- по возможности используйте fixed-string matching;
- сложные проверки кладите в script file вместо nested quoting.

### Mojibake из `rg --files` — только display evidence

Кириллические имена файлов, показанные как `????` в terminal output, не доказывают повреждение filesystem bytes или содержимого файлов. Проверяйте через filesystem APIs, `inspect-text.mjs` или `read-text.mjs` до любых изменений.

### Smoke tests должны редактировать secrets

Smoke tests, которые читают `Authorization` или `Bearer`, должны печатать только status, counts, server names и несекретную metadata. Стандартная редекция логов:

```js
const safe = text.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer <redacted>");
```

Никогда не печатайте raw tokens из MCP, HTTP или service configs.

## `ssh -n` полезен, но не внутри `rsync -e`

`ssh -n` запрещает SSH-команде читать stdin. Это помогает вложенным read-only SSH-командам, которые не должны съесть stdin родительского скрипта.

Не используйте `ssh -n` внутри `rsync -e "ssh -n ..."`. `rsync` использует stdin/stdout SSH-процесса как protocol channel, и `ssh -n` может сломать передачу.

## Многоуровневые here-doc могут повредить строковые литералы

Если Python создаёт shell here-doc, внутри которого лежит Python-код, слои escaping могут превратить `\\n` в реальный перевод строки внутри удалённого строкового литерала.

Предпочитайте:

- upload script file через SFTP/scp;
- raw bytes через stdin;
- Base64 для data payload;
- фиксированные и маленькие remote command strings.

См. `docs/ru/remote-io-recipes.md`.

## PowerShell + SSH может превратить `\n` в `n...n`

Если PowerShell собирает SSH command string с `\n`, эта последовательность может быть обработана не тем слоем, остаться literal или превратиться в output вида `n...n`.

Не полагайтесь на `\n` escaping через цепочку PowerShell → SSH → remote shell. Для маленького фиксированного текста используйте повторяющиеся fixed `echo` commands. Для настоящих payload загружайте файл, передавайте stdin или используйте JSON/Base64.

См. `examples/powershell-ssh-newlines.md`.

## Paramiko SFTP rename может не перезаписать файл

`sftp.rename(tmp, target)` может упасть, если `target` уже существует. Некоторые серверы возвращают общий `Failure`.

Более безопасный паттерн:

1. предпочитать `posix_rename`, если доступен;
2. иначе явно удалить target, затем rename;
3. помнить, что remove+rename не атомарен;
4. проверить итоговый файл.

## PowerShell ranges требуют expression syntax

Такой вариант может упасть или распарситься неожиданно:

```powershell
Select-Object -Index 94..112
```

Предпочитайте:

```powershell
Select-Object -Index (94..112)
```

или:

```powershell
Select-Object -Skip 94 -First 19
```

См. `examples/powershell-select-object.md`.

## `rg` patterns, начинающиеся с `-`, требуют `--`

`rg` воспринимает аргумент, начинающийся с `-`, как option. Если search pattern сам может начинаться с `-`, сначала остановите option parsing:

```sh
rg -- "-TODO"
rg --fixed-strings -- "-literal-user-text"
```

См. `examples/ripgrep-leading-dash.md`.

## Долгие SSH/rsync операции должны переживать disconnect клиента

Долгие удалённые операции не должны зависеть от живого локального терминала или SSH-сессии.

Предпочитайте remote supervision:

- `nohup ... >log 2>&1 &`;
- `systemd-run --user ...`;
- `tmux` / `screen`, если policy разрешает;
- remote log file + polling.

## Non-UTF-8 файлы нельзя “лечить” replacement decoding

Если файл невалиден как UTF-8, а нужная правка ASCII-only, byte-level ASCII replacement безопаснее, чем decoding всего файла с replacement characters.

Используйте:

```sh
node skills/safe-text-io/scripts/replace-ascii-bytes.mjs --input file --in-place --search old/ascii/path --replace new/ascii/path
```

Не используйте это для non-ASCII правок или неизвестных semantic changes.

## Floating Docker tags — риск миграции

Это не core shell/text I/O rule, но полезный deployment-safety recipe.

Не делайте слепой `docker pull` floating tags вроде `latest` или unpinned `IMAGE_TAG` при миграции. Сначала сравните image ID/digest. Если важно точное сохранение, используйте `docker save` и `docker load`.
