# Слои рядом с project skills

[English version](../project-skills-layering.md)

Agent I/O Safety Kit не заменяет проектные инструкции и предметные skills. Он находится ниже уровнем и отвечает за хрупкие shell/text I/O границы.

## Ментальная модель

```text
system and user instructions
→ project instructions
→ domain/project skill
→ Agent I/O Safety rule
→ safe-shell-io / safe-text-io
→ deterministic script
→ verification
```

## За что отвечает project skill

Проектный или предметный skill должен решать:

- какие тесты важны;
- какую build-команду запускать;
- что должен содержать сгенерированный файл;
- какие проектные соглашения действуют;
- какой внешний linter или formatter нужен.

## За что отвечает этот комплект

Agent I/O Safety Kit решает, как безопасно выполнить I/O после того, как project skill выбрал операцию:

- точный argv вместо хрупких command strings;
- отсутствие повторного shell-разбора пользовательских данных;
- явная политика UTF-8/BOM/окончаний строк;
- детерминированная проверка и перекодирование текста;
- предупреждения перед автоматическим исправлением.

## Пример

Если project skill говорит:

```text
Run the integration test with the selected customer name.
```

и customer name содержит пробелы, кавычки, `$`, `&` или не-ASCII текст, project skill всё ещё отвечает за смысл теста. Этот комплект отвечает за transport boundary и должен маршрутизировать команду через `safe-shell-io` или command spec.

## Правило для агентов

Если одновременно применимы project skill и этот комплект:

1. используйте project skill, чтобы понять, что должно произойти;
2. используйте Agent I/O Safety Kit, чтобы выбрать безопасный shell/text I/O путь;
3. запускайте проектную валидацию после стабилизации I/O границы.
