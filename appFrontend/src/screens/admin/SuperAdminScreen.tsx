import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, ShieldCheck, UserCog, Users, Building2, CalendarCheck, Mail, ClipboardList } from 'lucide-react-native';

export default function SuperAdminScreen({ navigation }: { navigation?: any }) {
  const insets = useSafeAreaInsets();
  const adminItems = [
    { key: 'adminUsers', title: 'Admin Users', icon: UserCog, route: 'AdminUsers' },
    { key: 'users', title: 'Users', icon: Users, route: 'Users' },
    { key: 'assetOwners', title: 'Asset owner', icon: Building2, route: 'AssetOwners' },
    { key: 'bookings', title: 'Bookings', icon: CalendarCheck, route: 'AdminBookings' },
    { key: 'contractInvitation', title: 'Contract Invitation', icon: Mail, route: 'ContractInvitation' },
    { key: 'invitedList', title: 'Invited List', icon: ClipboardList, route: 'ContractInvitationsList' },
  ];
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation?.goBack()}>
          <ArrowLeft size={24} color="#ffffff" />
        </TouchableOpacity>
        <View style={styles.headerTitleRow}>
          <ShieldCheck size={22} color="#ffffff" />
          <Text style={styles.title}>Super Admin</Text>
        </View>
        <Text style={styles.subtitle}>Administrative tools and overviews</Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.sectionLabel}>Dashboard</Text>
        <View style={styles.grid}>
          {adminItems.map(item => {
            const IconComponent = item.icon;
            return (
              <TouchableOpacity
                key={item.key}
                style={styles.gridCard}
                activeOpacity={0.8}
                onPress={() => navigation?.navigate(item.route)}
              >
                <View style={styles.cardIconWrap}>
                  <IconComponent size={22} color="#16a34a" />
                </View>
                <Text style={styles.cardTitle}>{item.title}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  header: { backgroundColor: '#16a34a', paddingHorizontal: 24, paddingBottom: 24 },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  title: { fontSize: 22, fontWeight: '800', color: '#ffffff' },
  subtitle: { fontSize: 14, color: '#dcfce7' },
  content: { flex: 1, padding: 16, backgroundColor: '#f9fafb' },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  gridCard: { width: '48%', backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 16, marginBottom: 12 },
  cardIconWrap: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#ecfdf5', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  card: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 16 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 6 },
  cardText: { fontSize: 14, color: '#374151' },
});


