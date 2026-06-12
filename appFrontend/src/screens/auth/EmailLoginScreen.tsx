import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Platform, Image, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft } from 'lucide-react-native';
import { apiPost } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useGoogleSignIn } from '../../auth/useGoogleSignIn';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

export function EmailLoginScreen({ navigation }: { navigation?: any }) {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { setAuth } = useAuth();
  const { signInWithGoogle, submitting: googleSubmitting, configured: googleConfigured } = useGoogleSignIn();

  const handleLogin = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await apiPost<{ token: string; user: { id: string; email: string; name?: string; supadmin?: boolean; provider?: string | null } }>(
        '/auth/login-email',
        { email: email.trim(), password },
      );
      setAuth(res.user, res.token);
      navigation?.reset({ index: 0, routes: [{ name: 'Main' }] });
    } catch (e: any) {
      alert(e.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = email.trim() && password;
  const busy = submitting || googleSubmitting;

  const handleGoogleLogin = async () => {
    const result = await signInWithGoogle();
    if (result.ok) {
      navigation?.reset({ index: 0, routes: [{ name: 'Main' }] });
      return;
    }
    if (result.error !== 'Sign-in cancelled') {
      alert(result.error);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation?.goBack()}>
          <ArrowLeft size={24} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.title}>Sign In</Text>
        <Text style={styles.subtitle}>Enter your email and password</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your email"
              placeholderTextColor="#9ca3af"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your password"
              placeholderTextColor="#9ca3af"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>
        </View>

        <TouchableOpacity style={styles.forgotPasswordButton} onPress={() => navigation?.navigate('ForgotPassword')}>
          <Text style={styles.forgotPasswordText}>Forgot password?</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.loginButton, !canSubmit || busy ? styles.loginButtonDisabled : undefined]}
          onPress={handleLogin}
          disabled={!canSubmit || busy}
        >
          <Text style={styles.loginButtonText}>{submitting ? 'Signing in...' : 'Sign In'}</Text>
        </TouchableOpacity>

        {googleConfigured ? (
          <>
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity
              style={[styles.googleButton, busy ? styles.googleButtonDisabled : undefined]}
              onPress={handleGoogleLogin}
              disabled={busy}
            >
              <Image source={require('../../../assets/google.png')} style={styles.googleLogo} resizeMode="contain" />
              <Text style={styles.googleButtonText}>Continue with Google</Text>
              {googleSubmitting ? <ActivityIndicator size="small" color="#16a34a" /> : null}
            </TouchableOpacity>
          </>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  header: { backgroundColor: '#16a34a', paddingHorizontal: 32, paddingBottom: 32 },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#ffffff', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#dcfce7', lineHeight: 22 },
  content: { flex: 1, backgroundColor: '#ffffff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 50, ...(Platform.OS === 'web' ? ({ alignItems: 'center' } as any) : null) },
  form: { padding: 32, ...(Platform.OS === 'web' ? ({ alignSelf: 'center', width: '100%', maxWidth: 760 } as any) : null) },
  inputContainer: { marginBottom: 24 },
  inputLabel: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 8 },
  input: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 16, fontSize: 16, color: '#111827' },
  forgotPasswordButton: { marginHorizontal: 32, marginTop: -4, marginBottom: 20, alignSelf: 'flex-end', ...(Platform.OS === 'web' ? ({ alignSelf: 'center', alignItems: 'flex-end', width: 'calc(100% - 64px)', maxWidth: 696 } as any) : null) },
  forgotPasswordText: { color: '#16a34a', fontSize: 14, fontWeight: '600' },
  loginButton: { backgroundColor: '#16a34a', paddingVertical: 16, borderRadius: 12, marginHorizontal: 32, marginBottom: 24, alignItems: 'center', ...(Platform.OS === 'web' ? ({ alignSelf: 'center', width: 'calc(100% - 64px)', maxWidth: 696 } as any) : null) },
  loginButtonDisabled: { backgroundColor: '#d1d5db' },
  loginButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  divider: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 32, marginBottom: 20, ...(Platform.OS === 'web' ? ({ alignSelf: 'center', width: 'calc(100% - 64px)', maxWidth: 696 } as any) : null) },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#e5e7eb' },
  dividerText: { marginHorizontal: 16, fontSize: 14, color: '#6b7280', fontWeight: '500' },
  googleButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', paddingVertical: 14, paddingHorizontal: 20, borderRadius: 12, marginHorizontal: 32, marginBottom: 24, ...(Platform.OS === 'web' ? ({ alignSelf: 'center', width: 'calc(100% - 64px)', maxWidth: 696 } as any) : null) },
  googleButtonDisabled: { opacity: 0.7 },
  googleLogo: { width: 20, height: 20, marginRight: 12 },
  googleButtonText: { flex: 1, fontSize: 16, fontWeight: '600', color: '#111827' },
});


