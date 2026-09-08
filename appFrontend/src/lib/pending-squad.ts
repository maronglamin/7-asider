import { deleteAuthStorageItem, getAuthStorageItem, setAuthStorageItem } from '../utils/authStorage';

const JOIN_KEY = 'pending_squad_join_code';
const CHALLENGE_KEY = 'pending_squad_challenge_token';

export async function setPendingSquadJoin(code: string): Promise<void> {
  const value = String(code || '').trim();
  if (!value) return;
  await setAuthStorageItem(JOIN_KEY, value);
}

export async function consumePendingSquadJoin(): Promise<string | null> {
  const value = await getAuthStorageItem(JOIN_KEY);
  if (value) await deleteAuthStorageItem(JOIN_KEY);
  return value ? String(value).trim() : null;
}

export async function peekPendingSquadJoin(): Promise<string | null> {
  const value = await getAuthStorageItem(JOIN_KEY);
  return value ? String(value).trim() : null;
}

export async function setPendingChallenge(token: string): Promise<void> {
  const value = String(token || '').trim();
  if (!value) return;
  await setAuthStorageItem(CHALLENGE_KEY, value);
}

export async function consumePendingChallenge(): Promise<string | null> {
  const value = await getAuthStorageItem(CHALLENGE_KEY);
  if (value) await deleteAuthStorageItem(CHALLENGE_KEY);
  return value ? String(value).trim() : null;
}
