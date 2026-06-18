import { Tabs } from 'expo-router';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRejoinCheck } from '../../src/hooks/useRejoinCheck';
import { RejoinLiveModal } from '../../src/components/RejoinLiveModal';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

import type { SFSymbol } from 'expo-symbols';

// ── Tab definitions ──────────────────────────────────────────────────────────
interface TabDef {
  name: string;
  label: string;
  symbol: SFSymbol;
  symbolInactive: SFSymbol;
  isSell?: boolean;
}

const TABS: TabDef[] = [
  {
    name: 'index',
    label: 'Home',
    symbol: 'house.fill',
    symbolInactive: 'house',
  },
  {
    name: 'explore',
    label: 'Browse',
    symbol: 'magnifyingglass.circle.fill',
    symbolInactive: 'magnifyingglass',
  },
  {
    name: 'sell',
    label: 'Go Live',
    symbol: 'antenna.radiowaves.left.and.right',
    symbolInactive: 'antenna.radiowaves.left.and.right',
    isSell: true,
  },
  {
    name: 'activity',
    label: 'Activity',
    symbol: 'list.bullet.rectangle.fill',
    symbolInactive: 'list.bullet.rectangle',
  },
  {
    name: 'profile',
    label: 'Profile',
    symbol: 'person.crop.circle.fill',
    symbolInactive: 'person.crop.circle',
  },
];

// ── Custom floating pill tab bar ─────────────────────────────────────────────
function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        bottom: insets.bottom + 12,
        left: 0,
        right: 0,
        alignItems: 'center',
      }}
    >
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 999,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.11)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.45,
        shadowRadius: 24,
        elevation: 16,
      }}>
        {Platform.OS === 'ios' ? (
          <BlurView
            intensity={72}
            tint="dark"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 6,
              paddingVertical: 6,
              gap: 2,
              backgroundColor: 'rgba(13,17,23,0.55)',
            }}
          >
            <TabItems state={state} navigation={navigation} />
          </BlurView>
        ) : (
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 6,
            paddingVertical: 6,
            gap: 2,
            backgroundColor: 'rgba(13,17,23,0.96)',
          }}>
            <TabItems state={state} navigation={navigation} />
          </View>
        )}
      </View>
    </View>
  );
}

function TabItems({
  state,
  navigation,
}: Pick<BottomTabBarProps, 'state' | 'navigation'>) {
  return (
    <>
      {TABS.map((tab, index) => {
        const route = state.routes[index];
        const isFocused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route?.key ?? '',
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(tab.name);
          }
        };

        // ── Sell / Go Live — accent pill ──────────────────────────────────
        if (tab.isSell) {
          return (
            <TouchableOpacity
              key={tab.name}
              onPress={onPress}
              activeOpacity={0.8}
              style={{
                backgroundColor: '#1A56DB',
                borderRadius: 999,
                paddingHorizontal: 18,
                paddingVertical: 10,
                alignItems: 'center',
                gap: 3,
                marginHorizontal: 2,
              }}
            >
              <SymbolView
                name={tab.symbol}
                size={20}
                tintColor="#fff"
                weight="semibold"
                type="hierarchical"
              />
              <Text style={{
                color: '#fff',
                fontSize: 10,
                fontWeight: '700',
                letterSpacing: 0.3,
              }}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        }

        // ── Regular tab ───────────────────────────────────────────────────
        const activeColor = '#A78BFA';
        const inactiveColor = '#6B7280';
        const color = isFocused ? activeColor : inactiveColor;

        return (
          <TouchableOpacity
            key={tab.name}
            onPress={onPress}
            activeOpacity={0.7}
            style={{
              alignItems: 'center',
              gap: 3,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: isFocused ? 'rgba(124,58,237,0.18)' : 'transparent',
              minWidth: 58,
            }}
          >
            <SymbolView
              name={isFocused ? tab.symbol : tab.symbolInactive}
              size={20}
              tintColor={color}
              weight="semibold"
              type="hierarchical"
            />
            <Text style={{
              color,
              fontSize: 10,
              fontWeight: isFocused ? '700' : '500',
              letterSpacing: 0.2,
            }}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </>
  );
}

// ── Layout ───────────────────────────────────────────────────────────────────
export default function MainLayout() {
  useRejoinCheck();

  return (
    <>
      <Tabs
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{
          headerShown: false,
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="explore" options={{ title: 'Browse' }} />
        <Tabs.Screen name="sell" options={{ title: 'Go Live' }} />
        <Tabs.Screen name="activity" options={{ title: 'Activity' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      </Tabs>
      <RejoinLiveModal />
    </>
  );
}