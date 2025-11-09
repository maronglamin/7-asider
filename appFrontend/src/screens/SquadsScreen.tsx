import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Search, UserPlus, PlusCircle, Users } from 'lucide-react-native';

export function SquadsScreen() {
  const [showComing, setShowComing] = useState(false);
  /*
   Mock data examples (kept for future implementation):
   const mySquads = [
     { id: '1', name: 'Thunder FC', members: 12, logo: '⚡' },
     { id: '2', name: 'Weekend Warriors', members: 8, logo: '⚔️' },
   ];
  */
  const mySquads: any[] = [];

  /*
   Mock data examples (kept for future implementation):
   const friends = [
     { id: '1', name: 'John Smith', avatar: 'https://i.pravatar.cc/150?img=1' },
     { id: '2', name: 'Mike Johnson', avatar: 'https://i.pravatar.cc/150?img=2' },
     { id: '3', name: 'Sarah Williams', avatar: 'https://i.pravatar.cc/150?img=3' },
   ];
  */
  const friends: any[] = [];

  return (
    <View style={styles.screen}>
      <StatusBar style="light" backgroundColor="#16a34a" />
      <SafeAreaView edges={["top"]} style={styles.safeTop} />
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Squads</Text>
        
        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Search size={20} color="#9ca3af" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search squads or friends..."
            placeholderTextColor="#9ca3af"
          />
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Quick Actions */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity style={styles.secondaryAction} onPress={() => setShowComing(true)}>
            <Search size={24} color="#16a34a" />
            <Text style={styles.secondaryActionText}>Join a Squad</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.primaryAction} onPress={() => setShowComing(true)}>
            <PlusCircle size={24} color="#ffffff" />
            <Text style={styles.primaryActionText}>Create Squad</Text>
          </TouchableOpacity>
        </View>

        {/* My Squads */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>My Squads</Text>
          <View style={styles.comingSoonCard}>
            <Text style={styles.comingSoonTitle}>Coming Soon</Text>
            <Text style={styles.comingSoonText}>Manage your squads, coordinate matches, and track performance.
              {"\n"}Release date: Jan 15, 2026
            </Text>
          </View>
          <View style={styles.squadsList}>
            {mySquads.map((squad) => (
              <View key={squad.id} style={styles.squadCard}>
                <View style={styles.squadInfo}>
                  <View style={styles.squadLogo}>
                    <Text style={styles.squadLogoText}>{squad.logo}</Text>
                  </View>
                  <View style={styles.squadDetails}>
                    <Text style={styles.squadName}>{squad.name}</Text>
                    <View style={styles.membersContainer}>
                      <Users size={16} color="#6b7280" />
                      <Text style={styles.membersText}>{squad.members} members</Text>
                    </View>
                  </View>
                </View>
                <TouchableOpacity style={styles.viewButton} onPress={() => setShowComing(true)}>
                  <Text style={styles.viewButtonText}>View</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>

        {/* Friends */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Friends</Text>
            <TouchableOpacity style={styles.addFriendButton} onPress={() => setShowComing(true)}>
              <UserPlus size={16} color="#16a34a" />
              <Text style={styles.addFriendText}>Add Friend</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.comingSoonCard}>
            <Text style={styles.comingSoonTitle}>Coming Soon</Text>
            <Text style={styles.comingSoonText}>Build your friend list, invite players, and form squads.
              {"\n"}Release date: Jan 15, 2026
            </Text>
          </View>
          
          <View style={styles.friendsList}>
            {friends.map((friend) => (
              <View key={friend.id} style={styles.friendCard}>
                <Image source={{ uri: friend.avatar }} style={styles.friendAvatar} />
                <Text style={styles.friendName}>{friend.name}</Text>
                <TouchableOpacity style={styles.inviteButton} onPress={() => setShowComing(true)}>
                  <Text style={styles.inviteButtonText}>Invite</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
      {/* Coming Soon Bottom Sheet */}
      <Modal visible={showComing} animationType="slide" transparent>
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={() => setShowComing(false)} />
          <View style={styles.sheetContainer}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Coming Soon</Text>
            <Text style={styles.sheetSubtitle}>
              Squads and Friends are almost here. You’ll be able to join squads, create your own, and team up with friends easily.
            </Text>
            <Text style={styles.sheetNote}>Expected release: Jan 15, 2026</Text>
            <TouchableOpacity onPress={() => setShowComing(false)} style={styles.sheetPrimary}>
              <Text style={styles.sheetPrimaryText}>Got it</Text>
            </TouchableOpacity>
            <SafeAreaView edges={["bottom"]} />
          </View>
        </View>
      </Modal>
      <SafeAreaView edges={["bottom"]} style={styles.safeBottom} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f9fafb' },
  safeTop: { backgroundColor: '#16a34a' },
  safeBottom: { backgroundColor: '#f9fafb' },
  header: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? 30 : 16,
    paddingBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 16,
  },
  searchContainer: {
    position: 'relative',
  },
  searchIcon: {
    position: 'absolute',
    left: 12,
    top: 12,
    zIndex: 1,
  },
  searchInput: {
    backgroundColor: '#ffffff',
    paddingLeft: 44,
    paddingRight: 16,
    paddingVertical: 12,
    borderRadius: 8,
    fontSize: 16,
    color: '#111827',
  },
  content: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  actionsContainer: {
    padding: 16,
    flexDirection: 'row',
    gap: 12,
  },
  primaryAction: {
    flex: 1,
    backgroundColor: '#16a34a',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 8,
    gap: 8,
  },
  primaryActionText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryAction: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#16a34a',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 8,
    gap: 8,
  },
  secondaryActionText: {
    color: '#16a34a',
    fontSize: 16,
    fontWeight: '600',
  },
  section: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  addFriendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addFriendText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#16a34a',
  },
  squadsList: {
    gap: 12,
  },
  squadCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  squadInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  squadLogo: {
    width: 48,
    height: 48,
    backgroundColor: '#dcfce7',
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  squadLogoText: {
    fontSize: 24,
  },
  squadDetails: {
    flex: 1,
  },
  squadName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  membersContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  membersText: {
    fontSize: 14,
    color: '#6b7280',
  },
  viewButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  viewButtonText: {
    color: '#16a34a',
    fontSize: 14,
    fontWeight: '600',
  },
  friendsList: {
    gap: 12,
  },
  friendCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  friendAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  friendName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
  },
  inviteButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  inviteButtonText: {
    color: '#16a34a',
    fontSize: 14,
    fontWeight: '600',
  },
  comingSoonCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  comingSoonTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 6,
  },
  comingSoonText: {
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 18,
  },
  sheetOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' },
  sheetBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheetContainer: { backgroundColor: '#ffffff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 30 },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb', marginBottom: 12 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: '#111827', textAlign: 'center', marginBottom: 8 },
  sheetSubtitle: { fontSize: 14, color: '#6b7280', textAlign: 'center', marginBottom: 8, lineHeight: 20 },
  sheetNote: { fontSize: 12, color: '#9ca3af', textAlign: 'center', marginBottom: 16 },
  sheetPrimary: { backgroundColor: '#16a34a', borderRadius: 8, alignItems: 'center', paddingVertical: 12 },
  sheetPrimaryText: { color: '#ffffff', fontWeight: '700', fontSize: 16 },
});