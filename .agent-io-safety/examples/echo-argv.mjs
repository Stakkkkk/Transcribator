#!/usr/bin/env node
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);

const payload = {
  args: process.argv.slice(2),
  stdin: Buffer.concat(chunks).toString("utf8"),
};

process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
