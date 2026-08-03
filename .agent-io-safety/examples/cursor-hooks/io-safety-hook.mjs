#!/usr/bin/env node
import process from "node:process";

function usage() {
  process.stderr.write("usage: node io-safety-hook.mjs --event beforeShellExecution\n");
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--event") {
      options.event = argv[++index];
      if (!options.event) throw new Error("--event requires a value");
    } else if (value === "--help" || value === "-h") {
      options.help = true;
    } else {
      throw new Error(`unknown option: ${value}`);
    }
  }
  return options;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8").trim();
  return text ? JSON.parse(text) : {};
}

function respond(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function allow() {
  respond({ permission: "allow" });
}

function deny(userMessage, agentMessage) {
  respond({
    permission: "deny",
    user_message: userMessage,
    agent_message: agentMessage,
  });
}

function ask(userMessage, agentMessage) {
  respond({
    permission: "ask",
    user_message: userMessage,
    agent_message: agentMessage,
  });
}

function hasRsyncSshN(command) {
  return /\brsync\b/i.test(command) && /\bssh\s+-[A-Za-z]*n[A-Za-z]*(?:\s|["']|$)/i.test(command);
}

function hasLiteralNewlineEscapeThroughSsh(command) {
  return /\bssh\b/i.test(command) && /\\n/.test(command);
}

function hasPowerShellBareRange(command) {
  return /Select-Object\s+-Index\s+\d+\.\.\d+/i.test(command);
}

function hasSetUNounsetWithDollarInDoubleQuotes(command) {
  const hasNounset = /\bset\s+-[A-Za-z]*u[A-Za-z]*(?:\s|;|&&|\|\||$)/.test(command) ||
    /\bset\s+-o\s+nounset(?:\s|;|&&|\|\||$)/.test(command);
  return hasNounset && /"[^"]*\$[A-Za-z_][A-Za-z0-9_]*[^"]*"/.test(command);
}

function executableBaseName(value) {
  return value.replaceAll("\\", "/").split("/").pop().toLowerCase();
}

function isRipgrepExecutable(value) {
  const baseName = executableBaseName(value);
  return baseName === "rg" || baseName === "rg.exe";
}

function tokenizeShellLike(command) {
  const tokens = [];
  let current = "";
  let quoted = false;
  let quote = "";
  let escaped = false;

  function pushToken() {
    if (current || quoted) tokens.push({ value: current, quoted, separator: false });
    current = "";
    quoted = false;
  }

  for (const char of command) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = "";
        quoted = true;
      } else if (quote === '"' && char === "\\") {
        escaped = true;
      } else {
        current += char;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      quoted = true;
    } else if (/\s/u.test(char)) {
      pushToken();
    } else if ("|;&".includes(char)) {
      pushToken();
      tokens.push({ value: char, quoted: false, separator: true });
    } else {
      current += char;
    }
  }

  pushToken();
  return tokens;
}

function hasRipgrepLeadingDashPatternWithoutTerminator(command) {
  const tokens = tokenizeShellLike(command);

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.separator || !isRipgrepExecutable(token.value)) continue;

    let afterTerminator = false;
    for (let argIndex = index + 1; argIndex < tokens.length; argIndex += 1) {
      const arg = tokens[argIndex];
      if (arg.separator) break;
      if (arg.value === "--") {
        afterTerminator = true;
        continue;
      }
      if (!afterTerminator && arg.quoted && arg.value.startsWith("-")) return true;
    }
  }

  return false;
}

function isInlineInterpreterOption(executable, option) {
  const baseName = executableBaseName(executable).replace(/\.exe$/u, "");
  const lower = option.toLowerCase();

  if (baseName === "node") {
    return lower === "-e" || lower === "--eval" || lower.startsWith("--eval=") ||
      lower === "-p" || lower === "--print" || lower.startsWith("--print=") ||
      lower.startsWith("-e") || lower.startsWith("-p");
  }

  if (["python", "python3", "py"].includes(baseName)) return lower === "-c" || lower.startsWith("-c");
  if (["ruby", "perl"].includes(baseName)) return lower === "-e" || lower.startsWith("-e") || /^-[A-Za-z]*e[A-Za-z]*$/u.test(lower);
  if (["powershell", "pwsh"].includes(baseName)) {
    return ["-command", "/command", "-c", "/c", "-encodedcommand", "/encodedcommand", "-enc", "/enc"].includes(lower);
  }
  if (baseName === "cmd") return lower === "/c" || lower === "-c";
  if (["bash", "sh"].includes(baseName)) return lower === "-c" || /^-[A-Za-z]*c[A-Za-z]*$/u.test(lower);

  return false;
}

function hasInlineInterpreterOneLiner(command) {
  const tokens = tokenizeShellLike(command);

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.separator) continue;

    for (let argIndex = index + 1; argIndex < tokens.length; argIndex += 1) {
      const arg = tokens[argIndex];
      if (arg.separator) break;
      if (isInlineInterpreterOption(token.value, arg.value)) return true;
    }
  }

  return false;
}

function hasConfigOrSecretIndicator(command) {
  return /(?:^|[\s"'=])(?:\.env|[^\s"'=]+\.(?:env|toml|json|ya?ml))\b/i.test(command) ||
    /\bconfig\.toml\b/i.test(command) ||
    /\b(?:authorization|bearer|token|secret|password|credential|api[_-]?key|private[_-]?key|openai_api_key|github_token|gh_token)\b/i.test(command) ||
    /\bsk-[A-Za-z0-9_-]{8,}\b/.test(command);
}

function hasInlineInterpreterComplexity(command) {
  return /[$`{}\[\]|&;<>()[\]'"]/.test(command) ||
    /\/[^/\s]+\/[a-z]*/i.test(command) ||
    /\b(?:regex|replace|readFile|readFileSync|Get-Content|Select-String|JSON\.parse|toml|yaml)\b/i.test(command);
}

function checkBeforeShellExecution(payload) {
  const command = String(payload.command ?? "");
  if (!command) return allow();

  if (hasRsyncSshN(command)) {
    return deny(
      "Blocked rsync with ssh -n. rsync uses the SSH stdin/stdout channel for its protocol.",
      "Do not put ssh -n inside rsync -e. Remove -n from the rsync transport or run a separate supervised remote command.",
    );
  }

  if (hasPowerShellBareRange(command)) {
    return deny(
      "Blocked PowerShell Select-Object -Index range without parentheses.",
      "Use Select-Object -Index (94..112), or prefer -Skip/-First for contiguous line windows.",
    );
  }

  if (hasInlineInterpreterOneLiner(command) && hasConfigOrSecretIndicator(command)) {
    return deny(
      "Blocked inline interpreter one-liner around config/env/secrets.",
      "Do not read or redact config/secrets with node -e, python -c, powershell -Command, cmd /c, bash -c, or similar. Use a native API, a script file, run-from-spec.mjs, run-node-utf8.mjs --spec, or node_repl, and print only allowlisted metadata.",
    );
  }

  if (hasInlineInterpreterOneLiner(command) && hasInlineInterpreterComplexity(command)) {
    return ask(
      "This inline interpreter one-liner contains complex shell/code syntax.",
      "Use a script file, run-from-spec.mjs, run-node-utf8.mjs --spec, or node_repl instead of relying on nested command-line quoting.",
    );
  }

  if (hasLiteralNewlineEscapeThroughSsh(command)) {
    return ask(
      "This SSH command contains a literal \\n escape. It may arrive remotely as n...n or be interpreted by the wrong layer.",
      "Avoid passing newlines as \\n through PowerShell/SSH quoting. Use repeated fixed echo commands for tiny fixed text, or upload/stream a file, stdin, JSON, or Base64 payload for real data.",
    );
  }

  if (hasRipgrepLeadingDashPatternWithoutTerminator(command)) {
    return ask(
      "This rg command contains a quoted value that starts with - before an option terminator.",
      "If this is the search pattern, use rg -- \"-pattern\". For literal user text, use rg --fixed-strings -- \"-literal\".",
    );
  }

  if (hasSetUNounsetWithDollarInDoubleQuotes(command)) {
    return ask(
      "This command enables Bash nounset and contains a $variable-looking value inside double quotes.",
      "Under set -u, config text such as nginx $http_authorization can expand as an unset shell variable. Use single quotes, fixed-string search, or move the check into a script file.",
    );
  }

  return allow();
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    process.exitCode = 0;
  } else if (options.event !== "beforeShellExecution") {
    throw new Error("only --event beforeShellExecution is supported by this example hook");
  } else {
    const payload = await readStdin();
    checkBeforeShellExecution(payload);
  }
} catch (error) {
  usage();
  process.stderr.write(`io-safety-hook: ${error.message}\n`);
  process.exitCode = 1;
}
