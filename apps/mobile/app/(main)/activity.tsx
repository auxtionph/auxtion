import { View, Text, TouchableOpacity } from 'react-native';
import { useState } from 'react';

type Tab = 'orders' | 'bids' | 'offers';

export default function ActivityScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('orders');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'orders', label: 'Orders' },
    { key: 'bids', label: 'Bids' },
    { key: 'offers', label: 'Offers' },
  ];

  return (
    <View className="flex-1 bg-[#1E2A3A]">
      {/* Header */}
      <View className="pt-14 pb-4 px-6">
        <Text className="text-white text-2xl font-bold">Activity</Text>
      </View>

      {/* Tabs */}
      <View className="flex-row px-6 mb-4 gap-2">
        {tabs.map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            className={`px-4 py-2 rounded-full ${
              activeTab === key
                ? 'bg-[#1A56DB]'
                : 'bg-gray-800'
            }`}
            onPress={() => setActiveTab(key)}
          >
            <Text className={`text-sm font-semibold ${
              activeTab === key ? 'text-white' : 'text-gray-400'
            }`}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Empty State */}
      <View className="flex-1 items-center justify-center">
        <Text className="text-4xl mb-4">
          {activeTab === 'orders' ? '📦' : activeTab === 'bids' ? '🔨' : '💬'}
        </Text>
        <Text className="text-white font-bold text-lg mb-2">
          No {activeTab === 'orders' ? 'Orders' : activeTab === 'bids' ? 'Bids' : 'Offers'} Yet
        </Text>
        <Text className="text-gray-500 text-sm text-center px-8">
          {activeTab === 'orders'
            ? 'Your purchases will appear here'
            : activeTab === 'bids'
            ? 'Your auction bids will appear here'
            : 'Your offers on items will appear here'}
        </Text>
      </View>
    </View>
  );
}