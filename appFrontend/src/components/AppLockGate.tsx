import { AppLockScreen } from './AppLockScreen';
import { SetCredentialPrompt } from './SetCredentialPrompt';
import { useAppLock } from '../context/AppLockContext';

export function AppLockGate({ children }: { children: React.ReactNode }) {
  const { isLocked } = useAppLock();

  return (
    <>
      {children}
      {isLocked ? <AppLockScreen /> : null}
      <SetCredentialPrompt />
    </>
  );
}
