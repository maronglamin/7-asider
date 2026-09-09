import { deleteAuthStorageItem, getAuthStorageItem, setAuthStorageItem } from '../utils/authStorage';

const KEY = 'pending_field_manager_invite';

export async function setPendingFieldManagerInvite(token: string): Promise<void> {
  const value = String(token || '').trim();
  if (!value) return;
  await setAuthStorageItem(KEY, value);
}

export async function consumePendingFieldManagerInvite(): Promise<string | null> {
  const value = await getAuthStorageItem(KEY);
  if (value) await deleteAuthStorageItem(KEY);
  return value ? String(value).trim() : null;
}
