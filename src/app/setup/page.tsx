import { redirect } from "next/navigation";
import { createFirstAdminAction } from "@/lib/actions";
import { countUsers } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if ((await countUsers()).count !== 0) redirect("/login");

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">Initial Setup</p>
        <h1>최초 관리자 생성</h1>
        <p className="subtle">사용자 DB가 비어 있으므로 첫 가입자가 admin 권한을 받습니다.</p>
        <form action={createFirstAdminAction} className="form-stack">
          <label>
            아이디
            <input name="id" required autoComplete="username" />
          </label>
          <label>
            실명
            <input name="realName" required />
          </label>
          <label>
            비밀번호
            <input name="password" type="password" minLength={8} required autoComplete="new-password" />
          </label>
          <label>
            비밀번호 확인
            <input name="passwordConfirm" type="password" minLength={8} required autoComplete="new-password" />
          </label>
          <button type="submit">admin 생성</button>
        </form>
      </section>
    </main>
  );
}
