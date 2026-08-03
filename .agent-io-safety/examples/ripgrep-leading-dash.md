# ripgrep patterns that start with `-`

`rg` treats an argument that starts with `-` as an option unless option parsing has been stopped.

Risky:

```sh
rg "-TODO"
rg "-n"
```

Safer:

```sh
rg -- "-TODO"
rg -- "-n"
```

For literal strings, combine this with fixed-string matching:

```sh
rg --fixed-strings -- "-TODO"
```

Agent rule:

- if the search pattern can start with `-`, put `--` before the pattern;
- if the pattern is user-controlled, pass it as a separate argv item, not as shell syntax;
- for literal user text, prefer `--fixed-strings -- <pattern>`.
