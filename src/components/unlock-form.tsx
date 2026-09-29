"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useSyncExternalStore } from "react";
import { unlockAction, type UnlockState } from "@/app/actions/access";
import { strings } from "@/lib/strings";
import styles from "./forms.module.css";

let capturedToken: string | null = null;

function captureFragmentToken(): string | null {
  const token = window.location.hash.slice(1);
  if (token) {
    capturedToken = token;
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
  return capturedToken;
}

function subscribeToHashChanges(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

const initialState: UnlockState = { status: "idle" };

export function UnlockForm() {
  const token = useSyncExternalStore(subscribeToHashChanges, captureFragmentToken, () => undefined);
  const [state, formAction, pending] = useActionState(unlockAction, initialState);
  const router = useRouter();

  useEffect(() => {
    if (state.status === "unlocked") router.replace(`/p/${state.partyId}`);
  }, [state, router]);

  if (token === undefined) return null;
  if (token === null) {
    return (
      <p className={styles.error} role="alert">
        {strings.unlock.missingLink}
      </p>
    );
  }

  return (
    <form action={formAction} className={styles.panel} aria-labelledby="unlock-heading">
      <h1 id="unlock-heading" className={styles.heading}>
        {strings.unlock.heading}
      </h1>
      <p className={styles.body}>{strings.unlock.body}</p>
      <input type="hidden" name="token" value={token} />
      <label className={styles.field}>
        <span className={styles.label}>{strings.unlock.passwordLabel}</span>
        <input
          className={styles.input}
          name="password"
          type="password"
          required
          maxLength={128}
          autoComplete="current-password"
          autoFocus
        />
      </label>
      {state.status === "error" && (
        <p className={styles.error} role="alert">
          {state.message}
        </p>
      )}
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={pending || state.status === "unlocked"}>
          {pending ? strings.unlock.submitting : strings.unlock.submit}
        </button>
      </div>
    </form>
  );
}
