import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import { MapPin, Star, Clock } from 'lucide-react-native';

interface FieldCardProps {
  field: {
    id: string;
    name: string;
    image: string;
    distance: string;
    lastPlayed: string;
    rating: number;
    price: string;
  };
  onSelect?: () => void;
  showRating?: boolean;
}

export function FieldCard({ field, onSelect, showRating = true }: FieldCardProps) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.imageContainer}>
        <Image source={{ uri: field.image }} style={styles.image} />
        {showRating && (
          <View style={styles.ratingBadge}>
            <Star size={16} color="#fbbf24" fill="#fbbf24" />
            <Text style={styles.ratingText}>{field.rating}</Text>
          </View>
        )}
      </View>
      
      <View style={styles.content}>
        <Text style={styles.fieldName}>{field.name}</Text>
        
        <View style={styles.infoContainer}>
          <View style={styles.infoItem}>
            <MapPin size={16} color="#6b7280" />
            <Text style={styles.infoText}>{field.distance}</Text>
          </View>
          <View style={styles.infoItem}>
            <Clock size={16} color="#6b7280" />
            <Text style={styles.infoText}>Last: {formatDate(field.lastPlayed)}</Text>
          </View>
        </View>
        
        <View style={styles.footer}>
          <Text style={styles.price}>{field.price}</Text>
          <TouchableOpacity style={styles.bookButton} onPress={onSelect}>
            <Text style={styles.bookButtonText}>Book Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    overflow: 'hidden',
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
  imageContainer: {
    position: 'relative',
    height: 160,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  ratingBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 4,
  },
  ratingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  content: {
    padding: 16,
  },
  fieldName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  infoContainer: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  infoText: {
    fontSize: 14,
    color: '#6b7280',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  price: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#16a34a',
  },
  bookButton: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  bookButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});