"use client";

import { useActionState } from "react";
import { resetUserPasswordAction, type ResetUserPasswordState } from "@/lib/actions";

const initialState: ResetUserPasswordState = { ok: false };

export function AdminPasswordResetForm({ userId, disabled = false }: { userId: string; disabled?: boolean }) {
  const [state, formAction, pending] = useActionState(resetUserPasswordAction, initialState);

  return (
    <div className="password-reset-form">
      <form action={formAction}>
        <input type="hidden" name="userId" value={userId} />
        <button className="small-button" type="submit" disabled={disabled || pending}>
          {pending ? "초기화 중..." : "임시 비밀번호"}
        </button>
      </form>
      {state.ok && state.userId === userId ? (
        <p className="temp-password-result">
          {state.realName} 임시 비밀번호 <code>{state.temporaryPassword}</code>
        </p>
      ) : null}
      {!state.ok && state.error ? <p className="inline-error">{state.error}</p> : null}
    </div>
  );
}
