import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Animatable from 'react-native-animatable';

interface OnboardingScreenProps {
  navigation?: any;
}

export function OnboardingScreen({ navigation }: OnboardingScreenProps) {
  const logoRef = useRef<any>(null);
  const titleRef = useRef<any>(null);

  useEffect(() => {
    // Start animations with delays - loading indicator shows immediately
    setTimeout(() => logoRef.current?.fadeInUp(800), 1000);
    setTimeout(() => titleRef.current?.fadeInUp(800), 1200);

    // Navigate after animations complete
    const timer = setTimeout(() => {
      navigation?.navigate('Login');
    }, 5000);

    return () => clearTimeout(timer);
  }, [navigation]);

  return (
    <SafeAreaView style={styles.container} edges={['top','bottom']}>
      <StatusBar style="light" backgroundColor="#16a34a" />
      
      {/* Logo and Branding */}
      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <Animatable.View ref={logoRef} style={styles.logoWrapper}>
            <Text style={styles.logoEmoji}>⚽</Text>
          </Animatable.View>
          <Animatable.Text ref={titleRef} style={styles.appName}>7a-side</Animatable.Text>
        </View>

        {/* Loading Indicator */}
        <View style={styles.loadingContainer}>
          <View style={styles.loadingBar}>
            <Animatable.View 
              style={styles.loadingProgress}
              animation="pulse"
              iterationCount="infinite"
              duration={1000}
            />
          </View>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#16a34a',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 80,
  },
  logoWrapper: {
    marginBottom: 16,
  },
  logoEmoji: {
    fontSize: 80,
  },
  appName: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  loadingContainer: {
    alignItems: 'center',
  },
  loadingBar: {
    width: 200,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    marginBottom: 16,
    overflow: 'hidden',
  },
  loadingProgress: {
    width: '100%',
    height: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 2,
  },
  loadingText: {
    fontSize: 16,
    color: '#dcfce7',
    fontWeight: '500',
  },
});