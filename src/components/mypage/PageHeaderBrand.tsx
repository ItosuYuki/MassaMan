import Link from "next/link";
import { LogoBadge } from "./LogoBadge";

export function PageHeaderBrand() {
  return (
    <Link
      href="/mypage"
      className="-m-2 flex items-center gap-2.5 rounded-xl p-2 transition-colors hover:bg-surface-2 active:bg-accent-soft"
    >
      <LogoBadge size={32} />
      <h1 className="text-lg">マッサマン</h1>
    </Link>
  );
}
