import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Image,
  Alert,
  Platform,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Calendar, ChevronDown, ChevronUp, Clock, Minus, Plus } from 'lucide-react-native';
import { apiGet, apiGetAuth, apiPatchAuth, apiPostAuth, resolveMediaUrl } from '../api/client';
import { BookedFieldStatusBanner } from '../components/BookedFieldStatusBanner';
import { useAuth } from '../context/AuthContext';

type DateItem = {
  full: string;
  day: string;
  date: number;
  month: string;
  isWeekend?: boolean;
};

interface BookingScreenProps {
  navigation?: any;
  route?: any;
}

const toDateKey = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString().slice(0, 10);

const toSlotLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00 - ${String((hour + 1) % 24).padStart(2, '0')}:00`;

const addDaysToKey = (dateKey: string, days: number) => {
  const next = new Date(`${dateKey}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return toDateKey(next);
};

type DurationPreset = '1h' | '2h' | '3h' | 'halfDay' | 'day' | '2d' | '3d' | 'week' | 'custom';

/** Human-readable booking length label from preset (for reschedule UI). */
const presetDurationLabel = (p: DurationPreset): string => {
  switch (p) {
    case '1h':
      return '1 hour';
    case '2h':
      return '2 hours';
    case '3h':
      return '3 hours';
    case 'halfDay':
      return '12 hours (half day)';
    case 'day':
      return 'Full day (24 hours)';
    case '2d':
      return '2 days';
    case '3d':
      return '3 days';
    case 'week':
      return '7 days';
    case 'custom':
      return 'Custom length';
    default:
      return 'Booking';
  }
};

const formatSelectedHourRange = (selectedTimes: string[]): string => {
  if (!selectedTimes.length) return '';
  const first = selectedTimes[0] || '';
  const last = selectedTimes[selectedTimes.length - 1] || '';
  const start = first.slice(0, 5);
  const endPart = last.includes(' - ') ? last.split(' - ')[1] : last.slice(-5);
  return `${start} – ${endPart}`;
};

const buildInitialSelection = (booking: any) => {
  const start = booking?.startAt ? new Date(booking.startAt) : null;
  const end = booking?.endAt ? new Date(booking.endAt) : null;
  if (!start || !end) return null;

  const totalHours = Math.max(1, Math.round((+end - +start) / 3600000));
  const bookingType = String(booking?.type || 'HOURLY').toUpperCase();
  const selectedDate = toDateKey(start);

  if (bookingType === 'FULL_DAY') {
    return {
      preset: 'day' as const,
      customHours: 1,
      selectedDate,
      selectedDates: [selectedDate],
      selectedTimes: [] as string[],
    };
  }

  if (bookingType === 'MULTI_DAY') {
    const totalDays = Math.max(1, Math.round(totalHours / 24));
    return {
      preset: totalDays === 2 ? '2d' as const : totalDays === 3 ? '3d' as const : 'week' as const,
      customHours: 1,
      selectedDate,
      selectedDates: Array.from({ length: totalDays }, (_, i) => addDaysToKey(selectedDate, i)),
      selectedTimes: [] as string[],
    };
  }

  const startHour = start.getUTCHours();
  return {
    preset: totalHours === 1 ? '1h' as const : totalHours === 2 ? '2h' as const : totalHours === 3 ? '3h' as const : totalHours === 12 ? 'halfDay' as const : 'custom' as const,
    customHours: totalHours,
    selectedDate,
    selectedDates: [selectedDate],
    selectedTimes: Array.from({ length: totalHours }, (_, i) => toSlotLabel(startHour + i)),
  };
};

/** Mirrors backend `toUtcMidnight` in bookings route (plan uses UTC calendar days). */
function toUtcMidnightDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

function clampBookingHour(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(23, Math.max(0, Math.floor(n)));
}

/**
 * Same startAt/endAt semantics as backend `buildBookingPlan` so we can detect a no-op reschedule.
 */
function computeRescheduleBoundsFromUi(params: {
  preset: DurationPreset;
  customHours: number;
  selectedDate: string;
  selectedDates: string[];
  selectedTimes: string[];
}): { startAt: Date; endAt: Date } | null {
  const { preset, customHours, selectedDate, selectedDates, selectedTimes } = params;
  const isHoursBased = preset === '1h' || preset === '2h' || preset === '3h' || preset === 'halfDay' || preset === 'custom';
  const isFullDay = preset === 'day';
  const isMultiDay = preset === '2d' || preset === '3d' || preset === 'week';

  const hasValid =
    (isHoursBased && !!selectedDate && selectedTimes.length > 0)
    || (isFullDay && !!selectedDate)
    || (isMultiDay && selectedDates.length > 0);
  if (!hasValid) return null;

  type Unit = { date: Date; hourStart: number };
  const units: Unit[] = [];

  if (isFullDay) {
    const day = toUtcMidnightDate(selectedDate);
    for (let h = 0; h < 24; h++) units.push({ date: new Date(day.getTime()), hourStart: h });
  } else if (isMultiDay) {
    for (const ds of selectedDates) {
      const day = toUtcMidnightDate(ds);
      for (let h = 0; h < 24; h++) units.push({ date: new Date(day.getTime()), hourStart: h });
    }
  } else {
    const day = toUtcMidnightDate(selectedDate);
    const firstSlot = selectedTimes[0] || '00:00 - 01:00';
    const start = clampBookingHour(parseInt(firstSlot.slice(0, 2), 10));
    const total = Math.max(1, Math.min(24, selectedTimes.length));
    if (start + total > 24) return null;
    for (let h = 0; h < total; h++) units.push({ date: new Date(day.getTime()), hourStart: start + h });
  }

  const sorted = [...units].sort((a, b) => a.date.getTime() - b.date.getTime() || a.hourStart - b.hourStart);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const startAt = new Date(first.date);
  startAt.setUTCHours(first.hourStart, 0, 0, 0);
  const endAt = new Date(last.date);
  endAt.setUTCHours(last.hourStart + 1, 0, 0, 0);
  return { startAt, endAt };
}

function bookingBoundsMatchDb(booking: any, bounds: { startAt: Date; endAt: Date } | null): boolean {
  if (!bounds || !booking?.startAt || !booking?.endAt) return false;
  const dbS = new Date(booking.startAt).getTime();
  const dbE = new Date(booking.endAt).getTime();
  return bounds.startAt.getTime() === dbS && bounds.endAt.getTime() === dbE;
}

export function BookingScreen({ navigation, route }: BookingScreenProps) {
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const contentWidth = Platform.OS === 'web' ? Math.min(windowWidth, 1180) : windowWidth;
  const { token } = useAuth();
  const fieldId = route?.params?.fieldId as string | undefined;
  const rescheduleBooking = route?.params?.booking;
  const isReschedule = route?.params?.mode === 'reschedule' && !!rescheduleBooking?.id;
  const existingBookingId = isReschedule ? String(rescheduleBooking?.id) : '';
  const didPrefillRef = useRef(false);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [endDate, setEndDate] = useState<string>('');
  const [selectedTimes, setSelectedTimes] = useState<string[]>([]);
  const [preset, setPreset] = useState<'1h' | '2h' | '3h' | 'halfDay' | 'day' | '2d' | '3d' | 'week' | 'custom'>('1h');
  const [customHours, setCustomHours] = useState<number>(1);
  const [showTimeSheet, setShowTimeSheet] = useState<boolean>(false);
  const [rescheduleDurationExpanded, setRescheduleDurationExpanded] = useState(false);
  const [bookedHours, setBookedHours] = useState<number[]>([]);
  const [conflictMsg, setConflictMsg] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [field, setField] = useState<any | null>(null);
  const [imageIndex, setImageIndex] = useState<number>(0);

  const buildAvailabilityPath = React.useCallback((date: string) =>
    `/bookings/availability?fieldId=${encodeURIComponent(fieldId || '')}&date=${encodeURIComponent(date)}${existingBookingId ? `&excludeBookingId=${encodeURIComponent(existingBookingId)}` : ''}`,
  [existingBookingId, fieldId]);

  useEffect(() => {
    didPrefillRef.current = false;
    setRescheduleDurationExpanded(false);
  }, [existingBookingId]);

  useEffect(() => {
    if (!isReschedule || didPrefillRef.current) return;
    const initial = buildInitialSelection(rescheduleBooking);
    if (!initial) return;
    setPreset(initial.preset);
    setCustomHours(Math.max(1, Math.min(24, initial.customHours)));
    setSelectedDate(initial.selectedDate);
    setSelectedDates(initial.selectedDates);
    setSelectedTimes(initial.selectedTimes);
    didPrefillRef.current = true;
  }, [isReschedule, rescheduleBooking]);

  useEffect(() => {
    if (!fieldId) {
      setLoading(false);
      return;
    }
    let mounted = true;
    const fromRoute = route?.params?.booking as any;
    (async () => {
      try {
        setLoading(true);
        if (isReschedule && existingBookingId && token) {
          const res = await apiGetAuth<{ booking: any }>(`/bookings/${existingBookingId}`, token);
          if (!mounted) return;
          const f = res?.booking?.field;
          if (f) {
            setField({
              ...f,
              pricePerHour: f.pricePerHour != null ? Number(f.pricePerHour) : null,
            });
          }
          return;
        }
        if (isReschedule && fromRoute?.field) {
          const f = fromRoute.field;
          if (!mounted) return;
          setField({
            ...f,
            pricePerHour: f.pricePerHour != null ? Number(f.pricePerHour) : null,
          });
          return;
        }
        const data = await apiGet<any>(`/fields/kyc/public/${fieldId}`);
        if (!mounted) return;
        setField(data);
      } catch (_e) {
        if (!mounted) return;
        if (isReschedule && fromRoute?.field) {
          const f = fromRoute.field;
          setField({
            ...f,
            pricePerHour: f.pricePerHour != null ? Number(f.pricePerHour) : null,
          });
        } else {
          setField(null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [fieldId, isReschedule, existingBookingId, token, route?.params?.booking?.id]);

  const onRefresh = React.useCallback(async () => {
    const fromRoute = route?.params?.booking as any;
    try {
      setRefreshing(true);
      if (!fieldId) return;
      if (isReschedule && existingBookingId && token) {
        const res = await apiGetAuth<{ booking: any }>(`/bookings/${existingBookingId}`, token);
        const f = res?.booking?.field;
        if (f) {
          setField({
            ...f,
            pricePerHour: f.pricePerHour != null ? Number(f.pricePerHour) : null,
          });
        }
      } else {
        const data = await apiGet<any>(`/fields/kyc/public/${fieldId}`);
        setField(data);
      }
      if (selectedDate) {
        const res = await apiGet<{ date: string; hours: { hour: number; available: boolean }[] }>(
          buildAvailabilityPath(selectedDate)
        );
        const taken = res.hours.filter((h) => !h.available).map((h) => h.hour);
        setBookedHours(taken);
      }
    } catch (_e) {
      if (isReschedule && fromRoute?.field) {
        const f = fromRoute.field;
        setField({
          ...f,
          pricePerHour: f.pricePerHour != null ? Number(f.pricePerHour) : null,
        });
      }
    } finally {
      setRefreshing(false);
    }
  }, [buildAvailabilityPath, fieldId, isReschedule, existingBookingId, token, selectedDate, route?.params?.booking]);

  // Generate next 7 days
  const generateDates = (anchorDate?: string): DateItem[] => {
    const dates: DateItem[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      dates.push({
        full: date.toISOString().split('T')[0] || '',
        day: date.toLocaleDateString('en-US', { weekday: 'short' }),
        date: date.getDate(),
        month: date.toLocaleDateString('en-US', { month: 'short' }),
        isWeekend: [0, 6].includes(date.getDay()),
      });
    }
    if (anchorDate && !dates.some((d) => d.full === anchorDate)) {
      const extra = new Date(`${anchorDate}T00:00:00.000Z`);
      dates.push({
        full: anchorDate,
        day: extra.toLocaleDateString('en-US', { weekday: 'short' }),
        date: extra.getUTCDate(),
        month: extra.toLocaleDateString('en-US', { month: 'short' }),
        isWeekend: [0, 6].includes(extra.getUTCDay()),
      });
      dates.sort((a, b) => a.full.localeCompare(b.full));
    }
    return dates;
  };

  const dates: DateItem[] = useMemo(() => generateDates(selectedDate), [selectedDate]);

  // Generate hourly time slots from 00:00 to 23:00
  const generateTimeSlots = () => {
    const slots = [];
    for (let i = 0; i < 24; i++) {
      const startHour = i.toString().padStart(2, '0');
      const endHour = ((i + 1) % 24).toString().padStart(2, '0');
      slots.push(`${startHour}:00 - ${endHour}:00`);
    }
    return slots;
  };

  const timeSlots = generateTimeSlots();

  // Load availability when date changes
  useEffect(() => {
    const fieldId = route?.params?.fieldId as string | undefined;
    if (!fieldId || !selectedDate) {
      setBookedHours([]);
      return;
    }
    (async () => {
      try {
        const res = await apiGet<{ date: string; hours: { hour: number; available: boolean }[] }>(
          buildAvailabilityPath(selectedDate)
        );
        const taken = res.hours.filter((h) => !h.available).map((h) => h.hour);
        setBookedHours(taken);
        setConflictMsg('');
      } catch (_e) {
        setBookedHours([]);
      }
    })();
  }, [buildAvailabilityPath, route?.params?.fieldId, selectedDate]);

  const parseHour = (slot: string) => parseInt(slot.slice(0, 2), 10);

  const getNeededHours = (): number => {
    if (preset === '2h') return 2;
    if (preset === '3h') return 3;
    if (preset === 'halfDay') return 12;
    if (preset === 'custom') return Math.max(1, Math.min(24, customHours));
    return 1;
  };

  const handleTimeSelect = (slot: string) => {
    const startHour = parseHour(slot);
    const neededHours = getNeededHours();
    if (startHour + neededHours > 24) return;
    const newSelection: string[] = [];
    for (let h = 0; h < neededHours; h++) {
      const s = `${String(startHour + h).padStart(2, '0')}:00 - ${String((startHour + h + 1) % 24).padStart(2, '0')}:00`;
      newSelection.push(s);
    }
    setSelectedTimes(newSelection);
  };

  const handleBooking = async () => {
    const isHoursBased = preset === '1h' || preset === '2h' || preset === '3h' || preset === 'halfDay' || preset === 'custom';
    const isFullDay = preset === 'day';
    const isMultiDay = preset === '2d' || preset === '3d' || preset === 'week';
    const hasValid = (isHoursBased && selectedDate && selectedTimes.length > 0)
      || (isFullDay && !!selectedDate)
      || (isMultiDay && selectedDates.length > 0);
    if (!hasValid) return;
    if (isReschedule && existingBookingId && rescheduleUnchanged) return;
    try {
      const fieldId = route?.params?.fieldId as string | undefined;
      if (!fieldId) throw new Error('Missing fieldId');
      if (!token) {
        Alert.alert('Login required', 'Please login to place a booking.');
        return;
      }
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      let body: any = { fieldId, kind: 'HOURLY', timezone };
      if (isFullDay) {
        body = { fieldId, kind: 'FULL_DAY', dates: [selectedDate], timezone };
      } else if (isMultiDay) {
        body = { fieldId, kind: 'MULTI_DAY', dates: selectedDates, timezone };
      } else {
        const firstSlot = selectedTimes[0] || '00:00 - 01:00';
        const startHour = parseInt(firstSlot.slice(0, 2), 10);
        const hours = selectedTimes.length;
        body = { fieldId, kind: preset === 'custom' ? 'CUSTOM' : 'HOURLY', date: selectedDate, startHour, hours, timezone };
      }
      if (isReschedule && existingBookingId) {
        const res = await apiPatchAuth<{ ok: boolean; booking: any }>(`/bookings/${existingBookingId}/reschedule`, body, token || '');
        const nextBooking = {
          ...(rescheduleBooking || {}),
          ...(res?.booking || {}),
          field: res?.booking?.field || field || rescheduleBooking?.field,
        };
        Alert.alert('Booking Updated', 'Your booking has been rescheduled.', [{
          text: 'OK',
          onPress: () => navigation?.navigate('CustomerBookedDetails', { booking: nextBooking }),
        }]);
        return;
      }

      await apiPostAuth<{ ok: boolean; bookingId: string; totalAmount: number }>(`/bookings`, body, token || '');
      Alert.alert('Booking Confirmed', 'Your booking has been created.', [{ text: 'OK', onPress: () => navigation?.goBack() }]);
    } catch (e: any) {
      const msg = e?.message || (isReschedule ? 'Failed to reschedule booking' : 'Failed to create booking');
      if (/conflict/i.test(msg) || /409/.test(msg)) {
        setConflictMsg(`Selected ${isHoursBased ? 'time' : 'date'} conflicts with an existing booking. Please choose another option.`);
        // Refresh availability
        const fieldId = route?.params?.fieldId as string | undefined;
        if (fieldId && selectedDate) {
          try {
            const res = await apiGet<{ date: string; hours: { hour: number; available: boolean }[] }>(
              buildAvailabilityPath(selectedDate)
            );
            const taken = res.hours.filter((h) => !h.available).map((h) => h.hour);
            setBookedHours(taken);
          } catch (_) {}
        }
      } else {
        setConflictMsg(msg);
      }
      Alert.alert(isReschedule ? 'Reschedule Failed' : 'Booking Failed', msg);
    }
  };

  const pricePerHour = useMemo(() => {
    const n = field?.pricePerHour;
    if (n == null) return null;
    const num = typeof n === 'number' ? n : Number(n);
    return Number.isFinite(num) ? num : null;
  }, [field]);

  const isHoursBased = preset === '1h' || preset === '2h' || preset === '3h' || preset === 'halfDay' || preset === 'custom';
  const isFullDay = preset === 'day';
  const isMultiDay = preset === '2d' || preset === '3d' || preset === 'week';
  const maxDays = preset === '2d' ? 2 : preset === '3d' ? 3 : preset === 'week' ? 7 : 1;
  const showBookingSummary =
    (isHoursBased && !!selectedDate && selectedTimes.length > 0)
    || (isFullDay && !!selectedDate)
    || (isMultiDay && selectedDates.length > 0);

  const rescheduleUnchanged = useMemo(() => {
    if (!isReschedule || !rescheduleBooking) return false;
    const bounds = computeRescheduleBoundsFromUi({
      preset,
      customHours,
      selectedDate,
      selectedDates,
      selectedTimes,
    });
    return bookingBoundsMatchDb(rescheduleBooking, bounds);
  }, [isReschedule, rescheduleBooking, preset, customHours, selectedDate, selectedDates, selectedTimes]);

  /** Space so the docked summary bar does not cover date/time controls (notably when reschedule prefills selection). */
  const scrollBottomPadding = showBookingSummary ? 88 + insets.bottom : 28;

  const priorBookingLine = useMemo(() => {
    if (!isReschedule || !rescheduleBooking?.startAt) return '';
    const start = new Date(rescheduleBooking.startAt);
    const end = rescheduleBooking?.endAt ? new Date(rescheduleBooking.endAt) : null;
    const type = String(rescheduleBooking?.type || 'HOURLY').toUpperCase();
    if (type === 'FULL_DAY') {
      return `Was: full day · ${start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}`;
    }
    if (type === 'MULTI_DAY' && end) {
      const days = Math.max(1, Math.round((+end - +start) / (24 * 3600000)));
      return `Was: ${days} day${days > 1 ? 's' : ''} · from ${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    }
    if (end) {
      return `Was: ${start.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} – ${end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
    }
    return `Was: ${start.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
  }, [isReschedule, rescheduleBooking]);

  const durationChipOptions = useMemo(
    () =>
      [
        { k: '1h' as const, t: '1h' },
        { k: '2h' as const, t: '2h' },
        { k: '3h' as const, t: '3h' },
        { k: 'halfDay' as const, t: 'Half-day' },
        { k: 'day' as const, t: 'Day' },
        { k: '2d' as const, t: '2 days' },
        { k: '3d' as const, t: '3 days' },
        { k: 'week' as const, t: 'Week' },
        { k: 'custom' as const, t: 'Custom' },
      ] as { k: typeof preset; t: string }[],
    [],
  );

  const sheetDateLabel = selectedDate
    ? new Date(`${selectedDate}T12:00:00.000Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : '';

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <SafeAreaView edges={["top"]} style={styles.topSafe} />
      {isReschedule ? (
        <View style={styles.rescheduleHeaderBar}>
          <TouchableOpacity
            style={styles.rescheduleBackBtn}
            onPress={() => navigation?.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ArrowLeft size={22} color="#111827" />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.imageContainer}>
          {Array.isArray(field?.images) && field.images.length > 1 ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              style={styles.slider}
              onMomentumScrollEnd={(e) => {
                const idx = Math.round(e.nativeEvent.contentOffset.x / contentWidth);
                setImageIndex(idx);
              }}
            >
              {field.images.map((img: any, idx: number) => (
                <Image
                  key={img.id || `img-${idx}`}
                  source={{ uri: resolveMediaUrl(img.url) || undefined }}
                  style={[styles.fieldImage, { width: contentWidth, height: 256 }]}
                />
              ))}
            </ScrollView>
          ) : (
            <Image
              source={{ uri: resolveMediaUrl(field?.images?.[0]?.url) || 'https://via.placeholder.com/800x400?text=Field' }}
              style={[styles.fieldImage, { width: contentWidth, height: 256 }]}
            />
          )}
          {Array.isArray(field?.images) && field.images.length > 1 && (
            <View style={styles.dotsContainer}>
              {field.images.map((_: any, i: number) => (
                <View key={i} style={[styles.dot, i === imageIndex ? styles.dotActive : undefined]} />
              ))}
            </View>
          )}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation?.goBack()}
          >
            <ArrowLeft size={24} color="#111827" />
          </TouchableOpacity>
        </View>
      )}

      {/* Field Info */}
      <View style={[styles.fieldInfo, isReschedule && styles.fieldInfoReschedule]}>
        {isReschedule ? (
          <>
            <View style={styles.rescheduleTitleRow}>
              <View style={styles.rescheduleBadge}>
                <Text style={styles.rescheduleBadgeText}>Reschedule</Text>
              </View>
            </View>
            <Text style={styles.fieldName}>{field?.name || 'Field'}</Text>
            <Text style={styles.rescheduleLead}>Choose a new date{isHoursBased ? ' and start time' : ''}. Everything else stays the same until you confirm.</Text>
            {!!priorBookingLine && <Text style={styles.priorBookingLine}>{priorBookingLine}</Text>}
            <View style={styles.fieldDetails}>
              <Text style={styles.fieldDistance}>{field?.city || field?.address || ''}</Text>
              <Text style={styles.fieldPrice}>{pricePerHour != null ? `GMD ${pricePerHour}/hour` : '—'}</Text>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.fieldName}>{field?.name || 'Field'}</Text>
            <View style={styles.fieldDetails}>
              <Text style={styles.fieldDistance}>{field?.city || field?.address || ''}</Text>
              <Text style={styles.fieldPrice}>{pricePerHour != null ? `GMD ${pricePerHour}/hour` : '—'}</Text>
            </View>
          </>
        )}
      </View>

      <BookedFieldStatusBanner
        status={field?.status}
        rejectionReason={field?.rejectionReason}
        suspensionReason={field?.suspensionReason}
      />

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: scrollBottomPadding }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Duration */}
        {isReschedule ? (
          <View style={[styles.section, styles.sectionReschedule]}>
            <View style={styles.sectionHeader}>
              <Clock size={20} color="#16a34a" />
              <Text style={styles.sectionTitle}>Length</Text>
            </View>
            <View style={styles.rescheduleLengthCard}>
              <Text style={styles.rescheduleLengthMain}>
                {preset === 'custom' ? `${customHours} hour${customHours !== 1 ? 's' : ''}` : presetDurationLabel(preset)}
              </Text>
              <Text style={styles.rescheduleLengthHint}>Matches this booking. Expand only if you need a different length.</Text>
              <TouchableOpacity
                style={styles.rescheduleLengthToggle}
                onPress={() => setRescheduleDurationExpanded((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={rescheduleDurationExpanded ? 'Hide length options' : 'Show length options'}
              >
                {rescheduleDurationExpanded ? <ChevronUp size={18} color="#166534" /> : <ChevronDown size={18} color="#166534" />}
                <Text style={styles.rescheduleLengthToggleText}>{rescheduleDurationExpanded ? 'Hide options' : 'Change length'}</Text>
              </TouchableOpacity>
            </View>
            {rescheduleDurationExpanded && (
              <>
                <View style={styles.chipsRow}>
                  {durationChipOptions.map((c) => (
                    <TouchableOpacity
                      key={c.k}
                      onPress={() => {
                        setPreset(c.k);
                        setSelectedTimes([]);
                        setEndDate('');
                      }}
                      style={[styles.chip, preset === c.k && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, preset === c.k && styles.chipTextActive]}>{c.t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {preset === 'custom' && (
                  <View style={styles.customRow}>
                    <Text style={styles.customLabel}>Hours</Text>
                    <View style={styles.counter}>
                      <TouchableOpacity style={styles.counterBtn} onPress={() => setCustomHours(Math.max(1, customHours - 1))}>
                        <Minus size={18} color="#111827" />
                      </TouchableOpacity>
                      <Text style={styles.counterValue}>{customHours}</Text>
                      <TouchableOpacity style={styles.counterBtn} onPress={() => setCustomHours(Math.min(24, customHours + 1))}>
                        <Plus size={18} color="#111827" />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </>
            )}
          </View>
        ) : (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Clock size={20} color="#16a34a" />
              <Text style={styles.sectionTitle}>Duration</Text>
            </View>
            <View style={styles.chipsRow}>
              {durationChipOptions.map((c) => (
                <TouchableOpacity
                  key={c.k}
                  onPress={() => {
                    setPreset(c.k);
                    setSelectedTimes([]);
                    setEndDate('');
                  }}
                  style={[styles.chip, preset === c.k && styles.chipActive]}
                >
                  <Text style={[styles.chipText, preset === c.k && styles.chipTextActive]}>{c.t}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {preset === 'custom' && (
              <View style={styles.customRow}>
                <Text style={styles.customLabel}>Hours</Text>
                <View style={styles.counter}>
                  <TouchableOpacity style={styles.counterBtn} onPress={() => setCustomHours(Math.max(1, customHours - 1))}>
                    <Minus size={18} color="#111827" />
                  </TouchableOpacity>
                  <Text style={styles.counterValue}>{customHours}</Text>
                  <TouchableOpacity style={styles.counterBtn} onPress={() => setCustomHours(Math.min(24, customHours + 1))}>
                    <Plus size={18} color="#111827" />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}
        {/* Date (+ start time when rescheduling an hourly booking) */}
        <View style={[styles.section, isReschedule && isHoursBased && styles.sectionRescheduleWhen]}>
          <View style={styles.sectionHeader}>
            <Calendar size={20} color="#16a34a" />
            <Text style={styles.sectionTitle}>
              {isReschedule && isHoursBased ? 'New date & start time' : isMultiDay ? 'Select Days' : 'Select Date'}
            </Text>
          </View>
          {isReschedule && isHoursBased && (
            <Text style={styles.rescheduleStepHint}>Pick a free day, then choose when your block should begin.</Text>
          )}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.datesContainer}>
            {dates.map((date) => {
              const isSelected = isMultiDay
                ? selectedDates.includes(date.full)
                : selectedDate === date.full;
              return (
                <TouchableOpacity
                  key={date.full}
                  style={[
                    styles.dateCard,
                    date.isWeekend && styles.weekendDateCard,
                    isSelected && styles.selectedDateCard,
                  ]}
                  onPress={() => {
                    if (isMultiDay) {
                      setSelectedDates((prev) => {
                        const exists = prev.includes(date.full);
                        if (exists) return prev.filter((d) => d !== date.full);
                        if (prev.length >= maxDays) return prev; // limit
                        return [...prev, date.full];
                      });
                    } else {
                      setSelectedDate(date.full);
                    }
                  }}
                >
                  <Text style={styles.dateDay}>{date.day}</Text>
                  <Text style={styles.dateNumber}>{date.date}</Text>
                  <Text style={styles.dateMonth}>{date.month}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          {!isReschedule && <Text style={styles.helpNote}>Weekends and holidays may have special pricing and availability.</Text>}

          {isReschedule && isHoursBased && (
            <>
              {!!conflictMsg && <Text style={[styles.conflictText, styles.conflictTextReschedule]}>{conflictMsg}</Text>}
              <Text style={[styles.timeStepLabel, !selectedDate && styles.timeStepLabelMuted]}>Start time</Text>
              {!selectedDate ? (
                <View style={styles.noDateWrapReschedule}>
                  <Text style={styles.noDateText}>Select a date above to see available times.</Text>
                </View>
              ) : (
                <TouchableOpacity style={styles.timeOpenCard} onPress={() => setShowTimeSheet(true)} activeOpacity={0.85}>
                  <View style={styles.timeOpenCardTextWrap}>
                    <Text style={styles.timeOpenCardTitle}>
                      {selectedTimes.length ? formatSelectedHourRange(selectedTimes) : 'Choose start time'}
                    </Text>
                    <Text style={styles.timeOpenCardSub}>
                      {selectedTimes.length
                        ? `${getNeededHours()} hour${getNeededHours() !== 1 ? 's' : ''} on ${sheetDateLabel}`
                        : `${getNeededHours()} consecutive hour${getNeededHours() !== 1 ? 's' : ''} from one start slot`}
                    </Text>
                  </View>
                  <Clock size={22} color="#16a34a" />
                </TouchableOpacity>
              )}
            </>
          )}
        </View>

        {/* Time Selection — new bookings only (hourly reschedule uses combined section above) */}
        {isHoursBased && !isReschedule && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Clock size={20} color="#16a34a" />
              <Text style={styles.sectionTitle}>Select Time</Text>
            </View>
            {!!conflictMsg && (
              <Text style={styles.conflictText}>{conflictMsg}</Text>
            )}
            {!selectedDate ? (
              <View style={styles.noDateContainer}>
                <Text style={styles.noDateText}>Please select a date first</Text>
              </View>
            ) : (
              <TouchableOpacity style={styles.timeOpenButton} onPress={() => setShowTimeSheet(true)}>
                <Text style={styles.timeOpenText}>
                  {selectedTimes.length ? `${selectedTimes.length} slot${selectedTimes.length > 1 ? 's' : ''} selected` : 'Choose Time Slots'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>

      {showBookingSummary ? (
        <View style={[styles.confirmDock, { paddingBottom: Math.max(16, 12 + insets.bottom) }]}>
          <TouchableOpacity
            style={[styles.confirmButton, isReschedule && rescheduleUnchanged && styles.confirmButtonDisabled]}
            onPress={handleBooking}
            activeOpacity={0.9}
            disabled={isReschedule && rescheduleUnchanged}
            accessibilityState={{ disabled: !!(isReschedule && rescheduleUnchanged) }}
          >
            <Text style={styles.confirmButtonText}>{isReschedule ? 'Confirm reschedule' : 'Confirm booking'}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <SafeAreaView edges={["bottom"]} style={styles.bottomSafe} />

      {/* Bottom Sheet for time slots */}
      <Modal visible={showTimeSheet} animationType="slide" transparent>
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={() => setShowTimeSheet(false)} />
          <View style={styles.sheetContainer}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{isReschedule ? 'Choose start time' : 'Select Time Slots'}</Text>
            <Text style={styles.sheetSubtitle}>
              {sheetDateLabel
                ? isReschedule
                  ? `${sheetDateLabel} — tap where your ${getNeededHours()}h booking should start`
                  : `${sheetDateLabel} — choose your start time`
                : 'Choose your start time'}
            </Text>
            <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
              <View style={styles.timeSlotsContainer}>
                {timeSlots.map((time) => {
                  const hour = parseHour(time);
                  const neededHrs = getNeededHours();
                  const rangeConflict = Array.from({ length: neededHrs }, (_, i) => hour + i).some((h) => bookedHours.includes(h));
                  const isBooked = bookedHours.includes(hour) || rangeConflict;
                  const isSelected = selectedTimes.includes(time);
                  const canStart = hour + neededHrs <= 24;
                  const disabled = isBooked || !canStart;
                  return (
                    <TouchableOpacity
                      key={time}
                      style={[
                        styles.timeSlot,
                        (disabled || isBooked) && styles.bookedTimeSlot,
                        isSelected && styles.selectedTimeSlot,
                      ]}
                      onPress={() => !disabled && handleTimeSelect(time)}
                      disabled={disabled}
                    >
                      <Text
                        style={[
                          styles.timeSlotText,
                          (disabled || isBooked) && styles.bookedTimeSlotText,
                          isSelected && styles.selectedTimeSlotText,
                        ]}
                      >
                        {time}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
            <TouchableOpacity style={styles.sheetClose} onPress={() => setShowTimeSheet(false)}>
              <Text style={styles.sheetCloseText}>Done</Text>
            </TouchableOpacity>
          </View>
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
  imageContainer: {
    position: 'relative',
  },
  rescheduleHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  rescheduleBackBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
  },
  fieldImage: {
    height: 256,
    resizeMode: 'cover',
  },
  slider: {
    width: '100%',
  },
  backButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    padding: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  dotsContainer: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  dotActive: {
    backgroundColor: '#ffffff',
  },
  fieldInfo: {
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  fieldInfoReschedule: {
    paddingBottom: 20,
  },
  rescheduleTitleRow: {
    marginBottom: 10,
  },
  rescheduleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  rescheduleBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#166534',
    letterSpacing: 0.3,
  },
  rescheduleLead: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 22,
    marginBottom: 8,
  },
  priorBookingLine: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 14,
    lineHeight: 18,
  },
  fieldName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  fieldDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fieldDistance: {
    fontSize: 16,
    color: '#6b7280',
  },
  fieldPrice: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#16a34a',
  },
  content: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  section: {
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  sectionReschedule: {
    paddingBottom: 18,
    backgroundColor: '#fafafa',
  },
  sectionRescheduleWhen: {
    backgroundColor: '#ffffff',
  },
  rescheduleLengthCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 16,
  },
  rescheduleLengthMain: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
  },
  rescheduleLengthHint: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 18,
    marginBottom: 12,
  },
  rescheduleLengthToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
  },
  rescheduleLengthToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#166534',
  },
  rescheduleStepHint: {
    fontSize: 14,
    color: '#4b5563',
    lineHeight: 20,
    marginBottom: 14,
    marginTop: -4,
  },
  timeStepLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 4,
    marginBottom: 10,
  },
  timeStepLabelMuted: {
    color: '#9ca3af',
  },
  noDateWrapReschedule: {
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  timeOpenCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  timeOpenCardTextWrap: {
    flex: 1,
  },
  timeOpenCardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#14532d',
    marginBottom: 4,
  },
  timeOpenCardSub: {
    fontSize: 13,
    color: '#166534',
    lineHeight: 18,
  },
  conflictTextReschedule: {
    marginTop: 4,
    marginBottom: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  chipActive: {
    backgroundColor: '#dcfce7',
    borderColor: '#16a34a',
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  chipTextActive: {
    color: '#166534',
  },
  customRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  customLabel: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '600',
  },
  counter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  counterBtn: {
    backgroundColor: '#f3f4f6',
    padding: 8,
    borderRadius: 8,
  },
  counterValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    minWidth: 20,
    textAlign: 'center',
  },
  datesContainer: {
    flexDirection: 'row',
  },
  dateCard: {
    width: 64,
    height: 80,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    backgroundColor: '#ffffff',
  },
  weekendDateCard: {
    borderColor: '#fde68a',
  },
  selectedDateCard: {
    borderColor: '#16a34a',
    backgroundColor: '#dcfce7',
  },
  rangeDateCard: {
    borderColor: '#bbf7d0',
    backgroundColor: '#f0fdf4',
  },
  dateDay: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  dateNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  dateMonth: {
    fontSize: 12,
    color: '#6b7280',
  },
  helpNote: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 8,
  },
  noDateContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  noDateText: {
    fontSize: 16,
    color: '#6b7280',
  },
  timeSlotsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  timeSlot: {
    flex: 1,
    minWidth: '45%',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  bookedTimeSlot: {
    backgroundColor: '#f3f4f6',
    borderColor: '#d1d5db',
  },
  selectedTimeSlot: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },
  timeSlotText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  bookedTimeSlotText: {
    color: '#9ca3af',
  },
  selectedTimeSlotText: {
    color: '#ffffff',
  },
  conflictText: {
    fontSize: 13,
    color: '#b91c1c',
    backgroundColor: '#fee2e2',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    marginBottom: 12,
  },
  confirmDock: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingHorizontal: 16,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 4,
  },
  confirmButton: {
    backgroundColor: '#16a34a',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  confirmButtonDisabled: {
    opacity: 0.45,
  },
  confirmButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  bottomSafe: {
    backgroundColor: '#f9fafb',
  },
  timeOpenButton: {
    backgroundColor: '#16a34a',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  timeOpenText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject as any,
  },
  sheetContainer: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '75%',
    paddingBottom: 16,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e5e7eb',
    marginTop: 8,
    marginBottom: 8,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    alignSelf: 'center',
    marginBottom: 4,
  },
  sheetSubtitle: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
    lineHeight: 18,
  },
  sheetScroll: {
    paddingHorizontal: 16,
  },
  sheetContent: {
    paddingBottom: 16,
  },
  sheetClose: {
    marginTop: 8,
    marginHorizontal: 16,
    backgroundColor: '#16a34a',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  sheetCloseText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});