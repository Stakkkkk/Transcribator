# Layering with project skills

Agent I/O Safety Kit does not replace project-specific instructions or domain skills. It sits below them and handles fragile shell/text I/O boundaries.

## Mental model

```text
system and user instructions
→ project instructions
→ domain/project skill
→ Agent I/O Safety rule
→ safe-shell-io / safe-text-io
→ deterministic script
→ verification
```

## What the project skill owns

A project or domain skill should decide:

- which tests matter;
- which build command is appropriate;
- what generated file should contain;
- which project conventions apply;
- which external linter or formatter should run.

## What this kit owns

Agent I/O Safety Kit decides how to safely perform the I/O once the project skill has chosen the operation:

- exact argv instead of fragile command strings;
- no repeated shell parsing of user data;
- explicit UTF-8/BOM/line-ending policy;
- deterministic text inspection and transcoding;
- warnings before automatic repair.

## Example

If a project skill says:

```text
Run the integration test with the selected customer name.
```

and the customer name contains spaces, quotes, `$`, `&`, or non-ASCII text, the project skill still owns the meaning of the test. This kit owns the transport boundary and should route the command through `safe-shell-io` or a command spec.

## Rule for agents

When a project skill and this kit both apply, follow both:

1. use the project skill to understand what should happen;
2. use Agent I/O Safety Kit to choose the safe shell/text I/O path;
3. run project-specific validation after the I/O boundary is stable.
