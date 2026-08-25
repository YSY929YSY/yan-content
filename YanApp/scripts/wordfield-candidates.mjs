#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const pythonScript = fileURLToPath(new URL("./wordfield-candidates.py", import.meta.url));
const result = spawnSync("python3", [pythonScript, ...process.argv.slice(2)], {
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
