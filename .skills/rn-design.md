---
name: rn-design
description: "Use this skill whenever improving, building, or reviewing any React Native UI in Auxtion. Contains design tokens, component patterns, spacing system, typography, and styling conventions specific to the Auxtion dark-theme mobile app. Read before touching any screen or component styling."
---

# React Native Design — Auxtion

## Design Identity

Auxtion is a **dark-first Filipino live auction app**. The aesthetic is:
- **Dark glass** — deep backgrounds, frosted overlays, subtle borders
- **High contrast** — white text on dark, amber/blue accents for action
- **Minimal chrome** — content leads, UI recedes
- **Live energy** — bold numbers, strong hierarchy, clear CTAs

Target device: iPhone 16 Plus, iOS 18.2. Test on this first.

---

## Color Tokens

```typescript
// Backgrounds
const BG_BASE     = '#000000';       // full screen base
const BG_DEEP     = '#111827';       // modals, drawers
const BG_CARD     = '#1F2937';       // cards, list items
const BG_INPUT    = '#1F2937';       // text inputs
const BG_BORDER   = '#374151';       // dividers, borders
const BG_BORDER2  = '#2D3748';       // softer borders (modals)

// Glass overlays (on video/image backgrounds)
const GLASS_BG    = 'rgba(255,255,255,0.08)';
const GLASS_BG2   = 'rgba(255,255,255,0.15)';
const GLASS_BORDER = 'rgba(255,255,255,0.12)';
const GLASS_BORDER2 = 'rgba(255,255,255,0.25)';

// Text
const TEXT_PRIMARY   = '#FFFFFF';
const TEXT_SECONDARY = '#9CA3AF';
const TEXT_MUTED     = '#6B7280';
const TEXT_FAINT     = '#4B5563';

// Brand / Action
const BLUE        = '#1A56DB';       // primary CTA
const BLUE_LIGHT  = '#60A5FA';       // blue on dark bg
const AMBER       = '#F59E0B';       // prices, warnings, timers
const AMBER_LIGHT = '#FCD34D';
const GREEN       = '#10B981';       // success, sold, accepted
const RED         = '#DC2626';       // destructive, live badge, end
const RED_LIGHT   = '#F87171';
const PURPLE      = '#7C3AED';       // chat bid mode
const PURPLE_LIGHT = '#A78BFA';

// Semantic overlays
const BLUE_OVERLAY   = 'rgba(26,86,219,0.15)';
const AMBER_OVERLAY  = 'rgba(245,158,11,0.10)';
const GREEN_OVERLAY  = 'rgba(16,185,129,0.10)';
const RED_OVERLAY    = 'rgba(220,38,38,0.15)';
const PURPLE_OVERLAY = 'rgba(124,58,237,0.15)';
```

---

## Typography Scale

```typescript
// Display — prices, timers, big numbers
fontSize: 28, fontWeight: '800'   // auction price display
fontSize: 22, fontWeight: '800'   // modal titles large
fontSize: 18, fontWeight: '700'   // timer countdown

// Headings
fontSize: 17, fontWeight: '700'   // modal header
fontSize: 15, fontWeight: '700'   // section title
fontSize: 14, fontWeight: '700'   // card title

// Body
fontSize: 13, fontWeight: '600'   // item title, list label
fontSize: 13, fontWeight: '400'   // body text
fontSize: 12, fontWeight: '600'   // secondary label
fontSize: 12, fontWeight: '400'   // secondary body

// Caption
fontSize: 11, fontWeight: '600'   // metadata, badges
fontSize: 10, fontWeight: '700'   // tab labels, pill text
fontSize:  9, fontWeight: '700'   // notification badge
fontSize:  8, fontWeight: '700'   // mini badge

// Labels (ALL CAPS)
fontSize: 11, fontWeight: '600', letterSpacing: 0.5   // section labels
```

---

## Spacing System

```typescript
// Base unit: 4px
const S1 = 4;
const S2 = 8;
const S3 = 12;
const S4 = 16;
const S5 = 20;
const S6 = 24;
const S8 = 32;
const S10 = 40;
const S12 = 48;

// Common patterns
paddingHorizontal: 24   // modal/drawer horizontal padding
paddingHorizontal: 16   // screen horizontal padding
gap: 8                  // between sibling elements
gap: 12                 // between card content
gap: 16                 // between sections
marginBottom: 16        // between form fields
marginBottom: 24        // between sections
```

---

## Border Radius System

```typescript
borderRadius: 999    // pills, badges, avatars (fully round)
borderRadius: 24     // modals, drawers (top corners)
borderRadius: 16     // cards, buttons, containers
borderRadius: 14     // modal inner cards, CTAs
borderRadius: 12     // input fields, small cards
borderRadius: 10     // thumbnails, photo grid
borderRadius: 8      // small badges, tags
borderRadius: 4      // tiny chips
```

---

## Component Patterns

### Primary CTA Button
```typescript
{
  backgroundColor: '#1A56DB',
  borderRadius: 14,
  paddingVertical: 16,
  alignItems: 'center',
}
// Text: color: '#fff', fontWeight: '700', fontSize: 15
```

### Destructive Button
```typescript
{
  backgroundColor: RED_OVERLAY,
  borderWidth: 1, borderColor: '#DC2626',
  borderRadius: 16, paddingVertical: 14,
  alignItems: 'center',
}
// Text: color: '#F87171', fontWeight: '700', fontSize: 15
```

### Ghost Button
```typescript
{
  backgroundColor: 'transparent',
  borderWidth: 1, borderColor: '#2D3748',
  borderRadius: 14, paddingVertical: 14,
  alignItems: 'center',
}
// Text: color: '#6B7280', fontWeight: '600', fontSize: 14
```

### Card / List Item
```typescript
{
  backgroundColor: '#1F2937',
  borderRadius: 12,
  padding: 12,
  marginBottom: 8,
}
```

### Input Field
```typescript
{
  backgroundColor: '#1F2937',
  borderRadius: 14,
  borderWidth: 1,
  borderColor: hasValue ? '#1A56DB' : '#2D3748',
  paddingHorizontal: 16,
  paddingVertical: 14,
  color: '#fff',
  fontSize: 15,
}
// Placeholder: color '#4B5563'
```

### Glass Button (on video/image background)
```typescript
{
  backgroundColor: 'rgba(255,255,255,0.15)',
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.25)',
  borderRadius: 999,
  width: 38, height: 38,
  alignItems: 'center', justifyContent: 'center',
}
```

### Badge / Pill
```typescript
// Active tab / selected
{ backgroundColor: '#1A56DB', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 }

// Count badge
{
  backgroundColor: '#DC2626', borderRadius: 999,
  minWidth: 16, height: 16, paddingHorizontal: 4,
  alignItems: 'center', justifyContent: 'center',
  position: 'absolute', top: -2, right: -2,
}
```

### Section Label
```typescript
<Text style={{ color: '#6B7280', fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 8 }}>
  SECTION TITLE
</Text>
```

### Modal Sheet
```typescript
// Container
{
  backgroundColor: '#111827',
  borderTopLeftRadius: 24, borderTopRightRadius: 24,
  paddingHorizontal: 24, paddingTop: 20, paddingBottom: 48,
}

// Handle bar
{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#374151', marginBottom: 16 }
```

### Icon Tab Card (Shop tabs pattern)
```typescript
{
  flex: 1, alignItems: 'center', paddingVertical: 10,
  borderRadius: 14,
  backgroundColor: active ? '#1A56DB' : '#1F2937',
  borderWidth: 1,
  borderColor: active ? '#1A56DB' : '#374151',
}
// Icon: fontSize: 18, marginBottom: 3
// Label: fontSize: 10, fontWeight: '700'
```

---

## Safe Area — MANDATORY

```typescript
import { useSafeAreaInsets } from 'react-native-safe-area-context';
const insets = useSafeAreaInsets();

// Top padding
paddingTop: insets.top + 12

// Bottom padding
paddingBottom: insets.bottom + 8

// NEVER hardcode
// ❌ paddingTop: 56
// ❌ paddingBottom: 40
```

---

## Live Room Specific

### Item Bar (floating above bottom controls)
```typescript
{
  backgroundColor: 'rgba(0,0,0,0.70)',
  borderRadius: 16,
  paddingHorizontal: 16, paddingVertical: 12,
}
```

### Chat Message Bubble
```typescript
{
  backgroundColor: 'rgba(0,0,0,0.60)',
  borderRadius: 18,
  paddingHorizontal: 12, paddingVertical: 6,
}
// Username: color '#1A56DB', fontSize 11, fontWeight '700'
// Message: color '#fff', fontSize 11
```

### System Message (offer/winner)
```typescript
// Offer notification
{
  backgroundColor: 'rgba(245,158,11,0.08)',
  borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)',
  borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8,
}

// Winner announcement
{
  backgroundColor: 'rgba(245,158,11,0.15)',
  borderWidth: 1, borderColor: 'rgba(245,158,11,0.4)',
  borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10,
}
```

### Timer Badge
```typescript
{
  backgroundColor: remaining <= counterbid ? '#DC2626' : '#1A56DB',
  borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
  minWidth: 48, alignItems: 'center',
}
// Text: color '#fff', fontWeight '700', fontSize 18
```

---

## Animation Patterns

### Spring back (swipe button)
```typescript
Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
```

### Fade in toast
```typescript
Animated.timing(opacity, {
  toValue: 1, duration: 200, useNativeDriver: true,
}).start();
```

### Never use
- `setTimeout` for animations — use `Animated` API
- Fixed pixel transforms — use dynamic values
- `setNativeProps` — use state

---

## Do / Don't

| ✅ Do | ❌ Don't |
|---|---|
| `useSafeAreaInsets()` always | Hardcode `paddingTop: 56` |
| `formatPHP(centavos)` for money | Display raw centavo numbers |
| Glassmorphism on video bg | Solid dark bg on video |
| Amber for prices | White for prices |
| `numberOfLines={1}` on titles | Let titles overflow |
| `activeOpacity={0.75}` on buttons | Default `0.2` opacity |
| Dynamic `BOTTOM_BAR_HEIGHT` | Fixed bottom positioning |
| Soft borders `#2D3748` in modals | Hard borders `#374151` in modals |
| Section labels ALL CAPS | Mixed case section labels |

---

## Mood Reference

- **Live room**: cinematic, immersive, urgent — dark glass on video
- **Shop drawer**: clean merchant UX — card-based, scannable
- **Modals**: focused task completion — centered, minimal distractions
- **Toasts**: celebratory (sales) or informational — brief, auto-dismiss
- **Buttons**: weight matches consequence — destructive = red border, primary = solid blue, ghost = transparent

