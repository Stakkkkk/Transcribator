# Языковая политика

[English version](../language-policy.md)

Ядро Agent I/O Safety Kit написано на Node.js осознанно.

## Почему Node.js для ядра

- Node.js 18+ доступен во многих agent и CI средах.
- `spawn(..., { shell: false })` даёт точный argv без повторного shell-разбора.
- `Buffer`, `TextDecoder` и `TextEncoder` дают байтовую работу с текстом.
- Скрипты переносимы между Windows, macOS и Linux.
- Не нужен compile step.
- У проекта нет runtime npm dependencies.

Последний пункт важен: чем меньше движущихся частей в safety boundary, тем меньше шанс, что сама safety-тулза станет источником сбоя.

## Почему не добавлять другой обязательный язык сейчас

Go, Rust, Python, Bash и PowerShell имеют отличные экосистемы, но обязательность любого из них увеличит friction установки.

Проект не должен требовать:

- compiler toolchain;
- Python environments;
- shell wrappers для safety-critical путей;
- platform-specific bootstrap scripts.

## Когда другой язык уместен

Внешние инструменты полезны как опциональные интеграции:

- Go/Rust binaries: ShellCheck, shfmt, actionlint, zizmor, Gitleaks, TruffleHog;
- Python tools: check-jsonschema, chardet;
- PowerShell modules: PSScriptAnalyzer;
- platform utilities: iconv, dos2unix.

Эти инструменты нужно документировать, обнаруживать и рекомендовать. Агент не должен скачивать их молча.

## Практическое правило

Ядро комплекта должно оставаться маленьким, детерминированным и dependency-free. Зрелые внешние инструменты пусть делают domain-specific анализ после того, как комплект стабилизировал shell/text I/O границы.
