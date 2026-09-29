"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import type { IssuedLinks } from "@/app/actions/access";
import { strings } from "@/lib/strings";
import styles from "./forms.module.css";

const subscribeToNothing = () => () => {};

function useOrigin(): string {
  return useSyncExternalStore(
    subscribeToNothing,
    () => window.location.origin,
    () => "",
  );
}

function LinkRow({ label, hint, url }: { label: string; hint: string; url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={styles.linkRow}>
      <div className={styles.linkHeader}>
        <span className={styles.label}>{label}</span>
        <span className={styles.hint}>{hint}</span>
      </div>
      <div className={styles.linkValue}>
        <input className={styles.input} value={url} readOnly aria-label={label} onFocus={(event) => event.target.select()} />
        <button type="button" className={styles.secondary} onClick={copy} disabled={!url}>
          {copied ? strings.links.copied : strings.links.copy}
        </button>
      </div>
    </div>
  );
}

export function PartyLinks({ links, showOpen = true }: { links: IssuedLinks; showOpen?: boolean }) {
  const origin = useOrigin();
  const linkFor = (token: string) => (origin ? `${origin}/p#${token}` : "");

  return (
    <section className={styles.panel} aria-labelledby="party-links-heading">
      <h2 id="party-links-heading" className={styles.heading}>
        {strings.links.heading}
      </h2>
      <p className={styles.body}>{strings.links.body}</p>
      <LinkRow label={strings.links.editLabel} hint={strings.links.editHint} url={linkFor(links.editToken)} />
      <LinkRow label={strings.links.viewLabel} hint={strings.links.viewHint} url={linkFor(links.viewToken)} />
      {showOpen && (
        <div className={styles.actions}>
          <Link href={`/p/${links.partyId}`} className={styles.primary}>
            {strings.links.open}
          </Link>
        </div>
      )}
    </section>
  );
}
