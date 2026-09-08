import React, { useEffect } from 'react';
import { consumePendingChallenge, consumePendingSquadJoin } from '../lib/pending-squad';
import { navigationRef } from './navigationRef';
import { useAuth } from '../context/AuthContext';

/**
 * After OTP login, finish a join/challenge that arrived from a shared link.
 */
export function PendingSquadDeepLinkHandler() {
  const { user, token } = useAuth();

  useEffect(() => {
    if (!user || !token) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled || !navigationRef.isReady()) return;
      const joinCode = await consumePendingSquadJoin();
      if (cancelled) return;
      if (joinCode) {
        try {
          (navigationRef as any).navigate('JoinSquad', { code: joinCode });
          return;
        } catch {
          /* ignore */
        }
      }
      const challengeToken = await consumePendingChallenge();
      if (cancelled || !challengeToken) return;
      try {
        (navigationRef as any).navigate('ChallengeAccept', { token: challengeToken });
      } catch {
        /* ignore */
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [user, token]);

  return null;
}
