import Link from "next/link";
import type { User } from "@/lib/types";
import { logoutAction } from "@/lib/actions";

export function AppShell({ user, children }: { user: User; children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link href="/" className="brand">
          Frex Billboard
        </Link>
        <nav className="main-nav" aria-label="Primary">
          <Link href="/">대시보드</Link>
          <Link href="/rankings">역대 순위표</Link>
          <Link href="/leagues">역대 모든 리그 결과</Link>
        </nav>
        <div className="top-actions">
          <Link href="/settings" className="icon-link" aria-label="설정">
            ⚙️
          </Link>
          {user.role === "admin" ? (
            <Link href="/admin" className="icon-link crown" aria-label="관리">
              👑
            </Link>
          ) : null}
          <form action={logoutAction}>
            <button className="ghost-button" type="submit">
              로그아웃
            </button>
          </form>
        </div>
      </header>
      <main className="page">{children}</main>
    </div>
  );
}
