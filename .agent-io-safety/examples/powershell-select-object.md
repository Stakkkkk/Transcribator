# PowerShell `Select-Object -Index` range example

PowerShell ranges should be passed as expressions when used as argument values.

Risky:

```powershell
Get-Content .\file.txt | Select-Object -Index 94..112
```

Safer:

```powershell
Get-Content .\file.txt | Select-Object -Index (94..112)
```

Often clearer:

```powershell
Get-Content .\file.txt | Select-Object -Skip 94 -First 19
```

Agent rule:

- if a PowerShell parameter receives a range, wrap the range in parentheses;
- for contiguous line windows, prefer `-Skip` and `-First`;
- use `-LiteralPath` for paths.
