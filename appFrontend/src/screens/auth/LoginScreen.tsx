import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Mail, ArrowRight } from 'lucide-react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

interface LoginScreenProps {
  navigation?: any;
}

export function LoginScreen({ navigation }: LoginScreenProps) {
  const insets = useSafeAreaInsets();

  const handleEmailLogin = () => {
    navigation?.navigate('Register');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top','bottom']}>
      <StatusBar style="light" />
      
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.title}>Welcome to 7a-side</Text>
        <Text style={styles.subtitle}>Sign in to book fields and join matches</Text>
      </View>

      {/* Login Options */}
      <View style={styles.content}>

        {/* Email Registration */}
        <TouchableOpacity style={styles.emailButton} onPress={handleEmailLogin}>
          <Mail size={20} color="#16a34a" />
          <Text style={styles.emailButtonText}>Sign up with Email</Text>
          <ArrowRight size={20} color="#16a34a" />
        </TouchableOpacity>

        {/* Email Sign In */}
        <TouchableOpacity style={styles.emailButtonAlt} onPress={() => navigation?.navigate('EmailLogin')}>
          <Text style={styles.emailButtonAltText}>Already have an account? Sign in</Text>
        </TouchableOpacity>

        {/* Terms */}
        <Text style={styles.termsText}>
          By continuing, you agree to our Terms of Service and Privacy Policy
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#16a34a',
  },
  header: {
    paddingHorizontal: 32,
    paddingBottom: 40,
    alignItems: 'center',
    ...(Platform.OS === 'web' ? ({ alignSelf: 'center', width: '100%', maxWidth: 640 } as any) : null),
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#dcfce7',
    textAlign: 'center',
    lineHeight: 22,
  },
  content: {
    flex: 1,
    paddingHorizontal: 32,
    justifyContent: 'flex-end',
    ...(Platform.OS === 'web' ? ({ alignSelf: 'center', width: '100%', maxWidth: 560 } as any) : null),
  },
  socialButtons: {
    marginBottom: 32,
  },
  socialButton: {
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  logoContainer: {
    width: 32,
    height: 32,
    marginRight: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  logoImage: {
    width: 24,
    height: 24,
  },
  socialButtonText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 14,
    color: '#dcfce7',
    fontWeight: '500',
  },
  emailButton: {
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 32,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  emailButtonText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#16a34a',
    textAlign: 'center',
  },
  emailButtonAlt: {
    backgroundColor: '#ffffff',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 8,
    alignItems: 'center',
  },
  emailButtonAltText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '600',
  },
  termsText: {
    fontSize: 12,
    color: '#dcfce7',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 16,
  },
});