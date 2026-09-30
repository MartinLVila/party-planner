import Image from "next/image";
import { iconUrl } from "@/lib/game-assets";

export function GameIcon({ iconPath, size, fallback }: { iconPath: string | null; size: number; fallback: string }) {
  if (!iconPath) return <>{fallback}</>;
  return <Image src={iconUrl(iconPath)} alt="" width={size} height={size} />;
}
