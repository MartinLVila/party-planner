"use client";

import { useActionState } from "react";
import { createPartyAction, type CreatePartyState } from "@/app/actions/access";
import { strings } from "@/lib/strings";
import styles from "./forms.module.css";
import { PartyLinks } from "./party-links";

const initialState: CreatePartyState = { status: "idle" };

export function CreatePartyForm() {
  const [state, formAction, pending] = useActionState(createPartyAction, initialState);

  if (state.status === "created") return <PartyLinks links={state.links} />;

  return (
    <form action={formAction} className={styles.panel} aria-labelledby="create-party-heading">
      <h2 id="create-party-heading" className={styles.heading}>
        {strings.createParty.heading}
      </h2>
      <label className={styles.field}>
        <span className={styles.label}>{strings.createParty.nameLabel}</span>
        <input
          className={styles.input}
          name="name"
          required
          maxLength={80}
          placeholder={strings.createParty.namePlaceholder}
          defaultValue={state.status === "error" ? state.name : ""}
        />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>{strings.createParty.passwordLabel}</span>
        <input
          className={styles.input}
          name="password"
          type="password"
          required
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
        />
        <span className={styles.hint}>{strings.createParty.passwordHint}</span>
      </label>
      <label className={styles.field}>
        <span className={styles.label}>{strings.createParty.creationCodeLabel}</span>
        <input className={styles.input} name="creationCode" type="password" required autoComplete="off" />
        <span className={styles.hint}>{strings.createParty.creationCodeHint}</span>
      </label>
      {state.status === "error" && (
        <p className={styles.error} role="alert">
          {state.message}
        </p>
      )}
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={pending}>
          {pending ? strings.createParty.submitting : strings.createParty.submit}
        </button>
      </div>
    </form>
  );
}
