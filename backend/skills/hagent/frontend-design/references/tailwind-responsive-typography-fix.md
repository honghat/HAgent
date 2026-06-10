# Tailwind Responsive Typography Fix Pattern — Mobile Text Size Overrides

## Problem
JobHunter.jsx form inputs use very small default sizes (`text-[8px]`, `text-[9px]`) for compact layout. At mobile breakpoints, these need explicit overrides to avoid unreadable text.

The naive fix is adding `sm:text-xs` to inputs, but this doesn't work when the base size is already smaller than `text-xs` (16px). The Tailwind default order is:
- `text-[8px]` < `text-sm` (14px) > `text-xs` (12px)

So `sm:text-xs` won't override `text-[8px]` — the larger class must come first.

## Solution Pattern

### For text smaller than xs:
Use `@media` query or conditional classes to ensure mobile gets adequate size:

```jsx
// ✅ CORRECT: Use sm: prefix with larger base size for mobile
<input 
  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[9px] outline-none focus:border-slate-400 sm:text-xs"
/>
// At desktop: text-[9px] (8px)
// At mobile (sm+): text-xs (12px) — readable!
```

### For tiny base sizes (text-[8px]):
If content is too small even at `text-xs`, use Tailwind's arbitrary values directly in the breakpoint class:

```jsx
<input 
  className="w-full rounded-lg border px-3 py-2 text-[9px] outline-none focus:border-slate-400 sm:text-[10px]"
/>
// Desktop: text-[9px] → Mobile: text-[10px]
```

## Applied to JobHunter.jsx (Session 26.5.2026 11:39)

### Fixed Elements:
| Element | Base Size | Mobile Override | Result |
|---------|-----------|-----------------|--------|
| `input targetRole` | `text-[9px]` | `sm:text-xs` | ✅ Readable on mobile |
| `input location` | `text-[9px]` | `sm:text-xs` | ✅ Readable on mobile |
| `textarea keywords` | `text-[9px]` | `sm:text-xs` | ✅ Readable on mobile |

### Build Verification:
```bash
cd frontend && pnpm build  # ✓ Built in 1.60s
# dist/assets/JobHunter-EhhYXVq-.js 48.87 kB
```

## Anti-Pattern to Avoid

❌ **Wrong**: Rely on default Tailwind size order when base is smaller:
```jsx
// This does NOT override text-[8px] at mobile!
<input className="text-[8px] sm:text-xs" /> 
// Desktop: 8px, Mobile: still 8px — xs (12px) never applies because it's smaller!
```

✅ **Correct**: Use explicit larger mobile size OR arbitrary value override:
```jsx
// Option 1: xs is bigger than [8px]
<input className="text-[9px] sm:text-xs" /> // Mobile gets 12px

// Option 2: Still tiny but slightly better
<input className="text-[9px] sm:text-[10px]" /> // Mobile gets 10px
```

## Mobile Breakpoint Reference
- `sm:` = ≥640px (standard Tailwind mobile breakpoint)
- JobHunter desktop layout collapses gracefully
- Form inputs readable at all sizes with overrides

## Checklist Before Mobile Deployment
- [ ] All form inputs have mobile-responsive text sizes
- [ ] Textarea height doesn't shrink too much on mobile
- [ ] Buttons remain tappable (min 44px touch target)
- [ ] No tiny base font sizes without explicit mobile override