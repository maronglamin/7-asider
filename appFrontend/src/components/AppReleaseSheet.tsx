import React from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export type ReleaseNotice = {
  mode: 'none' | 'optional' | 'force';
  updateAvailable: boolean;
  forceUpdate: boolean;
  title: string;
  message: string;
  storeUrl?: string | null;
  latestVersion?: string | null;
  latestBuild?: string | null;
};

type AppReleaseSheetProps = {
  notice: ReleaseNotice | null;
  onDismiss: () => void;
  onUpdate: () => void;
};

export function AppReleaseSheet({ notice, onDismiss, onUpdate }: AppReleaseSheetProps) {
  const visible = Boolean(notice?.updateAvailable);
  const forceUpdate = Boolean(notice?.forceUpdate);
  const versionLabel = [notice?.latestVersion, notice?.latestBuild ? `build ${notice.latestBuild}` : null]
    .filter(Boolean)
    .join(' • ');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={forceUpdate ? undefined : onDismiss}>
      <View style={styles.overlay}>
        <TouchableOpacity
          activeOpacity={1}
          style={styles.backdrop}
          disabled={forceUpdate}
          onPress={onDismiss}
        />
        <SafeAreaView edges={['bottom']} style={styles.safeArea}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.title}>{notice?.title || 'Update available'}</Text>
            <Text style={styles.message}>{notice?.message || ''}</Text>
            {!!versionLabel && <Text style={styles.version}>Latest release: {versionLabel}</Text>}
            <View style={styles.actions}>
              {!forceUpdate && (
                <TouchableOpacity style={styles.secondaryButton} onPress={onDismiss}>
                  <Text style={styles.secondaryButtonText}>Later</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.primaryButton} onPress={onUpdate}>
                <Text style={styles.primaryButtonText}>Update now</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject as any,
  },
  safeArea: {
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 20,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#d1d5db',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 10,
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    color: '#4b5563',
  },
  version: {
    marginTop: 14,
    fontSize: 13,
    color: '#16a34a',
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#374151',
    fontSize: 15,
    fontWeight: '600',
  },
  primaryButton: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: '#16a34a',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
