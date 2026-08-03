# External tools compatibility guide

Agent I/O Safety Kit should stay small. It is not a replacement for mature linters, formatters, schema validators, secret scanners, or platform-specific analyzers.

Use this guide to decide when an agent should run or suggest an external tool after the deterministic I/O checks from this kit.

## Policy

- Do not auto-download or auto-install external tools without explicit user approval.
- Prefer tools already configured by the project.
- Prefer official package managers and pinned versions in CI.
- Run `safe-shell-io` / `safe-text-io` checks first when the failure mode is quoting, argv, encoding, BOM, line endings, or mojibake.
- Run domain-specific external tools after the bytes and argument boundaries are stable.
- Treat encoding detectors as diagnostic hints, not as permission to rewrite files automatically.

## Recommended optional tools

| Area | Tool | Official source | When to use | Important boundary |
|---|---|---|---|---|
| POSIX shell analysis | ShellCheck | <https://github.com/koalaman/shellcheck> | After editing `.sh`, `.bash`, `.zsh`, Docker shell snippets, or CI shell steps. | Does not solve argv transport between processes; use command specs for that. |
| POSIX shell formatting | shfmt | <https://github.com/mvdan/sh> | To format shell scripts after content is already safely written. | Formatter, not an injection guard. |
| PowerShell analysis | PSScriptAnalyzer | <https://learn.microsoft.com/powershell/utility-modules/psscriptanalyzer/overview> | After editing `.ps1`, `.psm1`, or `.psd1`. | Does not guarantee correct file encoding for Windows PowerShell 5.1; still run `inspect-text.mjs --ps51-safe`. |
| EditorConfig policy | editorconfig-checker | <https://github.com/editorconfig-checker/editorconfig-checker> | When a repository has `.editorconfig`. | Complements but does not replace strict UTF-8/BOM checks. |
| GitHub Actions linting | actionlint | <https://github.com/rhysd/actionlint> | After editing `.github/workflows/*.yml` or `.yaml`. | Workflow syntax/linting only; not a security scanner. |
| GitHub Actions security | zizmor | <https://github.com/zizmorcore/zizmor> | After editing GitHub Actions workflows or reusable actions. | Security-focused; not a general YAML validator. |
| Secret scanning | Gitleaks | <https://github.com/gitleaks/gitleaks> | Before publishing or after touching config/docs/tests that may contain tokens. | Can report false positives; never paste secrets into issue reports. |
| Secret scanning | TruffleHog | <https://github.com/trufflesecurity/trufflehog> | Deeper secret scans or repository history scans. | Potentially slower/noisier than lightweight scans. |
| Line ending conversion | dos2unix | <https://dos2unix.sourceforge.io/> | Explicit line-ending conversion when a project requires it. | Do not mass-normalize without project policy. |
| Encoding conversion | iconv / GNU libiconv | <https://www.gnu.org/software/libiconv/> | Explicit encoding conversion when source and target encodings are known. | Do not use guessed legacy encodings for in-place rewrites. |
| Encoding detection | chardet | <https://chardet.readthedocs.io/> | Diagnostic hint for unknown text. | Detection is probabilistic; require human confirmation before rewriting. |
| Encoding detection | uchardet | <https://www.freedesktop.org/wiki/Software/uchardet/> | Diagnostic hint for unknown text. | Detection is probabilistic; require human confirmation before rewriting. |
| JSON Schema validation | Ajv | <https://github.com/ajv-validator/ajv> | Validate command specs or project JSON schemas in JS/Node workflows. | Keep schema validation separate from command execution. |
| JSON Schema validation | check-jsonschema | <https://github.com/python-jsonschema/check-jsonschema> | Validate JSON/YAML against schemas in Python-friendly environments. | Optional; do not add Python as a core dependency. |
| Multi-tool orchestration | pre-commit | <https://pre-commit.com/> | Run multiple checks locally before commit. | Hooks should be explicit and reviewable. |
| Multi-linter CI | MegaLinter | <https://github.com/oxsecurity/megalinter> | Large repositories that want broad lint coverage. | Heavyweight; not the default for this kit. |

## Agent routing rule

When touching a file type with a mature dedicated tool, the agent should:

1. preserve deterministic I/O boundaries with this kit;
2. inspect affected text files with `safe-text-io` when encoding or line endings matter;
3. run the project’s configured formatter/linter/scanner if it exists;
4. if the tool is missing, suggest the official installation path instead of silently downloading it.

## Example external check flow

After the kit is installed into a target project:

```sh
node scripts/doctor.mjs --target /path/to/project --entry AGENTS.md --external
npm test
npm run check:text
```

If optional tools are installed, run the relevant ones:

```sh
shellcheck scripts/*.sh
shfmt -w scripts/*.sh
editorconfig-checker
actionlint
zizmor .github/workflows
gitleaks detect --source .
```
