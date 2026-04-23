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
  Dimensions,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Calendar, Clock, Minus, Plus } from 'lucide-react-native';
import { apiGet, apiPatchAuth, apiPostAuth, resolveMediaUrl } from '../api/client';
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

export function BookingScreen({ navigation, route }: BookingScreenProps) {
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
    (async () => {
      try {
        const data = await apiGet<any>(`/fields/kyc/public/${fieldId}?all=1`);
        if (!mounted) return;
        setField(data);
      } catch (_e) {
        // keep field null; could show a toast
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [route?.params?.fieldId]);

  const onRefresh = React.useCallback(async () => {
    try {
      setRefreshing(true);
      if (!fieldId) return;
      const data = await apiGet<any>(`/fields/kyc/public/${fieldId}?all=1`);
      setField(data);
      // reload availability if date already selected
      if (selectedDate) {
        const res = await apiGet<{ date: string; hours: { hour: number; available: boolean }[] }>(
          buildAvailabilityPath(selectedDate)
        );
        const taken = res.hours.filter((h) => !h.available).map((h) => h.hour);
        setBookedHours(taken);
      }
    } catch (_e) {
      // ignore
    } finally {
      setRefreshing(false);
    }
  }, [buildAvailabilityPath, fieldId, selectedDate]);

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
    return typeof n === 'number' ? n : null;
  }, [field]);

  const halfDayHours = 12;
  const fullDayHours = 24;

  const calculateTotal = () => {
    if (!pricePerHour) return 'GMD 0/total';
    let hours = 0;
    if (preset === '1h') hours = selectedTimes.length || 1;
    else if (preset === '2h') hours = 2;
    else if (preset === '3h') hours = 3;
    else if (preset === 'halfDay') hours = halfDayHours;
    else if (preset === 'custom') hours = Math.max(1, Math.min(24, customHours));
    else if (preset === 'day') hours = fullDayHours;
    else if (preset === '2d') hours = selectedDates.length * fullDayHours;
    else if (preset === '3d') hours = selectedDates.length * fullDayHours;
    else if (preset === 'week') hours = selectedDates.length * fullDayHours;
    return `GMD ${pricePerHour * hours}/total`;
  };

  const isHoursBased = preset === '1h' || preset === '2h' || preset === '3h' || preset === 'halfDay' || preset === 'custom';
  const isFullDay = preset === 'day';
  const isMultiDay = preset === '2d' || preset === '3d' || preset === 'week';
  const maxDays = preset === '2d' ? 2 : preset === '3d' ? 3 : preset === 'week' ? 7 : 1;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <SafeAreaView edges={["top"]} style={styles.topSafe} />
      {/* Header with Back Button */}
      <View style={styles.imageContainer}>
        {Array.isArray(field?.images) && field.images.length > 1 ? (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={styles.slider}
            onMomentumScrollEnd={(e) => {
              const w = Dimensions.get('window').width;
              const idx = Math.round(e.nativeEvent.contentOffset.x / w);
              setImageIndex(idx);
            }}
          >
            {field.images.map((img: any) => (
              <Image
                key={img.id}
                source={{ uri: resolveMediaUrl(img.url) || undefined }}
                style={styles.fieldImage}
              />
            ))}
          </ScrollView>
        ) : (
          <Image
            source={{ uri: resolveMediaUrl(field?.images?.[0]?.url) || 'https://via.placeholder.com/800x400?text=Field' }}
            style={styles.fieldImage}
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

      {/* Field Info */}
      <View style={styles.fieldInfo}>
        <Text style={styles.fieldName}>{field?.name || 'Field'}</Text>
        <View style={styles.fieldDetails}>
          <Text style={styles.fieldDistance}>{field?.city || field?.address || ''}</Text>
          <Text style={styles.fieldPrice}>{pricePerHour != null ? `GMD ${pricePerHour}/hour` : '—'}</Text>
        </View>
        {isReschedule && (
          <Text style={styles.rescheduleNote}>Choose a new available date and confirm to update this booking.</Text>
        )}
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Presets */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Clock size={20} color="#16a34a" />
            <Text style={styles.sectionTitle}>Duration</Text>
          </View>
          <View style={styles.chipsRow}>
            {([
              { k: '1h', t: '1h' },
              { k: '2h', t: '2h' },
              { k: '3h', t: '3h' },
              { k: 'halfDay', t: 'Half-day' },
              { k: 'day', t: 'Day' },
              { k: '2d', t: '2 days' },
              { k: '3d', t: '3 days' },
              { k: 'week', t: 'Week' },
              { k: 'custom', t: 'Custom' },
            ] as { k: typeof preset; t: string }[]).map((c) => (
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
        {/* Date Selection */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Calendar size={20} color="#16a34a" />
            <Text style={styles.sectionTitle}>{isMultiDay ? 'Select Days' : 'Select Date'}</Text>
          </View>
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
          <Text style={styles.helpNote}>Weekends and holidays may have special pricing and availability.</Text>
        </View>

        {/* Time Selection trigger (hours-based) */}
        {isHoursBased && (
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
                <Text style={styles.timeOpenText}>{selectedTimes.length ? `${selectedTimes.length} slots selected` : 'Choose Time Slots'}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>

      {/* Booking Summary & Confirm Button */}
      {(isHoursBased && selectedDate && selectedTimes.length > 0) || (isFullDay && selectedDate) || (isMultiDay && selectedDates.length > 0) ? (
        <View style={styles.bookingSummary}>
          <View style={styles.summaryContainer}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Date{isMultiDay ? 's' : ''}:</Text>
              <Text style={styles.summaryValue}>
                {isMultiDay
                  ? selectedDates.map((d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })).join(', ')
                  : new Date(selectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            </View>
            {isHoursBased && (
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Selected Times:</Text>
                <Text style={styles.summaryValue}>
                  {selectedTimes.length} slot{selectedTimes.length > 1 ? 's' : ''}
                </Text>
              </View>
            )}
            {isHoursBased && (
              <View style={styles.selectedTimesContainer}>
                {selectedTimes.map((time) => (
                  <View key={time} style={styles.selectedTimeChip}>
                    <Text style={styles.selectedTimeText}>{time}</Text>
                  </View>
                ))}
              </View>
            )}
            <View style={styles.totalContainer}>
              <Text style={styles.totalLabel}>Total:</Text>
              <Text style={styles.totalValue}>{calculateTotal()}</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.confirmButton} onPress={handleBooking}>
            <Text style={styles.confirmButtonText}>{isReschedule ? 'Confirm Reschedule' : 'Confirm Booking'}</Text>
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
            <Text style={styles.sheetTitle}>Select Time Slots</Text>
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
  fieldImage: {
    width: Dimensions.get('window').width,
    height: 256,
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
  rescheduleNote: {
    marginTop: 10,
    fontSize: 13,
    color: '#166534',
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
  bookingSummary: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    padding: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 5,
  },
  summaryContainer: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  summaryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  selectedTimesContainer: {
    marginBottom: 12,
    maxHeight: 80,
  },
  selectedTimeChip: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 8,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  selectedTimeText: {
    fontSize: 12,
    color: '#166534',
    fontWeight: '500',
  },
  totalContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  totalLabel: {
    fontSize: 16,
    color: '#6b7280',
  },
  totalValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#16a34a',
  },
  confirmButton: {
    backgroundColor: '#16a34a',
    paddingVertical: 16,
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
    marginBottom: 8,
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