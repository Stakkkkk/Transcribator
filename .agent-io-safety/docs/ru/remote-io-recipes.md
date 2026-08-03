# Рецепты remote I/O

[English version](../remote-io-recipes.md)

Удалённое выполнение объединяет несколько хрупких границ. Рассматривайте каждую границу отдельно.

```text
local process → local argv/shell → transport → remote shell → remote interpreter → remote files
```

## Держите remote command strings фиксированными

Плохой паттерн:

```python
command = f"ssh host \"python3 - <<'PY'\nprint('{user_text}')\nPY\""
```

Здесь смешаны Python string escaping, local shell quoting, SSH command transport, remote shell parsing и remote Python parsing.

Более безопасные паттерны:

- upload script file через SFTP/scp, затем запуск фиксированной команды;
- script bytes через stdin;
- data payload через Base64 или JSON files;
- через remote command line передавать только стабильные пути или фиксированные flags.

Если remote snippet содержит pipes, `$`, regex, кавычки, `sed`, `awk` или `grep`, считайте его скриптом, а не SSH one-liner. Локальный argv array не убирает remote shell parser: `ssh host command args...` всё равно интерпретируется удалённо.

## Windows to remote Bash

PowerShell here-strings и файлы, созданные на Windows, могут протащить CRLF в `ssh host bash -s`. Перед отправкой нормализуйте scripts к LF:

```sh
node skills/safe-shell-io/scripts/remote-bash.mjs host script.sh
```

Для локальной проверки используйте `--print-normalized`:

```sh
node skills/safe-shell-io/scripts/remote-bash.mjs --print-normalized host script.sh
```

Helper читает script как strict UTF-8, отклоняет UTF-16/invalid UTF-8, преобразует `CRLF`/`CR` в `LF` и отправляет bytes в `ssh host bash -s` без local shell.

## PowerShell/SSH newline escapes

Не передавайте переводы строк как `\n` через PowerShell → SSH → remote shell quoting. В зависимости от слоёв remote side может увидеть literal backslash-n, реальный перевод строки не в том месте или output вида `n...n`.

Для маленького фиксированного output повторяющиеся `echo` commands понятнее, чем cross-layer newline escaping:

```powershell
ssh host "echo 'line 1'; echo 'line 2'"
```

Для generated или user-controlled payloads не используйте `echo`. Загружайте файл, передавайте bytes через stdin или отправляйте JSON/Base64 data и декодируйте удалённо.

См. `examples/powershell-ssh-newlines.md`.

## `ssh -n`

Используйте `ssh -n`, когда вложенная SSH-команда не должна читать stdin родительского скрипта.

Не используйте `ssh -n` внутри `rsync -e`, потому что rsync использует SSH stdin/stdout как protocol channel.

## Долгие удалённые операции

Не держите долгие миграции привязанными к локальному SSH-окну.

Предпочитайте:

```sh
nohup ./long-task.sh >long-task.log 2>&1 &
```

или:

```sh
systemd-run --user --unit agent-long-task ./long-task.sh
```

Затем polling:

```sh
ssh host tail -n 100 long-task.log
ssh host test -f long-task.done
```

## SFTP atomic-ish replace

Для Paramiko-style SFTP clients:

1. загрузите файл во временный путь в той же директории;
2. по возможности проверьте size/hash;
3. используйте `posix_rename(tmp, target)`, если доступен;
4. fallback `remove(target)` затем `rename(tmp, target)` применять только если atomic replacement недоступен и такой риск приемлем;
5. проверьте итоговый target.

Задокументируйте fallback, потому что remove+rename не атомарен.

## Кодировка remote text

Кодировка remote stdout — отдельная граница. Если remote output выглядит повреждённым:

- проверьте байты remote file;
- проверьте output encoding удалённой программы;
- проверьте local decoder;
- не переписывайте remote files только по виду terminal output.
