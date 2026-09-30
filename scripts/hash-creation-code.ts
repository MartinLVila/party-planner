import { createInterface } from "node:readline/promises";
import { hashPassword, PASSWORD_LENGTH } from "../src/lib/access/secrets";

async function readCode(): Promise<string> {
  const lines = createInterface({ input: process.stdin, terminal: false });
  for await (const line of lines) {
    lines.close();
    return line.trim();
  }
  return "";
}

async function main() {
  const code = await readCode();
  if (code.length < PASSWORD_LENGTH.min) {
    throw new Error(`The creation code needs at least ${PASSWORD_LENGTH.min} characters`);
  }
  process.stdout.write(`PARTY_CREATE_CODE_HASH=${await hashPassword(code)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
