"use server";

import { z } from "zod";
import { checkCreationCode } from "@/lib/access/creation-code";
import { changePassword, createParty, resolveSession, rotateLinks, unlockParty } from "@/lib/access/party-access";
import { PASSWORD_LENGTH } from "@/lib/access/secrets";
import { readSessionToken, storeSession } from "@/lib/access/session-cookie";
import { getDb } from "@/lib/db/client";
import { PARTY_NAME_LENGTH } from "@/lib/db/schema";
import { strings } from "@/lib/strings";

const password = z.string().min(PASSWORD_LENGTH.min).max(PASSWORD_LENGTH.max);
const partyId = z.uuid();

export interface IssuedLinks {
  partyId: string;
  editToken: string;
  viewToken: string;
}

export type CreatePartyState =
  | { status: "idle" }
  | { status: "error"; message: string; name: string }
  | { status: "created"; links: IssuedLinks };

const createPartyInput = z.object({
  name: z.string().trim().min(PARTY_NAME_LENGTH.min).max(PARTY_NAME_LENGTH.max),
  password,
  creationCode: z.string().max(PASSWORD_LENGTH.max),
});

function createPartyError(issuePath: PropertyKey | undefined): string {
  if (issuePath === "name") return strings.createParty.errors.name;
  if (issuePath === "password") return strings.createParty.errors.password;
  return strings.createParty.errors.creationCode;
}

const creationCodeErrors = {
  rejected: strings.createParty.errors.creationCode,
  disabled: strings.createParty.errors.disabled,
} as const;

export async function createPartyAction(_previous: CreatePartyState, form: FormData): Promise<CreatePartyState> {
  const name = String(form.get("name") ?? "");
  const parsed = createPartyInput.safeParse({
    name,
    password: form.get("password"),
    creationCode: form.get("creationCode"),
  });
  if (!parsed.success) return { status: "error", message: createPartyError(parsed.error.issues[0]?.path[0]), name };

  const codeCheck = await checkCreationCode(parsed.data.creationCode);
  if (codeCheck !== "accepted") return { status: "error", message: creationCodeErrors[codeCheck], name };

  try {
    const party = await createParty(getDb(), { name: parsed.data.name, password: parsed.data.password });
    await storeSession(party);
    return {
      status: "created",
      links: { partyId: party.partyId, editToken: party.editToken, viewToken: party.viewToken },
    };
  } catch (error) {
    console.error("Creating a party failed", error);
    return { status: "error", message: strings.createParty.errors.unexpected, name };
  }
}

export type UnlockState = { status: "idle" } | { status: "error"; message: string } | { status: "unlocked"; partyId: string };

const unlockInput = z.object({ token: z.string().max(100), password: z.string().max(PASSWORD_LENGTH.max) });

export async function unlockAction(_previous: UnlockState, form: FormData): Promise<UnlockState> {
  const parsed = unlockInput.safeParse({ token: form.get("token"), password: form.get("password") });
  if (!parsed.success) return { status: "error", message: strings.unlock.errors.invalid };

  try {
    const result = await unlockParty(getDb(), parsed.data);
    if (!result.ok) return { status: "error", message: strings.unlock.errors[result.reason] };
    await storeSession(result);
    return { status: "unlocked", partyId: result.partyId };
  } catch (error) {
    console.error("Unlocking a party failed", error);
    return { status: "error", message: strings.unlock.errors.unexpected };
  }
}

async function requireEditAccess(rawPartyId: unknown): Promise<string | null> {
  const parsed = partyId.safeParse(rawPartyId);
  if (!parsed.success) return null;
  const access = await resolveSession(getDb(), parsed.data, await readSessionToken());
  return access === "edit" ? parsed.data : null;
}

export type RotateLinksState = { status: "idle" } | { status: "error"; message: string } | { status: "rotated"; links: IssuedLinks };

export async function rotateLinksAction(_previous: RotateLinksState, form: FormData): Promise<RotateLinksState> {
  try {
    const id = await requireEditAccess(form.get("partyId"));
    if (!id) return { status: "error", message: strings.settings.errors.forbidden };
    const rotated = await rotateLinks(getDb(), id);
    await storeSession(rotated);
    return { status: "rotated", links: { partyId: id, editToken: rotated.editToken, viewToken: rotated.viewToken } };
  } catch (error) {
    console.error("Rotating party links failed", error);
    return { status: "error", message: strings.settings.errors.unexpected };
  }
}

export type ChangePasswordState = { status: "idle" | "changed" } | { status: "error"; message: string };

export async function changePasswordAction(_previous: ChangePasswordState, form: FormData): Promise<ChangePasswordState> {
  const newPassword = password.safeParse(form.get("password"));
  if (!newPassword.success) return { status: "error", message: strings.settings.errors.password };

  try {
    const id = await requireEditAccess(form.get("partyId"));
    if (!id) return { status: "error", message: strings.settings.errors.forbidden };
    await storeSession(await changePassword(getDb(), id, newPassword.data));
    return { status: "changed" };
  } catch (error) {
    console.error("Changing a party password failed", error);
    return { status: "error", message: strings.settings.errors.unexpected };
  }
}
