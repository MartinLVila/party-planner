import { strings } from "@/lib/strings";
import styles from "./site-footer.module.css";

export function SiteFooter({ children }: { children?: React.ReactNode }) {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <span>{strings.footer.gameData}</span>
        <span>{strings.footer.noGlobalApi}</span>
        {children}
      </div>
    </footer>
  );
}
