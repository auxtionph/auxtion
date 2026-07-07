import { Platform } from 'react-native';

export const A = {
  color: {
    void: '#08090D',
    surface: '#0E1117',
    card: '#161B24',
    raised: '#1E2530',
    hairline: '#252D3A',
    ink: '#EEF2F7',
    ink2: '#939EAE',
    ink3: '#5B6675',
    accent: '#2563EB',
    accentDim: 'rgba(37,99,235,0.13)',
    accentLine: 'rgba(37,99,235,0.27)',
    accentText: '#7DA5FB',
    amber: '#F59E0B',
    emerald: '#10B981',
    red: '#EF4444',
    violet: '#A78BFA',
    cyan: '#22D3EE',
  },
  role: {
    BUYER: '#5B6675',
    SELLER: '#2563EB',
    ADMIN: '#A78BFA',
  } as Record<string, string>,
  space: { xs: 6, sm: 10, md: 14, lg: 20, xl: 28 },
  radius: { sm: 10, md: 14, lg: 16, xl: 22, pill: 999 },
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) as string,
} as const;

export type AdminStatusTone =
  | 'accent'
  | 'amber'
  | 'emerald'
  | 'red'
  | 'violet'
  | 'cyan'
  | 'neutral';

export const toneColor: Record<AdminStatusTone, string> = {
  accent: A.color.accent,
  amber: A.color.amber,
  emerald: A.color.emerald,
  red: A.color.red,
  violet: A.color.violet,
  cyan: A.color.cyan,
  neutral: A.color.ink3,
};
