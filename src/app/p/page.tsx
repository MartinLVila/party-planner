import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { UnlockForm } from "@/components/unlock-form";
import styles from "../page.module.css";

export default function UnlockPage() {
  return (
    <div className={styles.shell}>
      <SiteHeader />
      <main className={styles.main}>
        <UnlockForm />
      </main>
      <SiteFooter />
    </div>
  );
}
