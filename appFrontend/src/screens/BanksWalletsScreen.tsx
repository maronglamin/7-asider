import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Modal, TextInput, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ChevronLeft, Plus, Trash2 } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { apiGetAuth, apiPostAuth, apiDeleteAuth } from '../api/client';

type BankAccount = {
  id: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  createdAt?: string;
};

type WalletAccount = {
  id: string;
  company: string;
  walletNumber: string;
  createdAt?: string;
};

export default function BanksWalletsScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();

  const [loading, setLoading] = useState(true);
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [wallets, setWallets] = useState<WalletAccount[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'bank' | 'wallet'>('bank');

  const [bankName, setBankName] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [company, setCompany] = useState('');
  const [walletNumber, setWalletNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const canSubmitBank = useMemo(() => {
    return bankName.trim().length > 1 && accountName.trim().length > 1 && accountNumber.trim().length >= 5;
  }, [bankName, accountName, accountNumber]);

  const canSubmitWallet = useMemo(() => {
    return company.trim().length > 1 && walletNumber.trim().length >= 5;
  }, [company, walletNumber]);

  const resetForms = () => {
    setBankName('');
    setAccountName('');
    setAccountNumber('');
    setCompany('');
    setWalletNumber('');
    setActiveTab('bank');
  };

  const maskNumber = (value: string) => {
    if (!value) return '';
    const last4 = value.slice(-4);
    return `•••• ${last4}`;
  };

  const load = async () => {
    if (!token) return;
    try {
      setLoading(true);
      // Using distinct endpoints for clarity. Adjust paths to your backend as needed.
      const [banksResp, walletsResp] = await Promise.all([
        apiGetAuth<BankAccount[]>(`/payouts/banks/me`, token as string).catch(() => [] as any),
        apiGetAuth<WalletAccount[]>(`/payouts/wallets/me`, token as string).catch(() => [] as any),
      ]);
      setBanks(Array.isArray(banksResp) ? banksResp : (banksResp as any)?.items || []);
      setWallets(Array.isArray(walletsResp) ? walletsResp : (walletsResp as any)?.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) load();
  }, [token]);

  const onSubmit = async () => {
    if (!token) return;
    try {
      setSubmitting(true);
      if (activeTab === 'bank') {
        if (!canSubmitBank) return;
        await apiPostAuth(`/payouts/banks`, { bankName: bankName.trim(), accountName: accountName.trim(), accountNumber: accountNumber.trim() }, token as string);
      } else {
        if (!canSubmitWallet) return;
        await apiPostAuth(`/payouts/wallets`, { company: company.trim(), walletNumber: walletNumber.trim() }, token as string);
      }
      await load();
      setSheetOpen(false);
      resetForms();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Unable to save details. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const onDeleteBank = (id: string) => {
    Alert.alert(
      'Delete Bank Account',
      'Are you sure you want to delete this bank account?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!token) return;
            try {
              setDeletingId(id);
              await apiDeleteAuth(`/payouts/banks/${id}`, token as string);
              setBanks((prev) => prev.filter((b) => b.id !== id));
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'Failed to delete bank account');
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
  };

  const onDeleteWallet = (id: string) => {
    Alert.alert(
      'Delete Wallet',
      'Are you sure you want to delete this wallet?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!token) return;
            try {
              setDeletingId(id);
              await apiDeleteAuth(`/payouts/wallets/${id}`, token as string);
              setWallets((prev) => prev.filter((w) => w.id !== id));
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'Failed to delete wallet');
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeTop} edges={['top']}>
        <StatusBar style="light" backgroundColor="#16a34a" />
        <View style={[styles.headerRow, { paddingTop: insets.top ? 8 : 12 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
            <ChevronLeft size={22} color="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Banks & Wallets</Text>
          <TouchableOpacity onPress={() => setSheetOpen(true)} style={styles.headerBtn}>
            <Plus size={22} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
      <SafeAreaView style={styles.safeBottom} edges={['bottom']}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#16a34a" />
          </View>
        ) : (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionTitle}>Bank Accounts</Text>
            <View style={styles.cardsList}>
              {banks.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>No bank accounts yet.</Text>
                </View>
              ) : (
                banks.map((b) => (
                  <View key={b.id} style={styles.card}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardTitle} numberOfLines={1}>{b.bankName}</Text>
                      <TouchableOpacity
                        onPress={() => onDeleteBank(b.id)}
                        style={styles.iconBtn}
                        disabled={deletingId === b.id}
                      >
                        <Trash2 size={18} color={deletingId === b.id ? '#9ca3af' : '#991b1b'} />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.cardSub} numberOfLines={1}>{b.accountName}</Text>
                    <Text style={styles.cardMeta}>{maskNumber(b.accountNumber)}</Text>
                  </View>
                ))
              )}
            </View>

            <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Wallet Accounts</Text>
            <View style={styles.cardsList}>
              {wallets.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>No wallet accounts yet.</Text>
                </View>
              ) : (
                wallets.map((w) => (
                  <View key={w.id} style={styles.card}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardTitle} numberOfLines={1}>{w.company}</Text>
                      <TouchableOpacity
                        onPress={() => onDeleteWallet(w.id)}
                        style={styles.iconBtn}
                        disabled={deletingId === w.id}
                      >
                        <Trash2 size={18} color={deletingId === w.id ? '#9ca3af' : '#991b1b'} />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.cardMeta}>{maskNumber(w.walletNumber)}</Text>
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        )}
      </SafeAreaView>

      {/* Add bottom sheet */}
      <Modal visible={sheetOpen} animationType="slide" transparent onRequestClose={() => setSheetOpen(false)}>
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={() => setSheetOpen(false)} />
          <View style={styles.sheetContainer}>
            <View style={styles.sheetHandle} />
            {/* Tabs */}
            <View style={styles.tabsRow}>
              <TouchableOpacity onPress={() => setActiveTab('bank')} style={[styles.tabBtn, activeTab === 'bank' && styles.tabBtnActive]}>
                <Text style={[styles.tabText, activeTab === 'bank' && styles.tabTextActive]}>Bank Account</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setActiveTab('wallet')} style={[styles.tabBtn, activeTab === 'wallet' && styles.tabBtnActive]}>
                <Text style={[styles.tabText, activeTab === 'wallet' && styles.tabTextActive]}>Wallet</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
              {activeTab === 'bank' ? (
                <View style={styles.form}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Bank Name</Text>
                    <TextInput
                      placeholder="e.g., EcoBank"
                      placeholderTextColor="#9ca3af"
                      value={bankName}
                      onChangeText={setBankName}
                      style={styles.input}
                    />
                  </View>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Account Name</Text>
                    <TextInput
                      placeholder="e.g., John Doe"
                      placeholderTextColor="#9ca3af"
                      value={accountName}
                      onChangeText={setAccountName}
                      style={styles.input}
                    />
                  </View>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Account Number</Text>
                    <TextInput
                      placeholder="e.g., 1234567890"
                      placeholderTextColor="#9ca3af"
                      keyboardType="number-pad"
                      value={accountNumber}
                      onChangeText={setAccountNumber}
                      style={styles.input}
                    />
                  </View>
                </View>
              ) : (
                <View style={styles.form}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Wallet Company</Text>
                    <TextInput
                      placeholder="e.g., Wave"
                      placeholderTextColor="#9ca3af"
                      value={company}
                      onChangeText={setCompany}
                      style={styles.input}
                    />
                  </View>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Wallet Number</Text>
                    <TextInput
                      placeholder="e.g., 220-000-000"
                      placeholderTextColor="#9ca3af"
                      keyboardType="number-pad"
                      value={walletNumber}
                      onChangeText={setWalletNumber}
                      style={styles.input}
                    />
                  </View>
                </View>
              )}
            </ScrollView>
            <View style={styles.sheetFooter}>
              <TouchableOpacity
                onPress={onSubmit}
                disabled={submitting || (activeTab === 'bank' ? !canSubmitBank : !canSubmitWallet)}
                style={[styles.primaryBtn, (submitting || (activeTab === 'bank' ? !canSubmitBank : !canSubmitWallet)) && { opacity: 0.6 }]}
              >
                <Text style={styles.primaryBtnText}>{submitting ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
            <SafeAreaView edges={['bottom']} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#ffffff' },
  safeTop: { backgroundColor: '#16a34a' },
  safeBottom: { flex: 1, backgroundColor: '#f9fafb' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8, paddingTop: 12 },
  headerBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)' },
  headerTitle: { color: '#ffffff', fontSize: 20, fontWeight: '800' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 8 },
  sectionTitle: { fontSize: 14, color: '#6b7280', fontWeight: '700', marginBottom: 8, marginTop: 4 },
  cardsList: { gap: 8 },
  emptyCard: { padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#ffffff', alignItems: 'center' },
  emptyText: { color: '#6b7280', fontSize: 14 },
  card: { backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', padding: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  cardSub: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  cardMeta: { fontSize: 13, color: '#374151', marginTop: 6, fontWeight: '700' },
  iconBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fee2e2' },

  sheetOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject as any },
  sheetContainer: { backgroundColor: '#ffffff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '80%', paddingBottom: 8 },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb', marginTop: 8, marginBottom: 8 },
  tabsRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  tabBtn: { flex: 1, backgroundColor: '#f3f4f6', paddingVertical: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb' },
  tabBtnActive: { backgroundColor: '#dcfce7', borderColor: '#bbf7d0' },
  tabText: { color: '#6b7280', fontWeight: '700' },
  tabTextActive: { color: '#166534' },
  sheetScroll: { paddingHorizontal: 16 },
  sheetContent: { paddingBottom: 12 },
  form: { gap: 12 },
  inputGroup: { gap: 6 },
  label: { fontSize: 13, fontWeight: '700', color: '#374151' },
  input: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: '#111827' },
  sheetFooter: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12, borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  primaryBtn: { backgroundColor: '#16a34a', paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  primaryBtnText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
});


