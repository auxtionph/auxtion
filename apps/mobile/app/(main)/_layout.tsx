import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useRejoinCheck } from '../../src/hooks/useRejoinCheck';
import { RejoinLiveModal } from '../../src/components/RejoinLiveModal';

export default function MainLayout() {
  useRejoinCheck();

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#1A56DB',
          tabBarInactiveTintColor: '#6B7280',
          tabBarStyle: {
            borderTopColor: '#374151',
            backgroundColor: '#111827',
            paddingBottom: 4,
            height: 60,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '500',
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="home" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="explore"
          options={{
            title: 'Explore',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="search" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="sell"
          options={{
            title: 'Sell',
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name="add-circle"
                color={focused ? '#1A56DB' : color}
                size={size + 4}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="activity"
          options={{
            title: 'Activity',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="receipt-outline" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Account',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="person-circle-outline" color={color} size={size} />
            ),
          }}
        />
      </Tabs>
      <RejoinLiveModal />
    </>
  );
}