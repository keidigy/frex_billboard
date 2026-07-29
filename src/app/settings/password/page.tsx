import { redirect } from "next/navigation";
import { completePasswordResetAction, logoutAction } from "@/lib/actions";
import { getCurrentUser } from "@/lib/auth";
import { countUsers } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function PasswordResetPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if ((await countUsers()).count === 0) redirect("/setup");
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.password_reset_required) redirect("/settings");
  const params = await searchParams;

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">Password Reset</p>
        <h1>새 비밀번호 등록</h1>
        <p className="subtle">admin이 발급한 임시 비밀번호로 로그인했습니다. 계속하려면 새 비밀번호를 등록해야 합니다.</p>
        {params.error ? <p className="error-notice">{params.error}</p> : null}
        <form action={completePasswordResetAction} className="form-stack">
          <label>
            새 비밀번호
            <input name="newPassword" type="password" minLength={8} required autoComplete="new-password" />
          </label>
          <label>
            새 비밀번호 확인
            <input name="newPasswordConfirm" type="password" minLength={8} required autoComplete="new-password" />
          </label>
          <button type="submit">새 비밀번호 저장</button>
        </form>
        <form action={logoutAction} className="form-stack">
          <button className="secondary-button" type="submit">
            로그아웃
          </button>
        </form>
      </section>
    </main>
  );
}
