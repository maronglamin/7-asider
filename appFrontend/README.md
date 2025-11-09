# 9Games - Football Field Booking App

A React Native mobile application for booking 7-a-side football fields, joining matches, and managing squads.

## Features

- **Matches**: View upcoming and past matches
- **Book**: Find and book football fields near you
- **Squads**: Create, join, and manage football teams
- **Profile**: User profile with stats and settings

## Tech Stack

- **Framework**: React Native with Expo
- **Navigation**: React Navigation (Bottom Tabs + Stack)
- **Icons**: Lucide React Native
- **Styling**: StyleSheet (React Native)
- **TypeScript**: Full TypeScript support

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Expo CLI (`npm install -g @expo/cli`)
- iOS Simulator (for iOS development) or Android Studio (for Android development)

### Installation

1. Navigate to the project directory:
   ```bash
   cd appFrontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm start
   ```

4. Run on your preferred platform:
   - **iOS**: Press `i` in the terminal or scan QR code with Expo Go app
   - **Android**: Press `a` in the terminal or scan QR code with Expo Go app
   - **Web**: Press `w` in the terminal

## Project Structure

```
appFrontend/
├── src/
│   ├── components/
│   │   ├── BottomTabBar.tsx      # Custom bottom navigation
│   │   ├── FieldCard.tsx         # Field display component
│   │   └── MatchCard.tsx         # Match display component
│   └── screens/
│       ├── MatchesScreen.tsx     # Matches tab
│       ├── BookScreen.tsx        # Book tab
│       ├── SquadsScreen.tsx      # Squads tab
│       ├── ProfileScreen.tsx     # Profile tab
│       └── BookingScreen.tsx     # Field booking flow
├── App.tsx                       # Main app component
├── package.json
└── README.md
```

## Design Guidelines

The app follows a clean, professional design with:

- **Primary Color**: Green (#16a34a) - Football/sports theme
- **Secondary Color**: Dark Gray (#111827) - Professional look
- **Accent Color**: Light Gray (#f9fafb) - Clean backgrounds
- **Typography**: System fonts with clear hierarchy
- **Layout**: Card-based design with proper spacing and shadows

## Features Implemented

### ✅ Matches Screen
- Upcoming and past matches tabs
- Match cards with field info, date, time, squad
- Participant count with progress bar
- Status badges (confirmed/pending)
- Empty state with call-to-action

### ✅ Book Screen
- Search functionality
- Primary actions (Find Fields, Join Matches)
- Recently played fields
- Field cards with images, ratings, prices
- Navigation to booking flow

### ✅ Squads Screen
- Quick actions (Join Squad, Create Squad)
- My squads list with member count
- Friends list with invite functionality
- Search functionality

### ✅ Profile Screen
- User info with avatar
- Stats grid (matches played, squads, fields, win rate)
- Menu items (Edit Profile, Notifications, Wallet, Settings)
- Logout functionality

### ✅ Booking Screen
- Field image and info
- Date selection (next 7 days)
- Time slot selection (24-hour grid)
- Booking summary with total calculation
- Confirmation flow

### ✅ Navigation
- Bottom tab navigation
- Stack navigation for booking flow
- Custom tab bar with icons
- Proper navigation flow

## Future Enhancements

- Real-time notifications
- Payment integration
- Chat functionality
- Push notifications
- Offline support
- Advanced filtering
- Social features

## Development Notes

- All components are fully typed with TypeScript
- Responsive design for different screen sizes
- Proper error handling and loading states
- Clean, maintainable code structure
- Follows React Native best practices

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License.