# Responsive Data-Dense Dashboard Components

> Tailwind patterns for making data-rich dashboard UIs work on mobile without losing information density.

## Core Strategy

**Stack-on-mobile, grid-on-desktop** — the primary responsive pattern for dashboard layouts.

## Pattern: Sidebar → Fullscreen Overlay on Mobile

Instead of a narrow inline sidebar on mobile, switch to a **fixed fullscreen overlay**:

```jsx
<aside className={`${
  showSidebar 
    ? 'fixed inset-0 z-30 block lg:static lg:z-auto' 
    : 'hidden lg:block'
} w-full overflow-y-auto lg:max-w-xs`}>
  
  {/* Mobile close button bar — hidden on desktop */}
  <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-3 py-2 lg:hidden">
    <span className="text-xs font-bold">Panel</span>
    <button onClick={() => setShowSidebar(false)}>
      <X className="h-4 w-4" />
    </button>
  </div>
  
  {/* Sidebar content */}
  <div className="space-y-3 p-3">
    ...
  </div>
</aside>
```

**Why**: A narrow sidebar on a phone screen (< 375px) gives almost no horizontal real estate for the main content. The overlay gives the sidebar full width for forms/inputs, and the main content below gets all remaining space.

## Pattern: Grid-to-Stack (Responsive Grid Collapse)

Any 2-column form grid should collapse to a vertical stack on mobile:

```jsx
{/* BEFORE: 2-column grid that wraps poorly on mobile */}
<div className="grid grid-cols-2 gap-3">
  <FormField ... />
  <FormField ... />
</div>

{/* AFTER: Stack on mobile, 2-column on sm+ */}
<div className="space-y-3 sm:grid sm:grid-cols-2 sm:gap-3 sm:space-y-0">
  <FormField ... />
  <FormField ... />
</div>
```

**Why**: `grid-cols-2` on mobile (< 640px) forces narrow inputs that look cramped and cause overflow, especially for label+input combos.

## Pattern: Metric/Stat Bars

Data bars with multiple metrics (e.g., "12 JD · 3 sources · 5 matched") need tight packing on mobile:

```jsx
<div className="flex flex-wrap items-center gap-1.5 sm:gap-3">
  <MetricItem icon={Database} value="12 JD" className="text-[10px] sm:text-[11px]" />
  <MetricItem icon={Globe} value="3 sources" className="text-[10px] sm:text-[11px]" />
  ...
</div>
```

**BEFORE** vs **AFTER** values for metric bars:

| Property | Mobile | Desktop (sm+) |
|----------|--------|---------------|
| Container gap | `gap-1` | `sm:gap-3` |
| Item gap | `gap-1` | `sm:gap-1.5` |
| Font size | `text-[10px]` | `sm:text-[11px]` |
| Icon size | `h-3 w-3` | `sm:h-3.5 sm:w-3.5` |
| Container padding | `px-2 py-1.5` | `sm:px-4` |
| Container Y padding | `py-1.5` | (inherit) |

## Pattern: Card List (Job Cards / Result Items)

Data-dense list items (e.g., job cards with tags, salary, description, action buttons):

### Padding

| Element | Mobile | Desktop (sm+) |
|---------|--------|---------------|
| Card padding | `p-2` | `sm:p-3` or `sm:p-4` |
| Inner gap | `gap-1` | `sm:gap-1.5` or `sm:gap-3` |
| Tag gap | `gap-0.5` | `sm:gap-1` |

### Font Sizes (Systematic Taper)

Use this chart for consistent responsive text sizing across all card elements:

| Element | Mobile | Desktop (sm+) |
|---------|--------|---------------|
| Source badge | `text-[8px]` | `sm:text-[9px]` |
| Salary | `text-[9px]` | `sm:text-[10px]` |
| Location pin | `text-[8px]` | `sm:text-[9px]` |
| Title | `text-xs` | `sm:text-sm` |
| Company | `text-[10px]` | `sm:text-xs` |
| Description | `text-[10px] leading-4` | `sm:text-[11px] leading-5` |
| Action buttons | `text-[9px]` | `sm:text-[10px]` |
| Description toggle | `text-[9px]` | `sm:text-[10px]` |
| Tag chip text | `text-[9px]` | `sm:text-[10px]` |

### Tag Chips

```jsx
<span className="rounded bg-emerald-50 px-1 py-0.5 text-[9px] font-semibold text-emerald-700 sm:px-1.5 sm:py-0.5 sm:text-[10px]">
  ✓ SQL
</span>
```

### Action Button Row (Bottom of Card)

On mobile, action buttons should shrink but remain tappable (min 28px height):

```jsx
<button className="shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-bold sm:px-2 sm:py-1 sm:text-[10px]">
  Nút
</button>
```

**Icons**: Use `h-3 w-3` on mobile, `sm:h-3.5 sm:w-3.5` on desktop.

## Pattern: Tab Bar

```jsx
<div className="shrink-0 border-b px-2 sm:px-4">
  <div className="flex items-center gap-0.5 -mb-px">
    <button className="px-2 py-2 text-[10px] font-bold border-b-2 sm:px-3 sm:py-2.5 sm:text-xs">
      Tab 1
    </button>
    <button className="px-2 py-2 text-[10px] font-bold border-b-2 sm:px-3 sm:py-2.5 sm:text-xs">
      Tab 2
    </button>
  </div>
</div>
```

## Pattern: Form Sections in Sidebar

Form fields (inputs, file uploads, buttons) in a mobile sidebar need full width:

- Inputs: `w-full`, `text-[10px]` → `sm:text-xs`
- Buttons: full width on mobile, keep full width on desktop too for consistency
- File input label: `px-3 py-3` → `sm:px-3 sm:py-3` (already compact)
- Toggle buttons: `px-1.5 py-0.5 text-[9px]` → `sm:px-2 sm:py-1 sm:text-[10px]`

## Pattern: Comparison Panel (Desktop Sidebar / Mobile Bottom Sheet)

The comparison panel should be:
- **Desktop** (`lg:block`): Right side column (`w-80 xl:w-96 shrink-0 border-l overflow-y-auto`)
- **Mobile** (`lg:hidden`): Bottom section below the list (`shrink-0 border-t max-h-[50vh] overflow-y-auto`)

```jsx
{/* Desktop panel */}
<div className="hidden lg:block w-80 xl:w-96 shrink-0 border-l bg-white">
  ...
</div>

{/* Mobile panel */}
<div className="lg:hidden shrink-0 border-t bg-white max-h-[50vh] overflow-y-auto">
  ...
</div>
```

## Pattern: Empty States

```jsx
<div className="rounded-lg border border-dashed p-4 sm:p-8 text-center text-[10px] leading-5 sm:text-[11px]">
  <Icon className="mx-auto mb-2 h-5 w-5 sm:h-6 sm:w-6" />
  Message...
  <div className="mt-2 sm:mt-3 flex justify-center gap-2">
    <button className="px-2 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs">
      Action
    </button>
  </div>
</div>
```
\n## Pitfall: Sidebar Overflow and Horizontal Scroll\n\nThe `fixed inset-0 z-30` sidebar pattern can still cause **horizontal page scroll** on mobile due to `w-full` resolving wider than `100vw` (CSS `100vw` includes scrollbar width on some browsers).\n\n### Fixes applied in JobHunter.jsx\n\n**1. Root container needs `overflow-x-hidden`**, not just `overflow-hidden`:\n```jsx\n{/* BEFORE: horizontal scroll on mobile */}\n<div className=\"flex h-full min-w-0 flex-col overflow-hidden bg-slate-50\">\n\n{/* AFTER: no horizontal scroll */}\n<div className=\"flex h-full min-w-0 flex-col overflow-x-hidden bg-slate-50\">\n```\n\n**2. Main content area also needs `overflow-x-hidden`** to prevent comparison panel and stat bars from causing scroll:\n```jsx\n<div className=\"flex min-w-0 flex-1 flex-col overflow-x-hidden\">\n```\n\n**3. Sidebar needs explicit `maxWidth: '100vw'`** via inline style — `w-full` alone isn't enough on some mobile browsers:\n```jsx\n<aside \n  className={`... ${showSidebar ? 'fixed inset-0 z-30 block lg:static lg:z-auto' : 'hidden lg:block'} w-full ...`}\n  style={{ width: showSidebar ? '100vw' : undefined, maxWidth: '100vw' }}\n>\n```\n\n**Why `overflow-x-hidden` on root + main content**:\n- The root container's `overflow-hidden` clips child content but doesn't prevent child flex items from growing wider than the viewport. `overflow-x-hidden` on the **flex-1 child** (main content area) stops stat bars, comparison panels, and tab bars from pushing past the viewport edge.\n- The comparison panel (`hidden lg:block w-72 xl:w-80`) is `hidden` on mobile (no issue), but on narrow desktop sizes just above the `lg` breakpoint, the main content + sidebar + panel can exceed `100vw`.\n\n## Pitfall: Tab Names Getting Cut Off (\"Automa…\")\n\nWhen tab names are dynamic length (e.g., \"Khớp CV (12)\", \"Automa...\") and the total exceeds viewport width, the overflow is clipped.\n\n### Fix: Scrollable tab bar\n\n```jsx\n{/* BEFORE: tabs will be cut off on mobile */}\n<div className=\"shrink-0 border-b bg-white px-2 sm:px-4\">\n  <div className=\"flex items-center gap-0.5 -mb-px\">\n    <button>Tất cả JD (245)</button>\n    <button>Khớp CV (12)</button>\n    <button>Automasi...</button> {/* ← cut off */}\n  </div>\n</div>\n\n{/* AFTER: scrollable tabs */}\n<div className=\"shrink-0 border-b bg-white px-2 overflow-x-auto sm:px-4\">\n  <div className=\"flex items-center gap-0.5 -mb-px min-w-max\">\n    <button>Tất cả JD (245)</button>\n    <button>Khớp CV (12)</button>\n    <button>Automasi...</button>\n  </div>\n</div>\n```\n\n**Two changes**:\n1. Outer div gets `overflow-x-auto` (scrollbar only when needed, horizontal)\n2. Inner div gets `min-w-max` so the tab strip doesn't shrink-wrap to viewport width\n\nThe `overflow-x-auto` on the outer div acts as a horizontal scroll container; `-webkit-overflow-scrolling: touch` is implicit in Tailwind.\n\n## Pitfall: Card Padding Causing Vertical Scroll Spam on Mobile\n\nCards with `p-2 sm:p-3` still take too much vertical space on mobile. Multiple cards × `p-2` (12px each side) wastes ~20px per card.\n\n### Fix: Use `p-1.5 sm:p-3` for card inner padding\n\n| Element | Mobile | Desktop (sm+) | Benefit |\n|---------|--------|---------------|---------|\n| Card padding | `p-1.5` (6px) | `sm:p-3` (12px) | +12px per card visible on mobile |\n| List container | `space-y-1.5 p-1.5` | `sm:space-y-3 sm:p-4` | +14px per card visible |\n| Header Y padding | `py-1.5` (6px) | `sm:py-3` (12px) | Thin header, more content |\n| Section header | `px-3 py-2` | `sm:px-4 sm:py-3` | Tighter collapsed sections |\n| Section body | `p-3` | `sm:p-4` | 4px saved each section |\n| Open section content | `p-3` | (inherit) | Consistent reduced mobile padding |\n| Textarea inside form | `px-2 py-1.5 min-h-[60px]` | `sm:px-3 sm:py-2` | Shorter textarea on mobile |\n\n## General Rules for This Codebase\n\n0. **Guard against horizontal scroll**: Root container + main flex child both need `overflow-x-hidden`. Sidebar overlay at `fixed inset-0` needs `style={{ maxWidth: '100vw' }}`.\n1. **Always use `px-2 sm:px-4`** as the responsive padding baseline for containers, not fixed `px-3` or `px-4`.
2. **Never hardcode mobile text size** at `text-xs` or `text-sm` — always use a smaller base (`text-[9px]` or `text-[10px]`) then `sm:text-[10px]` or `sm:text-xs`.
3. **Grid columns** should always be `sm:grid-cols-N` not just `grid-cols-N` — wrap in `space-y-3 sm:grid sm:gap-3 sm:space-y-0`.
4. **Sidebar pattern**: `fixed inset-0 z-30 on mobile, static on lg+` with a close button bar.
5. **Metric stat bars**: use `flex-wrap gap-1 sm:gap-3` to allow wrapping on narrow screens.
6. **Card action buttons**: group them tightly on mobile with `gap-1.5`, loosen to `gap-3` on desktop.
7. **Tags/chips**: `gap-0.5 sm:gap-1` on the container, smaller 8-9px fonts on mobile.
8. **Tab bar**: prefer `px-2 py-2 text-[10px] sm:px-3 sm:py-2.5 sm:text-xs` for compact mobile tabs.
