export type RegistrationWindowState = {
  registration_opens_at: string;
  starts_at: string;
};

export function isRegistrationOpenAt(league: RegistrationWindowState, now: string) {
  return league.registration_opens_at <= now && now < league.starts_at;
}
