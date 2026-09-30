import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { strings } from "@/lib/strings";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.shell}>
      <SiteHeader />
      <main className={styles.main}>
        <h1 className={styles.title}>{strings.home.title}</h1>
        <p className={styles.body}>{strings.home.body}</p>
        <p className={styles.note}>{strings.home.comingSoon}</p>
      </main>
      <SiteFooter />
    </div>
  );
}
