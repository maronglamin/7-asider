import { Platform, Share } from 'react-native';
import { nativeAppPath, publicAppPath } from './app-public-url';

export function squadJoinLink(code: string): string {
  const trimmed = encodeURIComponent(String(code || '').trim());
  return publicAppPath(`/join/${trimmed}`);
}

export function challengeLink(token: string): string {
  const trimmed = encodeURIComponent(String(token || '').trim());
  return publicAppPath(`/challenge/${trimmed}`);
}

export function squadInviteMessage(squad: { name?: string; emoji?: string; inviteCode?: string }): string {
  const name = squad.name || 'a squad';
  const emoji = squad.emoji || '⚽';
  const code = squad.inviteCode || '';
  const link = code ? squadJoinLink(code) : '';
  return `${emoji} ${name} wants you on the pitch.\nJoin with code ${code}${link ? `\n${link}` : ''}`;
}

export function challengeInviteMessage(params: {
  fromName?: string;
  fromEmoji?: string;
  fieldName?: string;
  token: string;
}): string {
  const name = params.fromName || 'A squad';
  const emoji = params.fromEmoji || '⚽';
  const field = params.fieldName ? ` at ${params.fieldName}` : '';
  return `${emoji} ${name} challenges you to a 7v7${field}.\nTap to accept:\n${challengeLink(params.token)}`;
}

export async function shareText(message: string, title = '7a-side'): Promise<'shared' | 'copied'> {
  if (Platform.OS === 'web') {
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    if (nav && typeof (nav as any).share === 'function') {
      await (nav as any).share({ title, text: message });
      return 'shared';
    }
    if (nav?.clipboard?.writeText) {
      await nav.clipboard.writeText(message);
      return 'copied';
    }
    throw new Error('Sharing is not available in this browser.');
  }
  await Share.share({ message, title });
  return 'shared';
}

export { nativeAppPath };
