import { toPublicAppLockType } from '../app-lock/service';

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  username?: string | null;
  supadmin?: boolean;
  provider: string | null;
  passwordHash?: string | null;
  appLockType?: string | null;
};

export function toAuthUser(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    username: user.username ?? null,
    supadmin: Boolean(user.supadmin),
    provider: user.provider,
    appLockType: toPublicAppLockType(user.appLockType),
    hasPassword: Boolean(user.passwordHash),
  };
}
