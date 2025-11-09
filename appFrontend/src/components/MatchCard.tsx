import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { MapPin, Clock, Users, Calendar } from 'lucide-react-native';

interface MatchCardProps {
  match: {
    id: string;
    fieldId?: string;
    fieldName: string;
    date: string;
    time: string;
    squad: string;
    status?: 'confirmed' | 'pending';
    participants?: number;
    maxParticipants?: number;
    result?: string;
    kindLabel?: string;
    slotsLabel?: string;
  };
  type: 'upcoming' | 'past';
  onPrimaryPress?: () => void;
}

export function MatchCard({ match, type, onPrimaryPress }: MatchCardProps) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.fieldInfo}>
          <Text style={styles.fieldName}>{match.fieldName}</Text>
          <View style={styles.dateTimeContainer}>
            <View style={styles.dateTimeItem}>
              <Calendar size={16} color="#6b7280" />
              <Text style={styles.dateTimeText}>{formatDate(match.date)}</Text>
            </View>
            <View style={styles.dateTimeItem}>
              <Clock size={16} color="#6b7280" />
              <Text style={styles.dateTimeText}>{match.time}</Text>
            </View>
          </View>
          {/*
          <View style={styles.squadContainer}>
            <Users size={16} color="#6b7280" />
            <Text style={styles.squadText}>{match.squad}</Text>
          </View>
          */}
        </View>
        {type === 'upcoming' && match.status && (
          <View style={[
            styles.statusBadge,
            match.status === 'confirmed' ? styles.confirmedBadge : styles.pendingBadge
          ]}>
            <Text style={[
              styles.statusText,
              match.status === 'confirmed' ? styles.confirmedText : styles.pendingText
            ]}>
              {match.status === 'confirmed' ? 'Confirmed' : 'Pending'}
            </Text>
          </View>
        )}
      </View>

      {/*
      {type === 'upcoming' && match.participants && match.maxParticipants && (
        <View style={styles.participantsContainer}>
          <View style={styles.participantsHeader}>
            <Text style={styles.participantsLabel}>Players</Text>
            <Text style={styles.participantsCount}>
              {match.participants}/{match.maxParticipants}
            </Text>
          </View>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${(match.participants / match.maxParticipants) * 100}%` }
              ]}
            />
          </View>
        </View>
      )}
      */}

      {type === 'past' && match.result && (
        <View style={styles.resultContainer}>
          <Text style={styles.resultText}>Result: {match.result}</Text>
        </View>
      )}

      {type === 'past' && match.kindLabel && (
        <View style={styles.resultContainer}>
          <Text style={styles.resultText}>Type: {match.kindLabel}</Text>
        </View>
      )}

      {match.slotsLabel && (
        <View style={styles.resultContainer}>
          <Text style={styles.resultText} numberOfLines={1}>Time: {match.slotsLabel}</Text>
        </View>
      )}

      <View style={styles.actions}>
        {type === 'upcoming' ? (
          <>
            <TouchableOpacity style={styles.primaryButton} onPress={onPrimaryPress}>
              <Text style={styles.primaryButtonText}>View Details</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={styles.primaryButton} onPress={onPrimaryPress}>
            <Text style={styles.primaryButtonText}>Book Again</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  fieldInfo: {
    flex: 1,
  },
  fieldName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  dateTimeContainer: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 8,
  },
  dateTimeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dateTimeText: {
    fontSize: 14,
    color: '#6b7280',
  },
  squadContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  squadText: {
    fontSize: 14,
    color: '#6b7280',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  confirmedBadge: {
    backgroundColor: '#dcfce7',
  },
  pendingBadge: {
    backgroundColor: '#fef3c7',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  confirmedText: {
    color: '#166534',
  },
  pendingText: {
    color: '#92400e',
  },
  participantsContainer: {
    marginBottom: 12,
  },
  participantsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  participantsLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  participantsCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#16a34a',
    borderRadius: 4,
  },
  resultContainer: {
    backgroundColor: '#f9fafb',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 12,
  },
  resultText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#16a34a',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '600',
  },
});