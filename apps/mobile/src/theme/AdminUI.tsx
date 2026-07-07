import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { A, AdminStatusTone, toneColor } from './admin';

export function AdminScreen({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: A.color.surface, paddingTop: insets.top }}>
      {children}
    </View>
  );
}

export function AdminHeader({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack: () => void;
  right?: React.ReactNode;
}) {
  return (
    <View style={s.header}>
      <TouchableOpacity onPress={onBack} hitSlop={12}>
        <Text style={s.back}>‹ Back</Text>
      </TouchableOpacity>
      <Text style={s.title}>{title}</Text>
      <View style={{ flex: 1 }} />
      {right}
    </View>
  );
}

export function Eyebrow({ children }: { children: string }) {
  return (
    <View style={s.eyebrowRow}>
      <Text style={s.eyebrow}>{children}</Text>
      <View style={s.eyebrowLine} />
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function StatTile({
  label,
  value,
  tone = 'accent',
  live,
}: {
  label: string;
  value: string;
  tone?: AdminStatusTone;
  live?: boolean;
}) {
  const c = toneColor[tone];
  return (
    <View style={s.tile}>
      <View style={[s.tileRule, { backgroundColor: c, opacity: tone === 'accent' ? 0.27 : 0.5 }]} />
      <View style={s.tileLabelRow}>
        <View style={[s.dot, { backgroundColor: c }]} />
        <Text style={s.tileLabel}>{label}</Text>
      </View>
      <Text style={[s.tileVal, live && { color: A.color.red }]}>{value}</Text>
    </View>
  );
}

export function Badge({ text, tone = 'neutral' }: { text: string; tone?: AdminStatusTone }) {
  const c = toneColor[tone];
  return (
    <View style={[s.badge, { backgroundColor: c + '22' }]}>
      <Text style={[s.badgeText, { color: c }]}>{text}</Text>
    </View>
  );
}

export function Tab({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={[s.tab, on && s.tabOn]}>
      <Text style={[s.tabText, on && s.tabTextOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <TouchableOpacity onPress={onClear} style={s.chip} hitSlop={8}>
      <Text style={s.chipText}>{label}</Text>
      <Text style={s.chipX}>✕</Text>
    </TouchableOpacity>
  );
}

export function Mono({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  return <Text style={[s.mono, style]}>{children}</Text>;
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: A.space.md,
    paddingHorizontal: A.space.lg,
    paddingTop: 8,
    paddingBottom: A.space.lg,
  },
  back: { color: A.color.accent, fontSize: 15, fontWeight: '500' },
  title: { color: A.color.ink, fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },

  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: A.space.lg,
    marginTop: 4,
    marginBottom: 12,
  },
  eyebrow: { fontFamily: A.mono, fontSize: 10.5, letterSpacing: 1.8, color: A.color.ink3 },
  eyebrowLine: { flex: 1, height: 1, backgroundColor: A.color.hairline },

  card: {
    backgroundColor: A.color.card,
    borderWidth: 1,
    borderColor: A.color.hairline,
    borderRadius: A.radius.lg,
    padding: A.space.md,
  },

  tile: {
    flex: 1,
    backgroundColor: A.color.card,
    borderWidth: 1,
    borderColor: A.color.hairline,
    borderRadius: A.radius.md,
    padding: A.space.md,
    overflow: 'hidden',
  },
  tileRule: { position: 'absolute', top: 0, left: 0, right: 0, height: 2 },
  tileLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  tileLabel: {
    fontFamily: A.mono,
    fontSize: 10,
    letterSpacing: 1,
    color: A.color.ink3,
    textTransform: 'uppercase',
  },
  tileVal: { fontFamily: A.mono, fontWeight: '600', fontSize: 24, letterSpacing: -0.5, color: A.color.ink },
  dot: { width: 7, height: 7, borderRadius: 4 },

  badge: { borderRadius: 7, paddingHorizontal: 9, paddingVertical: 5, alignSelf: 'flex-start' },
  badgeText: { fontFamily: A.mono, fontSize: 10, fontWeight: '600', letterSpacing: 0.5 },

  tab: {
    borderRadius: A.radius.sm,
    paddingHorizontal: 15,
    paddingVertical: 8,
    backgroundColor: A.color.card,
    borderWidth: 1,
    borderColor: A.color.hairline,
  },
  tabOn: { backgroundColor: A.color.accent, borderColor: A.color.accent },
  tabText: { fontSize: 12.5, fontWeight: '600', color: A.color.ink2 },
  tabTextOn: { color: '#fff' },

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    backgroundColor: A.color.accentDim,
    borderWidth: 1,
    borderColor: A.color.accentLine,
    borderRadius: A.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipText: { fontSize: 12.5, fontWeight: '600', color: A.color.accentText },
  chipX: { fontSize: 12.5, fontWeight: '700', color: A.color.accentText, opacity: 0.8 },

  mono: { fontFamily: A.mono, color: A.color.ink, letterSpacing: -0.3 },
});
