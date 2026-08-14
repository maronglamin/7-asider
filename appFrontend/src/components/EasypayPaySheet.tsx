import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Modal,
  Alert,
  Linking,
  ActivityIndicator,
  TextInput,
  useWindowDimensions,
  Image,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CreditCard } from 'lucide-react-native';
import { apiPostAuth } from '../api/client';
import {
  easypayBrandLogos,
  easypayWalletIsWave,
  easypayWalletLogoSource,
  easypayWalletNeedsPayerPhone,
} from '../utils/easypayWalletLogos';
import {
  EASYPAY_OWNER_PAYMENT_NOT_READY,
  friendlyEasypayActionError,
  friendlyEasypayPrepareError,
  friendlyEasypayWalletError,
  isEasypayAlreadyPaidMessage,
} from '../utils/easypayBookerMessages';

const easypayMark = require('../../assets/easypay_logo_file2.jpeg');

export type EasypayWalletOption = {
  gatewayId: string;
  code: string;
  name: string;
  checkoutAdapter: string;
  hasStoredPayerPhone: boolean;
};

type PrepareRes = {
  ok: boolean;
  order: { id: string; publicCode: string; status: string; total: number; currency: string };
  wallets: EasypayWalletOption[];
};

function isApsCheckoutAdapter(adapter: string | undefined | null) {
  return String(adapter || '').toLowerCase().includes('aps');
}

export type EasypayPaySheetProps = {
  visible: boolean;
  bookingId: string | null;
  token: string | null | undefined;
  /** Optional line under the title (e.g. after creating a booking). */
  subtitle?: string;
  onClose: () => void;
  /** Prepare found the booking already paid. */
  onAlreadyPaid?: (bookingId: string) => void;
  /** Wallet/APS checkout was submitted; parent should refresh and poll. */
  onPaymentSubmitted?: (bookingId: string) => void;
};

export function EasypayPaySheet({
  visible,
  bookingId,
  token,
  subtitle,
  onClose,
  onAlreadyPaid,
  onPaymentSubmitted,
}: EasypayPaySheetProps) {
  const { height: windowHeight } = useWindowDimensions();
  const easypaySheetMaxHeight = Math.round(windowHeight * 0.85);
  const [payPrepareLoading, setPayPrepareLoading] = useState(false);
  const [payWalletLoading, setPayWalletLoading] = useState(false);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [easypayOrder, setEasypayOrder] = useState<{
    id: string;
    publicCode: string;
    status: string;
    total: number;
    currency: string;
  } | null>(null);
  const [easypayWallets, setEasypayWallets] = useState<EasypayWalletOption[]>([]);
  const [paySheetRefreshing, setPaySheetRefreshing] = useState(false);
  const [apsGateway, setApsGateway] = useState<{ code: string; name: string } | null>(null);
  const [apsStep, setApsStep] = useState<'mobile' | 'otp'>('mobile');
  const [apsMobile, setApsMobile] = useState('');
  const [apsAuthState, setApsAuthState] = useState('');
  const [apsOtp, setApsOtp] = useState('');
  const [apsRequiresOtp, setApsRequiresOtp] = useState(false);
  const [apsLoading, setApsLoading] = useState(false);
  const [yonnaWallet, setYonnaWallet] = useState<{
    gatewayId: string;
    code: string;
    name: string;
    checkoutAdapter: string;
  } | null>(null);
  const [yonnaMobile, setYonnaMobile] = useState('');

  const clearApsCheckout = () => {
    setApsGateway(null);
    setApsStep('mobile');
    setApsMobile('');
    setApsAuthState('');
    setApsOtp('');
    setApsRequiresOtp(false);
    setApsLoading(false);
    setYonnaWallet(null);
    setYonnaMobile('');
  };

  const prepareEasypayCheckout = async (id: string, mode: 'open' | 'refresh') => {
    if (!token) return;
    if (mode === 'refresh') setPaySheetRefreshing(true);
    else setPayPrepareLoading(true);
    if (mode === 'open') {
      setPrepareError(null);
      setEasypayOrder(null);
      setEasypayWallets([]);
    } else {
      setPrepareError(null);
    }
    try {
      const res = await apiPostAuth<PrepareRes>(`/bookings/${id}/easypay/prepare`, {}, token as string);
      setPrepareError(null);
      clearApsCheckout();
      setEasypayOrder(res.order);
      setEasypayWallets(Array.isArray(res.wallets) ? res.wallets : []);
    } catch (e: any) {
      const msg = e?.message || 'Could not load directPay checkout.';
      if (isEasypayAlreadyPaidMessage(msg)) {
        onAlreadyPaid?.(id);
        clearApsCheckout();
        setPrepareError(null);
        return;
      }
      const friendly = friendlyEasypayPrepareError(msg);
      setPrepareError(friendly);
      if (mode !== 'refresh') {
        setEasypayOrder(null);
        setEasypayWallets([]);
      }
    } finally {
      if (mode === 'refresh') setPaySheetRefreshing(false);
      else setPayPrepareLoading(false);
    }
  };

  useEffect(() => {
    if (!visible || !bookingId || !token) return;
    clearApsCheckout();
    void prepareEasypayCheckout(bookingId, 'open');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prepare when the sheet opens for a booking
  }, [visible, bookingId, token]);

  const closeSheet = () => {
    clearApsCheckout();
    onClose();
  };

  const onSelectWallet = (w: {
    gatewayId: string;
    code: string;
    name: string;
    checkoutAdapter: string;
  }) => {
    if (isApsCheckoutAdapter(w.checkoutAdapter)) {
      setYonnaWallet(null);
      setYonnaMobile('');
      setApsGateway({ code: w.code, name: w.name });
      setApsStep('mobile');
      setApsMobile('');
      setApsAuthState('');
      setApsOtp('');
      setApsRequiresOtp(false);
      return;
    }
    if (easypayWalletNeedsPayerPhone(w)) {
      setApsGateway(null);
      setYonnaWallet({
        gatewayId: w.gatewayId,
        code: w.code,
        name: w.name,
        checkoutAdapter: w.checkoutAdapter,
      });
      setYonnaMobile('');
      return;
    }
    void startWallet(w);
  };

  const runYonnaContinue = () => {
    if (!yonnaWallet || !bookingId || !token) return;
    const digits = yonnaMobile.replace(/\D/g, '');
    if (digits.length < 7) {
      Alert.alert('Mobile number', 'Enter the mobile number linked to your Yonna wallet.');
      return;
    }
    void startWallet(yonnaWallet, { payerPhone: digits });
  };

  const runApsAuthorize = async () => {
    if (!bookingId || !token || !apsGateway) return;
    const digits = apsMobile.replace(/\D/g, '');
    if (digits.length < 7) {
      Alert.alert('Mobile number', 'Enter a valid mobile number registered with APS (digits only).');
      return;
    }
    setApsLoading(true);
    try {
      const res = await apiPostAuth<{ ok: boolean; authState: string; requiresOtp: boolean }>(
        `/bookings/${bookingId}/easypay/aps/authorize`,
        { gatewayCode: apsGateway.code, payerMobile: digits },
        token as string,
      );
      setApsAuthState(res.authState);
      setApsRequiresOtp(!!res.requiresOtp);
      if (res.requiresOtp) {
        setApsStep('otp');
      } else {
        await runApsCompleteWith(res.authState, undefined);
      }
    } catch (e: any) {
      Alert.alert('APS', friendlyEasypayActionError(e?.message) || 'Could not start APS payment.');
    } finally {
      setApsLoading(false);
    }
  };

  const runApsCompleteWith = async (authState: string, otp: string | undefined) => {
    if (!bookingId || !token || !apsGateway) return;
    setApsLoading(true);
    try {
      const body: { gatewayCode: string; authState: string; otp?: string } = {
        gatewayCode: apsGateway.code,
        authState,
      };
      if (otp != null && String(otp).trim() !== '') body.otp = String(otp).trim();
      await apiPostAuth(`/bookings/${bookingId}/easypay/aps/complete`, body, token as string);
      Alert.alert(
        'Payment submitted',
        'If directPay confirms the payment, this screen will update to Paid automatically within a short time.',
      );
      const paidId = bookingId;
      clearApsCheckout();
      onPaymentSubmitted?.(paidId);
    } catch (e: any) {
      Alert.alert('APS', friendlyEasypayActionError(e?.message) || 'Could not complete payment.');
    } finally {
      setApsLoading(false);
    }
  };

  const runApsCompleteTap = async () => {
    if (!apsAuthState) {
      Alert.alert('APS', 'Authorize first with your mobile number.');
      return;
    }
    if (apsRequiresOtp && !apsOtp.trim()) {
      Alert.alert('OTP required', 'Enter the code sent to your phone.');
      return;
    }
    await runApsCompleteWith(apsAuthState, apsOtp.trim() || undefined);
  };

  const startWallet = async (
    w: { gatewayId: string; code: string; name: string; checkoutAdapter: string },
    opts?: { payerPhone?: string },
  ) => {
    if (!bookingId || !token) return;
    const payerDigits = String(opts?.payerPhone || '').replace(/\D/g, '');
    if (easypayWalletNeedsPayerPhone(w) && payerDigits.length < 7) {
      Alert.alert('Mobile number', 'Enter the mobile number linked to your Yonna wallet.');
      return;
    }
    try {
      setPayWalletLoading(true);
      const body: { gatewayCode: string; payerPhone?: string; gatewayId?: string } = { gatewayCode: w.code };
      if (w.gatewayId) body.gatewayId = w.gatewayId;
      if (easypayWalletNeedsPayerPhone(w) && payerDigits) body.payerPhone = payerDigits;
      const res = await apiPostAuth<{
        ok: boolean;
        launchUrl: string;
        checkoutAdapter?: string;
      }>(`/bookings/${bookingId}/easypay/wallet`, body, token as string);
      const url = String(res.launchUrl || '').trim();
      if (!url) {
        Alert.alert('Payment', friendlyEasypayWalletError(''));
        return;
      }
      const bid = bookingId;
      try {
        await Linking.openURL(url);
      } catch {
        Alert.alert(
          'Could not open link',
          easypayWalletIsWave(w)
            ? 'Try updating the Wave app or open this payment in your phone browser. You can pull down on this sheet to refresh after paying.'
            : 'Try again or complete the payment in your wallet app if it opens manually.',
        );
        return;
      }
      Alert.alert(
        'Complete payment',
        easypayWalletIsWave(w)
          ? 'Finish the payment in the Wave app or browser. This booking will show as Paid when directPay confirms the transfer.'
          : 'Finish the payment in your wallet app or browser. This list will update to Paid automatically when directPay confirms the transfer.',
      );
      clearApsCheckout();
      onPaymentSubmitted?.(bid);
    } catch (e: any) {
      Alert.alert('Payment', friendlyEasypayWalletError(e?.message));
    } finally {
      setPayWalletLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={closeSheet}
    >
      <View style={styles.sheetOverlay} pointerEvents="box-none">
        <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={closeSheet} />
        <View
          style={[
            styles.sheetContainer,
            styles.easypaySheetContainer,
            { maxHeight: easypaySheetMaxHeight, height: easypaySheetMaxHeight },
          ]}
        >
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Pay with directPay</Text>
          {subtitle ? <Text style={styles.sheetSubtitle}>{subtitle}</Text> : null}
          <ScrollView
            style={styles.easypaySheetScroll}
            contentContainerStyle={[
              styles.easypaySheetScrollContent,
              !payPrepareLoading && styles.easypaySheetScrollContentGrow,
            ]}
            refreshControl={
              <RefreshControl
                refreshing={paySheetRefreshing}
                onRefresh={() => {
                  if (bookingId && token && !payPrepareLoading) {
                    void prepareEasypayCheckout(bookingId, 'refresh');
                  }
                }}
                colors={['#16a34a']}
                tintColor="#16a34a"
              />
            }
          >
            {payPrepareLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: 24, gap: 12 }}>
                <ActivityIndicator size="large" color="#16a34a" />
                <Text style={{ color: '#6b7280' }}>Preparing checkout…</Text>
              </View>
            ) : prepareError ? (
              <View style={{ paddingVertical: 12 }}>
                <Text style={{ color: '#b91c1c', fontSize: 14, lineHeight: 20 }}>{prepareError}</Text>
              </View>
            ) : easypayOrder ? (
              <>
                <View style={styles.payAmountBox}>
                  <Text style={styles.payAmountLabel}>Amount due</Text>
                  <Text style={styles.payAmountValue}>
                    {easypayOrder.currency || 'GMD'} {Number(easypayOrder.total).toFixed(2)}
                  </Text>
                  <Text style={styles.payRef}>Order {easypayOrder.publicCode}</Text>
                </View>
                {apsGateway ? (
                  <View style={{ gap: 14, marginTop: 4 }}>
                    <TouchableOpacity
                      onPress={() => clearApsCheckout()}
                      disabled={apsLoading}
                      style={{ alignSelf: 'flex-start', paddingVertical: 6 }}
                    >
                      <Text style={{ color: '#16a34a', fontWeight: '700', fontSize: 15 }}>← All payment methods</Text>
                    </TouchableOpacity>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <Image
                        source={easypayBrandLogos.aps}
                        style={styles.walletLogoThumb}
                        resizeMode="contain"
                        accessibilityLabel="APS Wallet"
                      />
                      <Text style={{ fontSize: 16, fontWeight: '800', color: '#111827', flex: 1 }}>
                        {apsGateway.name}
                      </Text>
                    </View>
                    {apsStep === 'mobile' ? (
                      <View style={{ gap: 10 }}>
                        <Text style={{ fontSize: 14, color: '#4b5563', lineHeight: 20 }}>
                          Enter the mobile number linked to your APS wallet. directPay will send or confirm an OTP where
                          required.
                        </Text>
                        <TextInput
                          value={apsMobile}
                          onChangeText={setApsMobile}
                          placeholder="Mobile number (digits)"
                          keyboardType="phone-pad"
                          style={styles.phoneInput}
                          placeholderTextColor="#9ca3af"
                          editable={!apsLoading}
                        />
                        <TouchableOpacity
                          style={[styles.sheetPrimary, apsLoading && { opacity: 0.65 }]}
                          disabled={apsLoading}
                          onPress={() => void runApsAuthorize()}
                        >
                          <Text style={styles.sheetPrimaryText}>{apsLoading ? 'Please wait…' : 'Continue'}</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={{ gap: 10 }}>
                        <Text style={{ fontSize: 14, color: '#4b5563', lineHeight: 20 }}>
                          Enter the OTP from APS / your bank SMS, then confirm payment.
                        </Text>
                        <TextInput
                          value={apsOtp}
                          onChangeText={setApsOtp}
                          placeholder="OTP code"
                          keyboardType="number-pad"
                          style={styles.phoneInput}
                          placeholderTextColor="#9ca3af"
                          editable={!apsLoading}
                        />
                        <TouchableOpacity
                          style={[styles.sheetPrimary, apsLoading && { opacity: 0.65 }]}
                          disabled={apsLoading}
                          onPress={() => void runApsCompleteTap()}
                        >
                          <Text style={styles.sheetPrimaryText}>{apsLoading ? 'Please wait…' : 'Confirm payment'}</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ) : yonnaWallet ? (
                  <View style={{ gap: 14, marginTop: 4 }}>
                    <TouchableOpacity
                      onPress={() => clearApsCheckout()}
                      disabled={payWalletLoading}
                      style={{ alignSelf: 'flex-start', paddingVertical: 6 }}
                    >
                      <Text style={{ color: '#16a34a', fontWeight: '700', fontSize: 15 }}>← All payment methods</Text>
                    </TouchableOpacity>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <Image
                        source={easypayBrandLogos.yonna}
                        style={styles.walletLogoThumb}
                        resizeMode="contain"
                        accessibilityLabel="Yonna Wallet"
                      />
                      <Text style={{ fontSize: 16, fontWeight: '800', color: '#111827', flex: 1 }}>
                        {yonnaWallet.name}
                      </Text>
                    </View>
                    <View style={{ gap: 10 }}>
                      <Text style={{ fontSize: 14, color: '#4b5563', lineHeight: 20 }}>
                        Enter the mobile number linked to your Yonna wallet, then continue to open Yonna and complete
                        payment.
                      </Text>
                      <TextInput
                        value={yonnaMobile}
                        onChangeText={setYonnaMobile}
                        placeholder="Yonna wallet mobile (digits)"
                        keyboardType="phone-pad"
                        style={styles.phoneInput}
                        placeholderTextColor="#9ca3af"
                        editable={!payWalletLoading}
                      />
                      <TouchableOpacity
                        style={[styles.sheetPrimary, payWalletLoading && { opacity: 0.65 }]}
                        disabled={payWalletLoading}
                        onPress={() => void runYonnaContinue()}
                      >
                        <Text style={styles.sheetPrimaryText}>{payWalletLoading ? 'Please wait…' : 'Continue'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: '#374151', marginBottom: 8, marginTop: 4 }}>
                      Payment method
                    </Text>
                    {(easypayWallets || []).length === 0 ? (
                      <View style={{ gap: 12 }}>
                        <Text style={{ color: '#6b7280', lineHeight: 20 }}>{EASYPAY_OWNER_PAYMENT_NOT_READY}</Text>
                        {!!bookingId && (
                          <TouchableOpacity
                            style={styles.sheetPrimary}
                            onPress={() => void prepareEasypayCheckout(bookingId, 'refresh')}
                            disabled={paySheetRefreshing || payPrepareLoading}
                          >
                            <Text style={styles.sheetPrimaryText}>
                              {paySheetRefreshing || payPrepareLoading ? 'Refreshing…' : 'Refresh payment methods'}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ) : (
                      <View style={{ gap: 10 }}>
                        {easypayWallets.map((w) => {
                          const logo = easypayWalletLogoSource(w);
                          const aps = isApsCheckoutAdapter(w.checkoutAdapter);
                          const wave = easypayWalletIsWave(w);
                          const yonna = easypayWalletNeedsPayerPhone(w);
                          const subtitleText = aps
                            ? 'Pay in app'
                            : wave
                              ? 'Tap to pay in Wave'
                              : yonna
                                ? 'Enter mobile on next step'
                                : 'Tap to pay';
                          return (
                            <TouchableOpacity
                              key={w.gatewayId || w.code}
                              style={[styles.walletOption, (payWalletLoading || apsLoading) && { opacity: 0.6 }]}
                              disabled={payWalletLoading || apsLoading}
                              onPress={() => onSelectWallet(w)}
                            >
                              {logo ? (
                                <Image
                                  source={logo}
                                  style={styles.walletLogoThumb}
                                  resizeMode="contain"
                                  accessibilityLabel={w.name}
                                />
                              ) : (
                                <View style={styles.walletLogoFallback}>
                                  <CreditCard size={26} color="#6b7280" />
                                </View>
                              )}
                              <View style={styles.walletTextCol}>
                                <Text style={styles.walletName}>{w.name}</Text>
                                <Text style={styles.walletMeta}>{subtitleText}</Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </>
                )}
              </>
            ) : null}
            {!payPrepareLoading ? (
              <>
                <View style={styles.easypaySheetFooterSpacer} />
                <View style={styles.easypaySheetFooter}>
                  <View style={styles.easypaySheetFooterDivider} />
                  <Text style={styles.easypaySheetFooterLabel}>Payments powered by</Text>
                  <View style={styles.easypaySheetFooterLogoCard}>
                    <Image
                      source={easypayMark}
                      style={styles.easypaySheetFooterLogo}
                      resizeMode="contain"
                      accessibilityLabel="directPay"
                    />
                  </View>
                </View>
              </>
            ) : null}
          </ScrollView>
          <SafeAreaView edges={['bottom']} style={{ backgroundColor: '#ffffff' }} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  sheetBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
  },
  easypaySheetContainer: {
    zIndex: 1,
    elevation: 24,
    width: '100%',
  },
  easypaySheetScroll: {
    flex: 1,
    minHeight: 120,
  },
  sheetContainer: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 30,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e5e7eb',
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  sheetSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  sheetPrimary: {
    backgroundColor: '#16a34a',
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 12,
  },
  sheetPrimaryText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
  payAmountBox: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  payAmountLabel: { fontSize: 12, fontWeight: '700', color: '#166534', textTransform: 'uppercase' },
  payAmountValue: { fontSize: 26, fontWeight: '900', color: '#14532d', marginTop: 4 },
  payRef: { fontSize: 13, color: '#15803d', marginTop: 6 },
  walletOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  walletLogoThumb: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
  },
  walletLogoFallback: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
  },
  walletTextCol: { flex: 1, minWidth: 0 },
  walletName: { fontSize: 16, fontWeight: '800', color: '#111827' },
  walletMeta: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  phoneInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#ffffff',
  },
  easypaySheetScrollContent: {
    paddingHorizontal: 4,
    paddingBottom: 20,
  },
  easypaySheetScrollContentGrow: { flexGrow: 1 },
  easypaySheetFooterSpacer: { flexGrow: 1, minHeight: 24 },
  easypaySheetFooter: {
    alignItems: 'center',
    width: '100%',
    paddingTop: 4,
    paddingBottom: 4,
    marginTop: 8,
  },
  easypaySheetFooterDivider: {
    alignSelf: 'stretch',
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#d1d5db',
    marginBottom: 18,
  },
  easypaySheetFooterLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9ca3af',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  easypaySheetFooterLogoCard: {
    width: '100%',
    maxWidth: 308,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } },
      android: { elevation: 2 },
    }),
  },
  easypaySheetFooterLogo: {
    width: '100%',
    height: 52,
  },
});
