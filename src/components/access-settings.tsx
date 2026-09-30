"use client";

import { useActionState } from "react";
import {
  changePasswordAction,
  rotateLinksAction,
  type ChangePasswordState,
  type RotateLinksState,
} from "@/app/actions/access";
import { strings } from "@/lib/strings";
import styles from "./forms.module.css";
import { PartyLinks } from "./party-links";

const initialRotate: RotateLinksState = { status: "idle" };
const initialPassword: ChangePasswordState = { status: "idle" };

function RotateLinks({ partyId }: { partyId: string }) {
  const [state, formAction, pending] = useActionState(rotateLinksAction, initialRotate);
  if (state.status === "rotated") return <PartyLinks links={state.links} showOpen={false} />;

  return (
    <form action={formAction} className={styles.panel}>
      <h3 className={styles.heading}>{strings.settings.rotateTitle}</h3>
      <p className={styles.body}>{strings.settings.rotateBody}</p>
      <input type="hidden" name="partyId" value={partyId} />
      {state.status === "error" && (
        <p className={styles.error} role="alert">
          {state.message}
        </p>
      )}
      <div className={styles.actions}>
        <button type="submit" className={styles.secondary} disabled={pending}>
          {strings.settings.rotateSubmit}
        </button>
      </div>
    </form>
  );
}

function ChangePassword({ partyId }: { partyId: string }) {
  const [state, formAction, pending] = useActionState(changePasswordAction, initialPassword);

  return (
    <form action={formAction} className={styles.panel}>
      <h3 className={styles.heading}>{strings.settings.passwordTitle}</h3>
      <p className={styles.body}>{strings.settings.passwordBody}</p>
      <input type="hidden" name="partyId" value={partyId} />
      <label className={styles.field}>
        <span className={styles.label}>{strings.settings.passwordLabel}</span>
        <input
          className={styles.input}
          name="password"
          type="password"
          required
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
        />
      </label>
      {state.status === "error" && (
        <p className={styles.error} role="alert">
          {state.message}
        </p>
      )}
      {state.status === "changed" && (
        <p className={styles.success} role="status">
          {strings.settings.passwordChanged}
        </p>
      )}
      <div className={styles.actions}>
        <button type="submit" className={styles.secondary} disabled={pending}>
          {strings.settings.passwordSubmit}
        </button>
      </div>
    </form>
  );
}

export function AccessSettings({ partyId }: { partyId: string }) {
  return (
    <section aria-label={strings.settings.heading} className={styles.stack}>
      <RotateLinks partyId={partyId} />
      <ChangePassword partyId={partyId} />
    </section>
  );
}
