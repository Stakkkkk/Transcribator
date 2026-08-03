# Localization policy

[Russian version](ru/localization.md)

## Canonical language

English is canonical for:

- default GitHub/npm presentation;
- primary project files;
- rules and skills used by default;
- snippets used by `--lang en`;
- issue templates and CI metadata.

This keeps the project approachable for the widest open-source audience and gives agents the technical English they are most likely to handle consistently.

## Maintained Russian localization

Russian is maintained as a first-class localization, not as an afterthought.

Localized files use `.ru.md` or live under `docs/ru/` and `snippets/ru/`. The installer can deploy Russian instructions with:

```sh
node scripts/deploy.mjs --target /path/to/project --entry AGENTS.md --lang ru
```

The deployed paths stay canonical (`RULE.md`, `skills/.../SKILL.md`) so agents do not need to learn language-specific filenames.

## Contribution rule

When changing canonical instructions, update the Russian localization in the same pull request whenever practical. If that is not possible, mention the missing localization update explicitly in the PR.
