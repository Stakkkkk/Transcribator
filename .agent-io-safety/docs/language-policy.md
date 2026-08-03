# Language policy

The core of Agent I/O Safety Kit is written in Node.js by design.

## Why Node.js for the core

- Node.js 18+ is available in many agent and CI environments.
- `spawn(..., { shell: false })` provides exact argv execution without shell re-parsing.
- `Buffer`, `TextDecoder`, and `TextEncoder` provide byte-level text handling.
- The scripts are portable across Windows, macOS, and Linux.
- No compilation step is required.
- The project currently has no runtime npm dependencies.

That last point matters: the fewer moving parts in the safety boundary, the less likely the safety tool itself becomes the source of failure.

## Why not add another required language now

Go, Rust, Python, Bash, and PowerShell all have excellent tooling ecosystems, but making any of them mandatory would increase installation friction.

The project should not require:

- a compiler toolchain;
- Python environments;
- shell wrappers for safety-critical paths;
- platform-specific bootstrap scripts.

## When another language is appropriate

External tools are welcome as optional integrations:

- Go/Rust binaries such as ShellCheck, shfmt, actionlint, zizmor, Gitleaks, or TruffleHog;
- Python tools such as check-jsonschema or chardet;
- PowerShell modules such as PSScriptAnalyzer;
- platform utilities such as iconv or dos2unix.

These tools should be documented, detected, and recommended. They should not be silently downloaded by the agent.

## Rule of thumb

Keep the kit’s core small, deterministic, and dependency-free. Let mature external tools do domain-specific analysis after the kit has stabilized shell and text I/O boundaries.
