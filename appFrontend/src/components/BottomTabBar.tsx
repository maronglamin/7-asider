import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Calendar, MapPin, Users, User } from 'lucide-react-native';

interface BottomTabBarProps {
  state: any;
  descriptors: any;
  navigation: any;
}

export function BottomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const tabConfig = [
    { name: 'Matches', icon: Calendar, label: 'Matches' },
    { name: 'Book', icon: MapPin, label: 'Book' },
    { name: 'Squads', icon: Users, label: 'Squads' },
    { name: 'Profile', icon: User, label: 'Profile' },
  ];

  return (
    <View style={[styles.container, { paddingBottom: BASE_TAB_PADDING + insets.bottom }]}>
      {state.routes.map((route: any, index: number) => {
        const { options } = descriptors[route.key];
        const isFocused = state.index === index;
        const tab = tabConfig.find(t => t.name === route.name);

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        const Icon = tab?.icon || Calendar;

        return (
          <TouchableOpacity
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            testID={options.tabBarTestID}
            onPress={onPress}
            style={styles.tab}
          >
            <Icon 
              size={24} 
              color={isFocused ? '#16a34a' : '#6b7280'} 
              strokeWidth={isFocused ? 2.5 : 2}
            />
            <Text style={[
              styles.label,
              { color: isFocused ? '#16a34a' : '#6b7280' }
            ]}>
              {tab?.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const BASE_TAB_PADDING = 8;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 5,
    paddingTop: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
  },
});