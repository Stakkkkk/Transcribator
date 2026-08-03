# Совместимость с внешними инструментами

[English version](../external-tools.md)

Agent I/O Safety Kit должен оставаться маленьким. Он не заменяет зрелые линтеры, форматтеры, schema validators, secret scanners и платформенные анализаторы.

Используйте этот документ, чтобы решить, когда агенту стоит запустить или предложить внешний инструмент после детерминированных I/O-проверок комплекта.

## Политика

- Не скачивать и не устанавливать внешние инструменты автоматически без явного разрешения пользователя.
- Предпочитать инструменты, уже настроенные в проекте.
- В CI использовать официальные менеджеры пакетов и pinned versions.
- Сначала применять `safe-shell-io` / `safe-text-io`, если риск связан с quoting, argv, кодировкой, BOM, окончаниями строк или mojibake.
- Domain-specific внешние инструменты запускать после стабилизации байтовых и аргументных границ.
- Детекторы кодировки считать диагностической подсказкой, а не разрешением на автоматическую перезапись файла.

## Рекомендуемые опциональные инструменты

| Область | Инструмент | Официальный источник | Когда использовать | Важная граница |
|---|---|---|---|---|
| POSIX shell analysis | ShellCheck | <https://github.com/koalaman/shellcheck> | После правки `.sh`, `.bash`, `.zsh`, Docker shell snippets или CI shell steps. | Не решает транспорт argv между процессами; для этого нужны command specs. |
| POSIX shell formatting | shfmt | <https://github.com/mvdan/sh> | Для форматирования shell-скриптов после безопасной записи содержимого. | Форматтер, не защита от injection. |
| PowerShell analysis | PSScriptAnalyzer | <https://learn.microsoft.com/powershell/utility-modules/psscriptanalyzer/overview> | После правки `.ps1`, `.psm1`, `.psd1`. | Не гарантирует корректную кодировку для Windows PowerShell 5.1; всё равно запускать `inspect-text.mjs --ps51-safe`. |
| EditorConfig policy | editorconfig-checker | <https://github.com/editorconfig-checker/editorconfig-checker> | Если в репозитории есть `.editorconfig`. | Дополняет, но не заменяет строгие UTF-8/BOM проверки. |
| GitHub Actions linting | actionlint | <https://github.com/rhysd/actionlint> | После правки `.github/workflows/*.yml` или `.yaml`. | Проверяет workflow syntax/linting, но не является security scanner. |
| GitHub Actions security | zizmor | <https://github.com/zizmorcore/zizmor> | После правки GitHub Actions workflows или reusable actions. | Security-focused, не общий YAML validator. |
| Secret scanning | Gitleaks | <https://github.com/gitleaks/gitleaks> | Перед публикацией или после правки config/docs/tests, где могли появиться токены. | Возможны false positives; не вставляйте секреты в issue reports. |
| Secret scanning | TruffleHog | <https://github.com/trufflesecurity/trufflehog> | Для более глубокого secret/history scanning. | Может быть медленнее и шумнее лёгких проверок. |
| Line ending conversion | dos2unix | <https://dos2unix.sourceforge.io/> | Явное преобразование окончаний строк по политике проекта. | Не нормализовать массово без требования проекта. |
| Encoding conversion | iconv / GNU libiconv | <https://www.gnu.org/software/libiconv/> | Явное преобразование кодировки, когда source/target известны. | Не использовать guessed legacy encoding для in-place перезаписи. |
| Encoding detection | chardet | <https://chardet.readthedocs.io/> | Диагностическая подсказка для неизвестного текста. | Вероятностный результат требует подтверждения перед записью. |
| Encoding detection | uchardet | <https://www.freedesktop.org/wiki/Software/uchardet/> | Диагностическая подсказка для неизвестного текста. | Вероятностный результат требует подтверждения перед записью. |
| JSON Schema validation | Ajv | <https://github.com/ajv-validator/ajv> | Валидация command specs или JSON schemas в JS/Node workflows. | Schema validation отдельно от command execution. |
| JSON Schema validation | check-jsonschema | <https://github.com/python-jsonschema/check-jsonschema> | Валидация JSON/YAML against schemas в Python-friendly средах. | Опционально; Python не становится core dependency. |
| Multi-tool orchestration | pre-commit | <https://pre-commit.com/> | Несколько локальных проверок перед commit. | Hooks должны быть явными и reviewable. |
| Multi-linter CI | MegaLinter | <https://github.com/oxsecurity/megalinter> | Большие репозитории с broad lint coverage. | Heavyweight; не default для этого комплекта. |

## Правило маршрутизации для агента

Если затронут тип файла со зрелым специализированным инструментом, агент должен:

1. сохранить детерминированные I/O-границы с помощью этого комплекта;
2. проверить затронутые текстовые файлы через `safe-text-io`, если важны кодировка или окончания строк;
3. запустить настроенный проектный formatter/linter/scanner, если он есть;
4. если инструмент отсутствует, предложить официальный способ установки вместо тихого скачивания.

## Пример внешней проверки

После установки комплекта в целевой проект:

```sh
node scripts/doctor.mjs --target /path/to/project --entry AGENTS.md --external
npm test
npm run check:text
```

Если опциональные инструменты установлены, запускать релевантные:

```sh
shellcheck scripts/*.sh
shfmt -w scripts/*.sh
editorconfig-checker
actionlint
zizmor .github/workflows
gitleaks detect --source .
```
