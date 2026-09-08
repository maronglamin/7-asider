export const SQUAD_CRESTS = ['⚽', '⚡', '🔥', '🦁', '🦅', '🐺', '🦈', '🐉', '👑', '🏆', '⭐', '💚', '🖤', '🤍', '🛡️', '🎯'];

export const SQUAD_KIT_COLORS = [
  '#16a34a',
  '#166534',
  '#0f766e',
  '#1d4ed8',
  '#7c3aed',
  '#b45309',
  '#b91c1c',
  '#111827',
];

export type SquadSummary = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  memberCount: number;
  role?: 'CAPTAIN' | 'MEMBER';
  foundedAt?: string;
  startingSideProgress?: number;
  startingSideSize?: number;
  inviteCode?: string;
  joinedAt?: string;
};

export type SquadMember = {
  id: string;
  userId: string;
  role: 'CAPTAIN' | 'MEMBER';
  joinedAt: string;
  name: string;
  username?: string | null;
};

export function startingSideCopy(memberCount: number, size = 7): string {
  if (memberCount >= size) return `Full side of ${size} — extras welcome on the bench.`;
  const need = size - memberCount;
  return `${memberCount} of ${size} for a starting XI — need ${need} more. Keep sharing.`;
}
