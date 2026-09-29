import { ROLES } from "@/lib/db/schema";
import { composition, missingRoles } from "@/lib/party/stats";
import type { PartyMember } from "@/lib/party/snapshot";
import { strings } from "@/lib/strings";
import styles from "./party.module.css";

export function CompositionCards({ members }: { members: readonly PartyMember[] }) {
  const counts = composition(members);
  const gaps = missingRoles(counts);

  return (
    <section aria-label={strings.party.compositionLabel} className={styles.composition}>
      {ROLES.map((role) => {
        const missing = counts[role] === 0;
        return (
          <div key={role} className={styles.roleCard} data-missing={missing}>
            <div className={styles.eyebrow}>{role}</div>
            <div className={styles.countLine}>
              <span className={styles.roleCount}>{counts[role]}</span>
              {missing && <span className={styles.missingNote}>{strings.party.missingRole[role]}</span>}
            </div>
          </div>
        );
      })}
      <div className={styles.roleCard}>
        <div className={styles.eyebrow}>{strings.party.gapsLabel}</div>
        <div className={styles.gapText} data-missing={gaps.length > 0}>
          {gaps.length > 0 ? gaps.map((role) => strings.party.missingRole[role]).join(" · ") : strings.party.allRolesCovered}
        </div>
      </div>
    </section>
  );
}
