import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, ArrowRight, CheckCircle2, Mail, Shield, Sparkles, Trophy } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { apiPost } from '../../api/client';
import { OtpInput, type OtpInputRef } from '../../components/OtpInput';
import { useAuth, type AuthUser } from '../../context/AuthContext';

type Step = 'email' | 'otp';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginScreen({ navigation }: { navigation?: any }) {
  const insets = useSafeAreaInsets();
  const { setAuth } = useAuth();
  const emailRef = useRef<TextInput>(null);
  const otpRef = useRef<OtpInputRef>(null);
  const verifyingRef = useRef(false);

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const trimmedEmail = email.trim().toLowerCase();
  const emailValid = EMAIL_RE.test(trimmedEmail);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const sendCode = useCallback(async () => {
    if (!emailValid) {
      setError('Enter a valid email address');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await apiPost('/auth/send-otp', { email: trimmedEmail });
      setEmail(trimmedEmail);
      setStep('otp');
      setOtp('');
      setResendCooldown(60);
    } catch (err: any) {
      setError(err.message || 'Failed to send code');
    } finally {
      setLoading(false);
    }
  }, [emailValid, trimmedEmail]);

  const verifyCode = useCallback(
    async (code?: string) => {
      const value = code ?? otp;
      if (value.length !== 6) {
        setError('Enter the 6-digit code');
        return;
      }
      if (verifyingRef.current) return;
      verifyingRef.current = true;
      setError('');
      setLoading(true);
      try {
        const res = await apiPost<{ token: string; user: NonNullable<AuthUser> }>(
          '/auth/verify-otp',
          { email: trimmedEmail || email, code: value },
        );
        setAuth(res.user, res.token, { fromSignIn: true });
        navigation?.reset({ index: 0, routes: [{ name: 'Main' }] });
      } catch (err: any) {
        setError(err.message || 'Verification failed');
        setOtp('');
        otpRef.current?.focus();
      } finally {
        setLoading(false);
        verifyingRef.current = false;
      }
    },
    [otp, trimmedEmail, email, setAuth, navigation],
  );

  const handleResend = useCallback(async () => {
    if (resendCooldown > 0) return;
    setError('');
    setLoading(true);
    try {
      await apiPost('/auth/send-otp', { email: trimmedEmail || email });
      setResendCooldown(60);
      setOtp('');
      otpRef.current?.focus();
    } catch (err: any) {
      setError(err.message || 'Failed to resend code');
    } finally {
      setLoading(false);
    }
  }, [email, trimmedEmail, resendCooldown]);

  const goBackToEmail = () => {
    setStep('email');
    setOtp('');
    setError('');
    setTimeout(() => emailRef.current?.focus(), 250);
  };

  const canSubmit = !loading && (step === 'otp' || emailValid);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={[styles.hero, { paddingTop: insets.top + 12 }]}>
        <View style={styles.orbLarge} />
        <View style={styles.orbSmall} />
        {step === 'otp' ? (
          <Pressable style={styles.backButton} onPress={goBackToEmail} hitSlop={8}>
            <ArrowLeft size={18} color="#dcfce7" />
            <Text style={styles.backText}>Change email</Text>
          </Pressable>
        ) : (
          <View style={styles.backSpacer} />
        )}
        <Text style={styles.brand}>7a-side</Text>
        <StepIndicator step={step} />
      </View>

      <KeyboardAvoidingView
        style={styles.sheetWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 20 }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.sheetInner}>
            {step === 'email' ? (
              <View style={styles.stepContent}>
                <Text style={styles.title}>Welcome back</Text>
                <Text style={styles.subtitle}>
                  Enter your email and we&apos;ll send a secure 6-digit code. No password needed.
                </Text>
                <View style={styles.features}>
                  <FeatureChip icon={Shield} label="Secure login" />
                  <FeatureChip icon={Trophy} label="Book fields" />
                  <FeatureChip icon={Sparkles} label="No password" />
                </View>
                <View style={styles.form}>
                  <Text style={styles.label}>Email address</Text>
                  <View
                    style={[
                      styles.inputWrap,
                      emailFocused && styles.inputFocused,
                      error && !emailValid ? styles.inputError : null,
                      emailValid ? styles.inputValid : null,
                    ]}
                  >
                    <Mail
                      size={20}
                      color={emailFocused || emailValid ? '#16a34a' : '#9ca3af'}
                      pointerEvents="none"
                    />
                    <TextInput
                      ref={emailRef}
                      style={styles.input}
                      value={email}
                      onChangeText={(text) => {
                        setEmail(text);
                        setError('');
                      }}
                      onFocus={() => setEmailFocused(true)}
                      onBlur={() => setEmailFocused(false)}
                      placeholder="you@example.com"
                      placeholderTextColor="#9ca3af"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="email"
                      textContentType="emailAddress"
                      returnKeyType="go"
                      onSubmitEditing={sendCode}
                      autoFocus
                      editable
                    />
                    {emailValid ? <CheckCircle2 size={20} color="#16a34a" pointerEvents="none" /> : null}
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.stepContent}>
                <View style={styles.otpHeader}>
                  <View style={styles.mailIconWrap}>
                    <Mail size={28} color="#16a34a" />
                  </View>
                  <Text style={styles.title}>Check your inbox</Text>
                  <Text style={styles.subtitle}>
                    Enter the 6-digit code we sent to{'\n'}
                    <Text style={styles.emailHighlight}>{trimmedEmail || email}</Text>
                  </Text>
                </View>
                <View style={styles.form}>
                  <OtpInput
                    ref={otpRef}
                    value={otp}
                    onChange={(value) => {
                      setOtp(value);
                      setError('');
                    }}
                    onComplete={(value) => void verifyCode(value)}
                    disabled={loading}
                    error={!!error}
                    autoFocus
                  />
                  <Pressable
                    style={styles.resendRow}
                    onPress={handleResend}
                    disabled={resendCooldown > 0 || loading}
                  >
                    <Text style={[styles.resendText, resendCooldown > 0 && styles.resendMuted]}>
                      {resendCooldown > 0
                        ? `Resend code in ${resendCooldown}s`
                        : "Didn't get it? Resend code"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}

            {error ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.footerSpacer} />

            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                !canSubmit && styles.buttonDisabled,
                pressed && canSubmit && styles.primaryButtonPressed,
              ]}
              onPress={step === 'email' ? sendCode : () => void verifyCode()}
              disabled={!canSubmit}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <View style={styles.buttonInner}>
                  <Text style={styles.primaryButtonText}>
                    {step === 'email' ? 'Continue' : 'Verify & Sign In'}
                  </Text>
                  <ArrowRight size={20} color="#ffffff" />
                </View>
              )}
            </Pressable>

            <Text style={styles.legal}>
              By continuing, you agree to our Terms of Service and Privacy Policy
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const steps = ['Email', 'Verify'];
  const activeIndex = step === 'email' ? 0 : 1;

  return (
    <View style={styles.steps}>
      {steps.map((label, index) => {
        const isActive = index === activeIndex;
        const isDone = index < activeIndex;
        return (
          <View key={label} style={styles.stepItem}>
            <View style={[styles.stepDot, (isActive || isDone) && styles.stepDotActive]}>
              {isDone ? (
                <CheckCircle2 size={14} color="#14532d" />
              ) : (
                <Text style={[styles.stepNumber, isActive && styles.stepNumberActive]}>
                  {index + 1}
                </Text>
              )}
            </View>
            <Text style={[styles.stepLabel, isActive && styles.stepLabelActive]}>{label}</Text>
            {index < steps.length - 1 ? <View style={styles.stepLine} /> : null}
          </View>
        );
      })}
    </View>
  );
}

function FeatureChip({
  icon: Icon,
  label,
}: {
  icon: typeof Shield;
  label: string;
}) {
  return (
    <View style={styles.chip}>
      <Icon size={13} color="#166534" />
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  hero: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 24,
    paddingBottom: 40,
    overflow: 'hidden',
  },
  orbLarge: {
    position: 'absolute',
    top: -36,
    right: -24,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  orbSmall: {
    position: 'absolute',
    bottom: 16,
    left: -20,
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  backText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#dcfce7',
  },
  backSpacer: {
    height: 22,
    marginBottom: 16,
  },
  brand: {
    fontSize: 28,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.6,
    marginBottom: 20,
  },
  steps: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: {
    backgroundColor: '#bbf7d0',
  },
  stepNumber: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
  },
  stepNumberActive: {
    color: '#14532d',
  },
  stepLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.6)',
  },
  stepLabelActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  stepLine: {
    width: 22,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginHorizontal: 2,
  },
  sheetWrap: {
    flex: 1,
    marginTop: -24,
  },
  sheet: {
    flexGrow: 1,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 28,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
  },
  sheetInner: {
    flexGrow: 1,
  },
  stepContent: {
    gap: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: '#6b7280',
    textAlign: 'center',
  },
  emailHighlight: {
    color: '#15803d',
    fontWeight: '700',
  },
  features: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginTop: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#dcfce7',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#166534',
  },
  form: {
    gap: 10,
    marginTop: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#f9fafb',
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    paddingHorizontal: 16,
    minHeight: 56,
  },
  inputFocused: {
    borderColor: '#16a34a',
    backgroundColor: '#f0fdf4',
  },
  inputValid: {
    borderColor: '#16a34a',
  },
  inputError: {
    borderColor: '#dc2626',
    backgroundColor: '#fef2f2',
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
  },
  otpHeader: {
    alignItems: 'center',
    gap: 10,
  },
  mailIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  resendRow: {
    alignSelf: 'center',
    paddingVertical: 8,
  },
  resendText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#16a34a',
  },
  resendMuted: {
    color: '#9ca3af',
  },
  errorBanner: {
    marginTop: 16,
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: {
    fontSize: 14,
    color: '#dc2626',
    textAlign: 'center',
    lineHeight: 20,
    fontWeight: '500',
  },
  footerSpacer: {
    flexGrow: 1,
    minHeight: 48,
  },
  primaryButton: {
    backgroundColor: '#16a34a',
    borderRadius: 14,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 6,
  },
  primaryButtonPressed: {
    backgroundColor: '#15803d',
  },
  buttonDisabled: {
    opacity: 0.5,
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  legal: {
    fontSize: 12,
    lineHeight: 18,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 14,
  },
});
