import { redirect } from "next/navigation";
import { loginAction, registerUserAction } from "@/lib/actions";
import { getCurrentUser } from "@/lib/auth";
import { countUsers } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ registered?: string }> }) {
  if ((await countUsers()).count === 0) redirect("/setup");
  const user = await getCurrentUser();
  if (user) redirect("/");
  const params = await searchParams;

  return (
    <main className="auth-page wide">
      <section className="auth-card">
        <p className="eyebrow">Login</p>
        <h1>로그인</h1>
        {params.registered ? <p className="notice">가입 신청이 접수되었습니다. admin 승인 후 로그인할 수 있습니다.</p> : null}
        <form action={loginAction} className="form-stack">
          <label>
            아이디
            <input name="id" required autoComplete="username" />
          </label>
          <label>
            비밀번호
            <input name="password" type="password" required autoComplete="current-password" />
          </label>
          <button type="submit">로그인</button>
        </form>
      </section>

      <section className="auth-card">
        <p className="eyebrow">Register</p>
        <h1>회원 등록 신청</h1>
        <p className="subtle">admin이 발급한 초대 코드가 필요합니다.</p>
        <form action={registerUserAction} className="form-stack">
          <label>
            아이디
            <input name="id" required autoComplete="username" />
          </label>
          <label>
            실명
            <input name="realName" required />
          </label>
          <label>
            초대 코드
            <input name="inviteCode" required />
          </label>
          <label>
            비밀번호
            <input name="password" type="password" minLength={8} required autoComplete="new-password" />
          </label>
          <label>
            비밀번호 확인
            <input name="passwordConfirm" type="password" minLength={8} required autoComplete="new-password" />
          </label>
          <button type="submit">가입 신청</button>
        </form>
      </section>
    </main>
  );
}
