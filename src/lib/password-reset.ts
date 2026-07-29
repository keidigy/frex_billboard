import type { User } from "@/lib/types";

export function mustResetPassword(user: Pick<User, "password_reset_required">) {
  return Number(user.password_reset_required ?? 0) === 1;
}
