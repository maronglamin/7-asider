import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useGoogleSignInFromConfig } from './useGoogleSignIn';

type Nav = { reset?: (state: any) => void };

async function handleGoogleResult(
  signInWithGoogle: () => Promise<{ ok: boolean; error?: string }>,
  navigation?: Nav,
) {
  const result = await signInWithGoogle();
  if (result.ok) {
    navigation?.reset?.({ index: 0, routes: [{ name: 'Main' }] });
    return;
  }
  if (result.error !== 'Sign-in cancelled') {
    alert(result.error);
  }
}

export function LoginScreenGoogleSignIn({ navigation }: { navigation?: Nav }) {
  const { signInWithGoogle, submitting } = useGoogleSignInFromConfig();

  return (
    <View style={loginStyles.socialButtons}>
      <TouchableOpacity
        style={[loginStyles.socialButton, submitting ? loginStyles.socialButtonDisabled : undefined]}
        onPress={() => handleGoogleResult(signInWithGoogle, navigation)}
        disabled={submitting}
      >
        <View style={loginStyles.logoContainer}>
          <Image
            source={require('../../assets/google.png')}
            style={loginStyles.logoImage}
            resizeMode="contain"
          />
        </View>
        <Text style={loginStyles.socialButtonText}>Continue with Google</Text>
        {submitting ? <ActivityIndicator size="small" color="#16a34a" /> : null}
      </TouchableOpacity>
    </View>
  );
}

export function LoginScreenGoogleDivider() {
  return (
    <View style={loginStyles.divider}>
      <View style={loginStyles.dividerLine} />
      <Text style={loginStyles.dividerText}>or</Text>
      <View style={loginStyles.dividerLine} />
    </View>
  );
}

export function EmailLoginScreenGoogleSignIn({
  navigation,
  disabled,
}: {
  navigation?: Nav;
  disabled?: boolean;
}) {
  const { signInWithGoogle, submitting } = useGoogleSignInFromConfig();
  const busy = disabled || submitting;

  return (
    <>
      <View style={emailStyles.divider}>
        <View style={emailStyles.dividerLine} />
        <Text style={emailStyles.dividerText}>or</Text>
        <View style={emailStyles.dividerLine} />
      </View>

      <TouchableOpacity
        style={[emailStyles.googleButton, busy ? emailStyles.googleButtonDisabled : undefined]}
        onPress={() => handleGoogleResult(signInWithGoogle, navigation)}
        disabled={busy}
      >
        <Image source={require('../../assets/google.png')} style={emailStyles.googleLogo} resizeMode="contain" />
        <Text style={emailStyles.googleButtonText}>Continue with Google</Text>
        {submitting ? <ActivityIndicator size="small" color="#16a34a" /> : null}
      </TouchableOpacity>
    </>
  );
}

const loginStyles = StyleSheet.create({
  socialButtons: { marginBottom: 32 },
  socialButton: {
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  socialButtonDisabled: { opacity: 0.7 },
  logoContainer: {
    width: 32,
    height: 32,
    marginRight: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#ffffff',
  },
  logoImage: { width: 24, height: 24 },
  socialButtonText: { flex: 1, fontSize: 16, fontWeight: '600', color: '#111827' },
  divider: { flexDirection: 'row', alignItems: 'center', marginBottom: 32 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255, 255, 255, 0.3)' },
  dividerText: { marginHorizontal: 16, fontSize: 14, color: '#dcfce7', fontWeight: '500' },
});

const emailStyles = StyleSheet.create({
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 32,
    marginBottom: 20,
    ...(Platform.OS === 'web' ? ({ alignSelf: 'center', width: 'calc(100% - 64px)', maxWidth: 696 } as any) : null),
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#e5e7eb' },
  dividerText: { marginHorizontal: 16, fontSize: 14, color: '#6b7280', fontWeight: '500' },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginHorizontal: 32,
    marginBottom: 24,
    ...(Platform.OS === 'web' ? ({ alignSelf: 'center', width: 'calc(100% - 64px)', maxWidth: 696 } as any) : null),
  },
  googleButtonDisabled: { opacity: 0.7 },
  googleLogo: { width: 20, height: 20, marginRight: 12 },
  googleButtonText: { flex: 1, fontSize: 16, fontWeight: '600', color: '#111827' },
});
