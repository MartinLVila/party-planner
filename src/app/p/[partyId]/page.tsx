import { eq } from "drizzle-orm";
import { z } from "zod";
import { AccessSettings } from "@/components/access-settings";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { resolveSession } from "@/lib/access/party-access";
import { readSessionToken } from "@/lib/access/session-cookie";
import { getDb } from "@/lib/db/client";
import { parties } from "@/lib/db/schema";
import { strings } from "@/lib/strings";
import styles from "../../page.module.css";

async function loadParty(rawPartyId: string) {
  const partyId = z.uuid().safeParse(rawPartyId);
  if (!partyId.success) return null;

  const db = getDb();
  const access = await resolveSession(db, partyId.data, await readSessionToken());
  if (!access) return null;

  const [party] = await db.select({ name: parties.name }).from(parties).where(eq(parties.id, partyId.data));
  return party ? { id: partyId.data, name: party.name, access } : null;
}

export default async function PartyPage({ params }: { params: Promise<{ partyId: string }> }) {
  const party = await loadParty((await params).partyId);

  return (
    <div className={styles.shell}>
      <SiteHeader />
      <main className={styles.main}>
        {party ? (
          <>
            <h1 className={styles.title}>{party.name}</h1>
            <p className={styles.body}>{party.access === "edit" ? strings.party.accessEdit : strings.party.accessView}</p>
            {party.access === "edit" && <AccessSettings partyId={party.id} />}
          </>
        ) : (
          <p className={styles.note}>{strings.party.locked}</p>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
