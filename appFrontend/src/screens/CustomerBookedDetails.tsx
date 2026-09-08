import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Pressable,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Animatable from 'react-native-animatable';
import { ArrowLeft, Calendar, Clock, Swords, X, CheckCircle2, AlertCircle } from 'lucide-react-native';
import { apiGetAuth, apiPostAuth, resolveMediaUrl } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { BookedFieldStatusBanner } from '../components/BookedFieldStatusBanner';
import { BookingCheckInQrCard } from '../components/BookingCheckInQrCard';
import { isBookingPaid } from '../utils/easypayBookerMessages';
import { challengeInviteMessage, shareText } from '../lib/squad-share';

interface Props {
  navigation?: any;
  route?: any;
}

export default function CustomerBookedDetails({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth() as any;
  const bookingId = (route?.params?.booking?.id || route?.params?.bookingId) as string | undefined;
  const [booking, setBooking] = useState<any>(route?.params?.booking);
  const field = booking?.field || {};
  const fieldStatus = String(field?.status || '').toUpperCase();
  const canBookAgain = !fieldStatus || fieldStatus === 'APPROVED';
  const bookingStatusUpper = String(booking?.status || '').toUpperCase();
  const viewer = booking?.viewer || {};
  const isBooker = viewer.isBooker ?? (booking?.userId && user?.id && booking.userId === user.id);
  const closedStatuses = ['CANCELLED', 'COMPLETED', 'PENDING_REFUND'];
  const canManage = viewer.canManage ?? Boolean(isBooker && !closedStatuses.includes(bookingStatusUpper));
  const canReschedule = canManage && !closedStatuses.includes(bookingStatusUpper);
  const canCancelBooking = Boolean(token && bookingId && canManage && !closedStatuses.includes(bookingStatusUpper));
  const canChallenge = Boolean(viewer.canChallenge);
  const squadLinks = Array.isArray(booking?.squads) ? booking.squads : [];
  const homeSquad = squadLinks.find((s: any) => s.side === 'HOME')?.squad;
  const awaySquad = squadLinks.find((s: any) => s.side === 'AWAY')?.squad;

  type CancelSheetPhase = 'confirm' | 'loading' | 'success' | 'error';
  const [cancelSheetVisible, setCancelSheetVisible] = useState(false);
  const [cancelSheetPhase, setCancelSheetPhase] = useState<CancelSheetPhase>('confirm');
  const [cancelSheetError, setCancelSheetError] = useState<string | undefined>();
  const imgRel = field?.images?.[0]?.url;
  const image = resolveMediaUrl(imgRel) || 'https://via.placeholder.com/800x400?text=Field';
  const [receipts, setReceipts] = useState<any[]>([]);
  const [loadingReceipts, setLoadingReceipts] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [challengeBusy, setChallengeBusy] = useState(false);

  const start = booking?.startAt ? new Date(booking.startAt) : null;
  const end = booking?.endAt ? new Date(booking.endAt) : null;
  const durationHours = start && end ? Math.max(1, Math.round((+end - +start) / 3600000)) : null;

  // Build per-day hourly breakdown between start and end
  const breakdown: { day: string; slots: string[] }[] = (() => {
    if (!start || !end) return [];
    const slots: { day: string; slot: string }[] = [];
    const pad = (n: number) => String(n).padStart(2, '0');
    const cursor = new Date(start);
    while (cursor < end) {
      const dayKey = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate()))
        .toISOString()
        .slice(0, 10);
      const h = cursor.getUTCHours();
      const nextH = (h + 1) % 24;
      slots.push({ day: dayKey, slot: `${pad(h)}:00 - ${pad(nextH)}:00` });
      cursor.setUTCHours(h + 1, 0, 0, 0);
    }
    const byDay: Record<string, string[]> = {};
    for (const s of slots) {
      if (!byDay[s.day]) byDay[s.day] = [] as string[];
      (byDay[s.day] as string[]).push(s.slot);
    }
    return Object.keys(byDay).map((day) => ({ day, slots: byDay[day] || [] }));
  })();

  useEffect(() => {
    setBooking(route?.params?.booking);
  }, [route?.params?.booking]);

  useEffect(() => {
    (async () => {
      try {
        if (!token || !bookingId) return;
        const res = await apiGetAuth<{ booking: any }>(`/bookings/${bookingId}`, token as string);
        if (res?.booking) setBooking(res.booking);
      } catch (_) {
        /* keep params booking */
      }
    })();
  }, [bookingId, token]);

  useEffect(() => {
    (async () => {
      try {
        if (!token || !bookingId) return;
        setLoadingReceipts(true);
        const res = await apiGetAuth<{ items: any[] }>(`/bookings/${bookingId}/receipts`, token as string);
        setReceipts(res.items || []);
      } catch (_) {
        setReceipts([]);
      } finally {
        setLoadingReceipts(false);
      }
    })();
  }, [bookingId, token]);

  const scheduleSummary =
    start && end
      ? `${start.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} → ${end.toLocaleString(undefined, { timeStyle: 'short' })}`
      : '';

  const openCancelSheet = () => {
    setCancelSheetPhase('confirm');
    setCancelSheetError(undefined);
    setCancelSheetVisible(true);
  };

  const closeCancelSheet = () => {
    if (cancelSheetPhase === 'loading') return;
    setCancelSheetVisible(false);
  };

  const sendChallenge = async () => {
    if (!token || !bookingId || !homeSquad?.id) return;
    setChallengeBusy(true);
    try {
      const res = await apiPostAuth<{ ok: boolean; challenge: { token: string } }>(
        `/squads/${homeSquad.id}/challenges`,
        { bookingId },
        token as string,
      );
      const tokenValue = res.challenge?.token;
      if (!tokenValue) throw new Error('Challenge link missing');
      try {
        await shareText(
          challengeInviteMessage({
            fromName: homeSquad.name,
            fromEmoji: homeSquad.emoji,
            fieldName: field?.name,
            token: tokenValue,
          }),
          '7v7 challenge',
        );
      } catch {
        /* cancelled */
      }
      Alert.alert('Challenge ready', 'Drop the link in another squad’s chat. Their captain taps to lock in as away.');
    } catch (e: any) {
      Alert.alert('Challenge', e?.message || 'Could not create a challenge.');
    } finally {
      setChallengeBusy(false);
    }
  };

  const executeCancelBooking = async () => {
    if (!token || !bookingId) return;
    setCancelSheetPhase('loading');
    setCancelSheetError(undefined);
    try {
      await apiPostAuth<{ ok?: boolean }>(`/bookings/${bookingId}/cancel`, {}, token as string);
      try {
        const res = await apiGetAuth<{ booking: any }>(`/bookings/${bookingId}`, token as string);
        if (res?.booking) setBooking(res.booking);
        else setBooking((prev: any) => (prev ? { ...prev, status: 'CANCELLED' } : prev));
      } catch {
        setBooking((prev: any) => (prev ? { ...prev, status: 'CANCELLED' } : prev));
      }
      setCancelSheetPhase('success');
    } catch (e: any) {
      setCancelSheetError(e?.message || 'Something went wrong. Please try again.');
      setCancelSheetPhase('error');
    }
  };

  useEffect(() => {
    if (!cancelSheetVisible) {
      const t = setTimeout(() => {
        setCancelSheetPhase('confirm');
        setCancelSheetError(undefined);
      }, 320);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [cancelSheetVisible]);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <SafeAreaView edges={["top"]} style={styles.topSafe} />

      <View style={styles.imageWrap}>
        <Image source={{ uri: image }} style={styles.image} />
        <View style={styles.imageHeroOverlay} pointerEvents="box-none">
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation?.goBack()} accessibilityLabel="Go back">
            <ArrowLeft size={22} color="#111827" />
          </TouchableOpacity>
        </View>
        {canCancelBooking ? (
          <View style={[styles.imageFooterBar, { paddingBottom: 10 + insets.bottom }]} pointerEvents="box-none">
            <View style={styles.heroFooterRow}>
              <TouchableOpacity
                style={styles.cancelHeroCapsule}
                onPress={openCancelSheet}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Cancel booking"
              >
                <X size={15} color="#ffffff" strokeWidth={2.25} />
                <Text style={styles.cancelHeroCapsuleText}>Cancel booking</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerBlock}>
          <Text style={styles.fieldName}>{field?.name || 'Field'}</Text>
          <Text style={styles.fieldSub}>{field?.address || field?.city || ''}</Text>
        </View>

        <BookedFieldStatusBanner
          status={field?.status}
          rejectionReason={field?.rejectionReason}
          suspensionReason={field?.suspensionReason}
        />

        {/* Summary Cards */}
        <View style={styles.summaryBlock}>
          <View style={styles.badgeRow}>
            <Text
              style={[
                styles.badge,
                styles.statusBadge,
                bookingStatusUpper === 'CANCELLED' && styles.cancelledStatusBadge,
                bookingStatusUpper === 'PENDING_REFUND' && styles.pendingRefundStatusBadge,
                bookingStatusUpper === 'COMPLETED' && styles.completedStatusBadge,
              ]}
            >
              {bookingStatusUpper.replace(/_/g, ' ') || 'CONFIRMED'}
            </Text>
            <Text style={[styles.badge, styles.typeBadge]}>{String(booking?.type || 'HOURLY')}</Text>
            {isBookingPaid(booking?.paymentStatus) ? (
              <Text style={[styles.badge, styles.paidBadge]}>PAID</Text>
            ) : null}
          </View>
          {bookingStatusUpper === 'PENDING_REFUND' ? (
            <Text style={styles.refundNote}>The field owner cancelled this booking. A refund is pending.</Text>
          ) : null}
          <View style={styles.summaryRow}>
            <Calendar size={18} color="#16a34a" />
            <Text style={styles.summaryText}>
              {start ? start.toLocaleString() : ''}
              {end ? ` → ${end.toLocaleString()}` : ''}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Clock size={18} color="#16a34a" />
            <Text style={styles.summaryText}>{durationHours ? `${durationHours} hour${durationHours > 1 ? 's' : ''}` : ''}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>GMD {booking?.totalAmount || 0}</Text>
          </View>
        </View>

        {homeSquad ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Squads</Text>
            <View style={styles.squadVsRow}>
              <View style={styles.squadVsCard}>
                <Text style={styles.squadVsEmoji}>{homeSquad.emoji || '⚽'}</Text>
                <Text style={styles.squadVsName}>{homeSquad.name}</Text>
                <Text style={styles.squadVsSide}>Home</Text>
              </View>
              <Text style={styles.squadVsLabel}>vs</Text>
              <View style={styles.squadVsCard}>
                {awaySquad ? (
                  <>
                    <Text style={styles.squadVsEmoji}>{awaySquad.emoji || '⚽'}</Text>
                    <Text style={styles.squadVsName}>{awaySquad.name}</Text>
                    <Text style={styles.squadVsSide}>Away</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.squadVsEmoji}>❔</Text>
                    <Text style={styles.squadVsName}>Open challenge</Text>
                    <Text style={styles.squadVsSide}>Away</Text>
                  </>
                )}
              </View>
            </View>
            {Array.isArray(homeSquad.members) && homeSquad.members.length > 0 ? (
              <Text style={styles.rosterLine}>
                {homeSquad.members.map((m: any) => m.name).filter(Boolean).join(' · ')}
              </Text>
            ) : null}
            {canChallenge && !awaySquad ? (
              <TouchableOpacity style={styles.challengeBtn} onPress={sendChallenge} disabled={challengeBusy}>
                {challengeBusy ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <Swords size={16} color="#ffffff" />
                    <Text style={styles.challengeBtnText}>Challenge another squad</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {isBooker ? (
          <BookingCheckInQrCard
            bookingId={bookingId}
            paymentStatus={booking?.paymentStatus}
            bookingStatus={booking?.status}
            token={token}
          />
        ) : null}

        {/* Hourly Breakdown */}
        {breakdown.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Hourly Breakdown</Text>
            {breakdown.map((d) => (
              <View key={d.day} style={{ marginBottom: 12 }}>
                <Text style={styles.dayLabel}>{new Date(d.day).toLocaleDateString()}</Text>
                <View style={styles.slotsWrap}>
                  {d.slots.map((s) => (
                    <View key={s} style={styles.slotChip}>
                      <Text style={styles.slotText}>{s}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Payment Receipt (if exists) */}
        {isBooker && receipts.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Payment Receipt</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                {receipts.map((r) => (
                  <TouchableOpacity
                    key={r.id}
                    activeOpacity={0.9}
                    onPress={() => { setPreviewUri(resolveMediaUrl(r.imageUrl)); setPreviewVisible(true); }}
                  >
                    <Image
                      source={{ uri: resolveMediaUrl(r.imageUrl) || undefined }}
                      style={{ width: 140, height: 140, borderRadius: 10, backgroundColor: '#f3f4f6' }}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        <View style={styles.actions}>
          {canReschedule && (
            <TouchableOpacity
              style={styles.secondary}
              onPress={() => navigation?.navigate('Booking', { fieldId: field?.id, mode: 'reschedule', booking })}
            >
              <Text style={styles.secondaryText}>Reschedule</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.primary, !canBookAgain && styles.primaryDisabled]}
            disabled={!canBookAgain}
            onPress={() => {
              if (!canBookAgain) return;
              navigation?.navigate('Booking', { fieldId: field?.id });
            }}
          >
            <Text style={styles.primaryText}>Book Again</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      <SafeAreaView edges={["bottom"]} />

      {/* Receipt Preview Modal */}
      <Modal visible={previewVisible} transparent animationType="fade" onRequestClose={() => setPreviewVisible(false)}>
        <View style={styles.previewOverlay}>
          <TouchableOpacity style={styles.previewBackdrop} activeOpacity={1} onPress={() => setPreviewVisible(false)} />
          <View style={styles.previewContent}>
            {!!previewUri && (
              <Image source={{ uri: previewUri }} style={styles.previewImage} resizeMode="contain" />
            )}
            <TouchableOpacity style={styles.previewClose} onPress={() => setPreviewVisible(false)}>
              <Text style={styles.previewCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={cancelSheetVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {
          if (cancelSheetPhase !== 'loading') closeCancelSheet();
        }}
      >
        <View style={styles.cancelSheetRoot}>
          <Pressable
            style={styles.cancelSheetBackdrop}
            onPress={() => {
              if (cancelSheetPhase === 'confirm' || cancelSheetPhase === 'error') closeCancelSheet();
            }}
          />
          <Animatable.View
            animation="slideInUp"
            duration={260}
            useNativeDriver
            style={[styles.cancelSheetPanel, { paddingBottom: Math.max(20, insets.bottom + 16) }]}
          >
            <View style={styles.cancelSheetGrabber} />
            {cancelSheetPhase === 'confirm' ? (
              <>
                <View style={styles.cancelSheetHeaderRow}>
                  <Text style={styles.cancelSheetTitle}>Cancel reservation?</Text>
                  <TouchableOpacity onPress={closeCancelSheet} hitSlop={14} accessibilityLabel="Close">
                    <X size={22} color="#71717a" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.cancelSheetBody}>
                  Your time slots will be released for other players. This action cannot be undone.
                </Text>
                <View style={styles.cancelSheetSummary}>
                  <Text style={styles.cancelSheetSummaryLabel}>Booking</Text>
                  <Text style={styles.cancelSheetSummaryTitle} numberOfLines={2}>{field?.name || 'Field'}</Text>
                  {scheduleSummary ? <Text style={styles.cancelSheetSummaryMeta}>{scheduleSummary}</Text> : null}
                  <View style={styles.cancelSheetSummaryDivider} />
                  <View style={styles.cancelSheetSummaryRow}>
                    <Text style={styles.cancelSheetSummaryLabel}>Total</Text>
                    <Text style={styles.cancelSheetSummaryAmount}>GMD {booking?.totalAmount ?? '—'}</Text>
                  </View>
                </View>
                <TouchableOpacity style={styles.cancelSheetPrimaryBtn} onPress={closeCancelSheet} activeOpacity={0.88}>
                  <Text style={styles.cancelSheetPrimaryBtnText}>Keep reservation</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelSheetDestructiveBtn} onPress={() => void executeCancelBooking()} activeOpacity={0.88}>
                  <Text style={styles.cancelSheetDestructiveBtnText}>Yes, cancel booking</Text>
                </TouchableOpacity>
              </>
            ) : null}

            {cancelSheetPhase === 'loading' ? (
              <View style={styles.cancelSheetCenterBlock}>
                <ActivityIndicator size="large" color="#16a34a" />
                <Text style={styles.cancelSheetLoadingText}>Cancelling reservation…</Text>
              </View>
            ) : null}

            {cancelSheetPhase === 'success' ? (
              <View style={styles.cancelSheetCenterBlock}>
                <View style={styles.cancelSheetSuccessIcon}>
                  <CheckCircle2 size={40} color="#16a34a" strokeWidth={2} />
                </View>
                <Text style={styles.cancelSheetSuccessTitle}>Reservation cancelled</Text>
                <Text style={styles.cancelSheetSuccessBody}>
                  These slots are no longer held for you. You can book again anytime if the field is available.
                </Text>
                <TouchableOpacity
                  style={[styles.cancelSheetPrimaryBtn, styles.cancelSheetDoneBtn]}
                  onPress={closeCancelSheet}
                  activeOpacity={0.88}
                >
                  <Text style={styles.cancelSheetPrimaryBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {cancelSheetPhase === 'error' ? (
              <View style={styles.cancelSheetCenterBlock}>
                <View style={styles.cancelSheetErrorIcon}>
                  <AlertCircle size={40} color="#dc2626" strokeWidth={2} />
                </View>
                <Text style={styles.cancelSheetErrorTitle}>Could not cancel</Text>
                <Text style={styles.cancelSheetErrorBody}>{cancelSheetError}</Text>
                <TouchableOpacity style={styles.cancelSheetPrimaryBtn} onPress={() => void executeCancelBooking()} activeOpacity={0.88}>
                  <Text style={styles.cancelSheetPrimaryBtnText}>Try again</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelSheetGhostBtn} onPress={closeCancelSheet} activeOpacity={0.88}>
                  <Text style={styles.cancelSheetGhostBtnText}>Dismiss</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </Animatable.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  topSafe: {
    backgroundColor: '#16a34a',
  },
  imageWrap: {
    position: 'relative',
  },
  image: {
    width: '100%',
    height: 240,
  },
  imageHeroOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  imageFooterBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.78)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.22)',
  },
  heroFooterRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  cancelHeroCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 100,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.38)',
  },
  cancelHeroCapsuleText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.1,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  backBtn: {
    marginTop: 16,
    marginLeft: 16,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 20,
    padding: 8,
  },
  cancelSheetRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  cancelSheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.48)',
  },
  cancelSheetPanel: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 20,
    paddingTop: 6,
    maxHeight: '88%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 16,
  },
  cancelSheetGrabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d4d4d8',
    alignSelf: 'center',
    marginBottom: 14,
  },
  cancelSheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  cancelSheetTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '600',
    color: '#18181b',
    letterSpacing: -0.35,
    lineHeight: 26,
  },
  cancelSheetBody: {
    fontSize: 15,
    fontWeight: '400',
    color: '#52525b',
    lineHeight: 22,
    marginBottom: 18,
  },
  cancelSheetSummary: {
    backgroundColor: '#fafafa',
    borderRadius: 12,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e4e4e7',
    marginBottom: 20,
  },
  cancelSheetSummaryLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#71717a',
    textTransform: 'uppercase',
    letterSpacing: 0.45,
    marginBottom: 4,
  },
  cancelSheetSummaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#18181b',
    letterSpacing: -0.15,
    marginBottom: 6,
  },
  cancelSheetSummaryMeta: {
    fontSize: 13,
    fontWeight: '400',
    color: '#52525b',
    lineHeight: 18,
  },
  cancelSheetSummaryDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e4e4e7',
    marginVertical: 12,
  },
  cancelSheetSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cancelSheetSummaryAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#16a34a',
    letterSpacing: -0.1,
  },
  cancelSheetPrimaryBtn: {
    alignSelf: 'stretch',
    width: '100%',
    backgroundColor: '#16a34a',
    borderRadius: 14,
    paddingVertical: 16,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 3,
  },
  cancelSheetDoneBtn: {
    marginTop: 4,
    marginBottom: 0,
    paddingVertical: 17,
    minHeight: 54,
  },
  cancelSheetPrimaryBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  cancelSheetDestructiveBtn: {
    alignSelf: 'stretch',
    width: '100%',
    borderRadius: 14,
    paddingVertical: 16,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fef2f2',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#fecaca',
    marginBottom: 4,
  },
  cancelSheetDestructiveBtnText: {
    color: '#b91c1c',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.05,
  },
  cancelSheetCenterBlock: {
    width: '100%',
    alignSelf: 'stretch',
    paddingTop: 8,
    paddingBottom: 8,
    alignItems: 'center',
  },
  cancelSheetLoadingText: {
    marginTop: 16,
    fontSize: 15,
    fontWeight: '500',
    color: '#52525b',
  },
  cancelSheetSuccessIcon: {
    marginBottom: 14,
  },
  cancelSheetSuccessTitle: {
    fontSize: 19,
    fontWeight: '600',
    color: '#18181b',
    letterSpacing: -0.25,
    marginBottom: 8,
    textAlign: 'center',
  },
  cancelSheetSuccessBody: {
    fontSize: 15,
    fontWeight: '400',
    color: '#52525b',
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 22,
    paddingHorizontal: 4,
  },
  cancelSheetErrorIcon: {
    marginBottom: 14,
  },
  cancelSheetErrorTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#18181b',
    marginBottom: 8,
    textAlign: 'center',
  },
  cancelSheetErrorBody: {
    fontSize: 14,
    fontWeight: '400',
    color: '#52525b',
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  cancelSheetGhostBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  cancelSheetGhostBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#16a34a',
  },
  content: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  headerBlock: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  fieldName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  fieldSub: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  summaryBlock: {
    padding: 20,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    fontSize: 12,
    fontWeight: '700',
    overflow: 'hidden',
  },
  statusBadge: {
    backgroundColor: '#dcfce7',
    color: '#166534',
  },
  cancelledStatusBadge: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
  },
  pendingRefundStatusBadge: {
    backgroundColor: '#ffedd5',
    color: '#9a3412',
  },
  completedStatusBadge: {
    backgroundColor: '#e0f2fe',
    color: '#075985',
  },
  refundNote: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
    color: '#9a3412',
    fontWeight: '600',
  },
  typeBadge: {
    backgroundColor: '#e0f2fe',
    color: '#075985',
  },
  paidBadge: {
    backgroundColor: '#dcfce7',
    color: '#166534',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryText: {
    fontSize: 14,
    color: '#111827',
  },
  totalRow: {
    marginTop: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#16a34a',
  },
  section: {
    padding: 20,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  dayLabel: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 6,
  },
  slotsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  slotChip: {
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  slotText: {
    fontSize: 12,
    color: '#111827',
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowText: {
    fontSize: 14,
    color: '#111827',
  },
  rowLabel: {
    fontSize: 14,
    color: '#6b7280',
    width: 80,
  },
  rowValue: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '600',
  },
  actions: {
    marginHorizontal: 20,
    marginBottom: 24,
    gap: 12,
  },
  secondary: {
    borderWidth: 1,
    borderColor: '#16a34a',
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 14,
    backgroundColor: '#ffffff',
  },
  secondaryText: {
    color: '#16a34a',
    fontWeight: '700',
    fontSize: 16,
  },
  primary: {
    backgroundColor: '#16a34a',
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 14,
  },
  primaryDisabled: {
    backgroundColor: '#9ca3af',
  },
  primaryText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
  previewOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  previewBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  previewContent: {
    width: '90%',
    alignItems: 'center',
  },
  previewImage: {
    width: '100%',
    height: 420,
    borderRadius: 12,
    backgroundColor: '#111827',
  },
  previewClose: {
    marginTop: 12,
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  previewCloseText: {
    color: '#111827',
    fontWeight: '800',
  },
  squadVsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  squadVsCard: {
    flex: 1,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 12,
    alignItems: 'center',
  },
  squadVsEmoji: { fontSize: 28, marginBottom: 4 },
  squadVsName: { fontWeight: '700', color: '#111827', textAlign: 'center' },
  squadVsSide: { color: '#6b7280', fontSize: 12, marginTop: 4 },
  squadVsLabel: { fontWeight: '800', color: '#16a34a' },
  rosterLine: { color: '#6b7280', fontSize: 12, marginTop: 10, lineHeight: 18 },
  challengeBtn: {
    marginTop: 12,
    backgroundColor: '#16a34a',
    borderRadius: 8,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  challengeBtnText: { color: '#ffffff', fontWeight: '700' },
});


