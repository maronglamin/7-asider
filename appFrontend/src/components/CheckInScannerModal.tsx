import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { X } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiPostAuth } from '../api/client';

type Props = {
  visible: boolean;
  bookingId: string;
  token: string;
  onClose: () => void;
  onCompleted: () => void;
};

export function CheckInScannerModal({ visible, bookingId, token, onClose, onCompleted }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('Align the guest QR code inside the frame');
  const lockedRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      lockedRef.current = false;
      setBusy(false);
      setHint('Align the guest QR code inside the frame');
      return;
    }
    if (permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [visible, permission, requestPermission]);

  const handleScanned = async ({ data }: { data: string }) => {
    if (!visible || lockedRef.current || busy) return;
    lockedRef.current = true;
    setBusy(true);
    setHint('Checking in…');
    try {
      const res = await apiPostAuth<{ ok: boolean; status?: string; alreadyCompleted?: boolean }>(
        `/bookings/${encodeURIComponent(bookingId)}/check-in`,
        { payload: String(data || '').trim() },
        token,
      );
      if (res.alreadyCompleted) {
        Alert.alert('Already checked in', 'This booking was already marked completed.');
      } else {
        Alert.alert('Checked in', 'This booking is now completed.');
      }
      onCompleted();
      onClose();
    } catch (e: any) {
      lockedRef.current = false;
      setBusy(false);
      setHint('Align the guest QR code inside the frame');
      Alert.alert('Check-in failed', e?.message || 'Could not complete check-in. Try scanning again.');
    }
  };

  const granted = Boolean(permission?.granted);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <SafeAreaView edges={['top']} style={styles.topBar}>
          <Text style={styles.title}>Scan check-in QR</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close scanner">
            <X size={22} color="#111827" />
          </TouchableOpacity>
        </SafeAreaView>

        <View style={styles.cameraBox}>
          {granted ? (
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={busy ? undefined : handleScanned}
            />
          ) : (
            <View style={styles.permissionBox}>
              <Text style={styles.permissionText}>
                Camera access is needed to scan the guest check-in code.
              </Text>
              <TouchableOpacity style={styles.permissionBtn} onPress={() => void requestPermission()}>
                <Text style={styles.permissionBtnText}>Allow camera</Text>
              </TouchableOpacity>
            </View>
          )}
          {granted ? <View style={styles.frame} pointerEvents="none" /> : null}
          {busy ? (
            <View style={styles.busyOverlay}>
              <ActivityIndicator size="large" color="#ffffff" />
            </View>
          ) : null}
        </View>

        <SafeAreaView edges={['bottom']} style={styles.bottomBar}>
          <Text style={styles.hint}>{hint}</Text>
          {Platform.OS === 'web' ? (
            <Text style={styles.webNote}>Use the device camera. The guest should open their paid booking details.</Text>
          ) : null}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f172a' },
  topBar: {
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  title: { fontSize: 18, fontWeight: '800', color: '#111827' },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBox: {
    flex: 1,
    margin: 16,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#111827',
  },
  frame: {
    position: 'absolute',
    top: '22%',
    left: '14%',
    right: '14%',
    bottom: '22%',
    borderWidth: 3,
    borderColor: '#22c55e',
    borderRadius: 16,
  },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  permissionText: {
    color: '#e5e7eb',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  permissionBtn: {
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  permissionBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 16 },
  bottomBar: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  hint: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  webNote: {
    color: '#94a3b8',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 16,
  },
});
