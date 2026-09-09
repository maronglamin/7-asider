import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, ChevronRight, LifeBuoy, Send, Ticket } from 'lucide-react-native';

export default function HelpSupportScreen({ navigation }: { navigation?: any }) {
  const insets = useSafeAreaInsets();
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation?.goBack()}>
          <ArrowLeft size={24} color="#ffffff" />
        </TouchableOpacity>
        <View style={styles.headerTitleRow}>
          <LifeBuoy size={22} color="#ffffff" />
          <Text style={styles.title}>Help & Support</Text>
        </View>
        <Text style={styles.subtitle}>Track a request you already sent, or create a new ticket.</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity style={styles.card} onPress={() => navigation?.navigate('MyTickets')} activeOpacity={0.8}>
          <View style={styles.iconWrap}>
            <Ticket size={20} color="#16a34a" />
          </View>
          <View style={styles.copy}>
            <Text style={styles.cardTitle}>Your tickets</Text>
            <Text style={styles.cardSubtitle}>View status and replies from support</Text>
          </View>
          <ChevronRight size={18} color="#9ca3af" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.card} onPress={() => navigation?.navigate('SendSupportRequest')} activeOpacity={0.8}>
          <View style={styles.iconWrap}>
            <Send size={20} color="#16a34a" />
          </View>
          <View style={styles.copy}>
            <Text style={styles.cardTitle}>Send a request</Text>
            <Text style={styles.cardSubtitle}>Ask a question or report a problem</Text>
          </View>
          <ChevronRight size={18} color="#9ca3af" />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: { backgroundColor: '#16a34a', paddingHorizontal: 24, paddingBottom: 24 },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  title: { fontSize: 22, fontWeight: '800', color: '#ffffff' },
  subtitle: { fontSize: 14, color: '#dcfce7', lineHeight: 20 },
  content: { padding: 16, gap: 12 },
  card: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#ecfdf5', alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  cardSubtitle: { fontSize: 13, color: '#6b7280', marginTop: 2 },
});
