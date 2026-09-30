import { spendPasswordCheck, verifyPassword } from "./secrets";

export type CreationCodeCheck = "accepted" | "rejected" | "disabled";

export async function checkCreationCode(
  code: string,
  expectedHash = process.env.PARTY_CREATE_CODE_HASH,
): Promise<CreationCodeCheck> {
  if (!expectedHash) {
    await spendPasswordCheck(code);
    return "disabled";
  }
  return (await verifyPassword(code, expectedHash)) ? "accepted" : "rejected";
}
