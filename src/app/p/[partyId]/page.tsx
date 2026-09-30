import type { Metadata } from "next";
import { z } from "zod";
import { AccessSettings } from "@/components/access-settings";
import { PartyView } from "@/components/party/party-view";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { resolveSession } from "@/lib/access/party-access";
import { readSessionToken } from "@/lib/access/session-cookie";
import { getDb } from "@/lib/db/client";
import { loadPartyCatalog } from "@/lib/party/catalog";
import { loadPartySnapshot } from "@/lib/party/snapshot";
import { strings } from "@/lib/strings";
import styles from "../../page.module.css";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

async function loadParty(rawPartyId: string) {
  const partyId = z.uuid().safeParse(rawPartyId);
  if (!partyId.success) return null;

  const db = getDb();
  const access = await resolveSession(db, partyId.data, await readSessionToken());
  if (!access) return null;

  const [snapshot, catalog] = await Promise.all([loadPartySnapshot(db, partyId.data), loadPartyCatalog(db)]);
  return snapshot ? { snapshot, catalog, access } : null;
}

export default async function PartyPage({ params }: { params: Promise<{ partyId: string }> }) {
  const party = await loadParty((await params).partyId);

  if (!party) {
    return (
      <div className={styles.shell}>
        <SiteHeader />
        <main className={styles.main}>
          <p className={styles.note}>{strings.party.locked}</p>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const { snapshot, catalog, access } = party;
  return (
    <div className={styles.shell}>
      <SiteHeader />
      <main className={styles.wide}>
        <PartyView
          initial={snapshot}
          catalog={{ classes: catalog.classes, slots: catalog.slots, skills: catalog.skills, missing: catalog.missing }}
          canEdit={access === "edit"}
        />
        {access === "edit" && (
          <details className={styles.settings}>
            <summary>{strings.settings.heading}</summary>
            <AccessSettings partyId={snapshot.id} />
          </details>
        )}
      </main>
      <SiteFooter>
        <span>{strings.footer.catalogSize(catalog.itemCount, catalog.classes.length)}</span>
      </SiteFooter>
    </div>
  );
}
