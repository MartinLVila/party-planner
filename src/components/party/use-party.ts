"use client";

import { useCallback, useRef, useState } from "react";
import { applyChangeAction, type ApplyChangeResult } from "@/app/actions/party";
import type { PartyChange } from "@/lib/party/changes";
import type { PartySnapshot } from "@/lib/party/snapshot";
import { strings } from "@/lib/strings";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface PartyState {
  snapshot: PartySnapshot;
  saveStatus: SaveStatus;
  notice: string | null;
  submit: (change: PartyChange, optimistic?: (snapshot: PartySnapshot) => PartySnapshot) => Promise<boolean>;
  dismissNotice: () => void;
}

const REJECTION_NOTICES: Record<Exclude<ApplyChangeResult, { ok: true }>["reason"], string> = {
  conflict: strings.party.conflict,
  notFound: strings.party.rejected,
  invalid: strings.party.rejected,
  full: strings.party.full,
  forbidden: strings.settings.errors.forbidden,
  malformed: strings.party.rejected,
  failed: strings.party.saveFailed,
};

async function send(partyId: string, revision: number, change: PartyChange): Promise<ApplyChangeResult> {
  try {
    return await applyChangeAction({ partyId, revision, change });
  } catch {
    return { ok: false, reason: "failed", snapshot: null };
  }
}

export function useParty(initial: PartySnapshot): PartyState {
  const [snapshot, setSnapshot] = useState(initial);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const confirmed = useRef(initial);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const pending = useRef(0);

  const submit = useCallback<PartyState["submit"]>((change, optimistic) => {
    if (optimistic) setSnapshot((current) => optimistic(current));
    setSaveStatus("saving");
    pending.current += 1;

    const run = queue.current.then(async () => {
      const result = await send(confirmed.current.id, confirmed.current.revision, change);
      pending.current -= 1;
      if (result.snapshot) confirmed.current = result.snapshot;
      if (!result.ok || pending.current === 0) setSnapshot(confirmed.current);
      if (pending.current === 0) setSaveStatus(result.ok ? "saved" : "error");
      if (!result.ok) setNotice(REJECTION_NOTICES[result.reason]);
      return result.ok;
    });
    queue.current = run;
    return run;
  }, []);

  const dismissNotice = useCallback(() => setNotice(null), []);

  return { snapshot, saveStatus, notice, submit, dismissNotice };
}
