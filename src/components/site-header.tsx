import Link from "next/link";
import { strings } from "@/lib/strings";
import styles from "./site-header.module.css";

export function SiteHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand}>
          <span className={styles.mark} aria-hidden="true" />
          <span className={styles.name}>{strings.app.name}</span>
        </Link>
        {children}
      </div>
    </header>
  );
}
