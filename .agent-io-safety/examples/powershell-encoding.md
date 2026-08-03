# PowerShell encoding trap

Windows PowerShell 5.1, PowerShell 7+, native program stdout, console code pages, and file encodings are separate boundaries.

Agent rule of thumb:

1. Do not rely on `Get-Content`, `Set-Content`, `Out-File`, shell redirection, `$OutputEncoding`, or the active console code page unless the exact byte behavior has been verified.
2. For `.ps1` files that must run in Windows PowerShell 5.1:
   - prefer ASCII-only UTF-8 without BOM;
   - if non-ASCII is required, use UTF-8 BOM as an explicit documented exception.
3. After writing a PowerShell file, run:

```sh
node skills/safe-text-io/scripts/inspect-text.mjs --ps51-safe path/to/script.ps1
```
