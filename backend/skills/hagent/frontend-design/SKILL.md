---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when the user asks to build web components, pages, artifacts, posters, or applications (examples include websites, landing pages, dashboards, React components, HTML/CSS layouts, or when styling/beautifying any web UI). Generates creative, polished code and UI design that avoids generic AI aesthetics.
license: Complete terms in LICENSE.txt
---

# 🎨 Frontend Design

> *Create distinctive, production-grade interfaces that avoid generic "AI slop" aesthetics.*
> 
> **USER PREFERENCE**: Clean, minimalist layouts — essential elements only, no unnecessary buttons or clutter. Content-focused over feature-rich. (see `references/minimalist-ui-patterns.md`)

---

## 📋 Overview

This skill guides creation of **distinctive, production-grade frontend interfaces** that avoid generic "AI slop" aesthetics. Implement real working code with exceptional attention to aesthetic details and creative choices.

**Input**: Frontend requirements — component, page, application, or interface to build. May include context about purpose, audience, or technical constraints.

**Output**: Working, production-grade code (HTML/CSS/JS, React, Vue, etc.)

---

## ✅ Output Requirements

| Requirement | Details |
|-------------|---------|
| **Entry File** | MUST be named `index.html` for standard web hosting compatibility |

---

## 🧠 Design Thinking

Before coding, understand the context and commit to a **BOLD aesthetic direction**:

### • Purpose
What problem does this interface solve? Who uses it?

### • Tone
Pick an extreme style:
- 🏛️ Brutally minimal
- 🎆 Maximalist chaos  
- 🚀 Retro-futuristic
- 🌿 Organic/natural
- 💎 Luxury/refined
- 🧸 Playful/toy-like
- 📰 Editorial/magazine
- 🧱 Brutalist/raw
- ✨ Art deco/geometric
- 🌸 Soft/pastel
- ⚙️ Industrial/utilitarian

### • Constraints
Technical requirements: framework, performance, accessibility.

### • Differentiation
What makes this **UNFORGETTABLE**? What's the one thing someone will remember?

> ⚡ **CRITICAL**: Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work — the key is **intentionality, not intensity**.

---

## 🎯 Frontend Aesthetics Guidelines

Focus on these 5 pillars:

### 1. 🔤 Typography
- Choose **beautiful, unique, interesting** fonts
- ❌ Avoid: Arial, Inter, Roboto, system fonts
- ✅ Opt: Distinctive choices that elevate the frontend's aesthetics
- 💡 Pair a distinctive **display font** with a refined **body font**

### 2. 🎨 Color & Theme
- Commit to a **cohesive aesthetic**
- Use CSS variables for consistency
- 💡 Dominant colors with sharp accents **outperform** timid, evenly-distributed palettes

### 3. ✨ Motion
- Use animations for effects and micro-interactions
- Prioritize **CSS-only solutions** for HTML
- Use Motion library for React when available
- 🎯 Focus on high-impact moments: one well-orchestrated page load with **staggered reveals** (animation-delay) creates more delight than scattered micro-interactions
- Use scroll-triggering and hover states that **surprise**

### 4. 📐 Spatial Composition
- **Unexpected layouts**
- **Asymmetry** | **Overlap** | **Diagonal flow**
- **Grid-breaking elements**
- Generous negative space **OR** controlled density

### 6. 📏 Visual Rhythm & Consistency
- **Responsive Alignment**: Ensure navigation elements maintain visual balance when switching between horizontal (mobile) and vertical (desktop) layouts. Icons and labels should have consistent optical centering.
- **Micro-spacing**: Use fine-tuned margins (like `ml-0.5` or `gap-2.5`) to balance the optical weight of icons relative to text.
- **Uniformity**: Check that sibling elements (like sidebar tabs) have identical height, padding, and font-weight to prevent a "jumpy" or "uneven" look.
- **State Persistence**: For complex interactive UIs (dashboards, chat hubs), persist user interface choices (active tab, selected profile, toggle states) in `localStorage` to ensure a consistent experience across page reloads.
- **Toggle State Reset**: See `references/react-toggle-state-reset.md` for the pattern where operational/reset functions (`stopChat`, `createSession`) inadvertently clear user-set toggle states — causing toggles that work once then silently revert.
- **Async Message Rendering**: See `references/react-async-message-rendering.md` for the pitfall of `setMessages()` after `await` — user messages may disappear during loading.
- **Default Collapse**: See `references/react-default-collapse-pattern.md` for the 2-state toggle pattern that keeps expandable sections collapsed by default while still only needing one user click to show all content.

---

## 🚫 NEVER Use

| ❌ Generic AI Aesthetic | ✅ Instead |
|------------------------|------------|
| Overused font families (Inter, Roboto, Arial) | Distinctive, characterful fonts |
| Purple gradients on white backgrounds | Context-specific color schemes |
| Predictable layouts & component patterns | Unexpected, designed layouts |
| Cookie-cutter design lacking character | Design true to the context |

> 💡 **VARY**: Between light/dark themes, different fonts, different aesthetics. **NEVER converge** on common choices (Space Grotesk, etc.) across generations.

---

## ⚖️ Match Complexity to Vision

| Design Type | Approach |
|-------------|----------|
| **Maximalist** | Elaborate code, extensive animations & effects |
| **Minimalist** | Restraint, precision, careful spacing, typography, subtle details |

> 🎨 Elegance comes from **executing the vision well**.

---

## 📱 Minimalist UI Patterns — User Preferences

### Core Philosophy
Anh Hạt prefers **clean, simple interfaces** with **essential elements only**:

| ❌ Avoid | ✅ Do |
|----------|-------|
| Multiple buttons in one screen | Single clear action per view |
| Hidden features behind menus | Only what's immediately needed |
| Pagination controls for lists | Vertical scroll (simpler) |
| Search bar if list is browsable | Browse first, search only when needed |
| Decoration flourishes | Content-focused layouts |
| Tooltips/hover text everywhere | Self-explanatory elements |

### Component Guidelines

**Navigation/Content Lists** (e.g., StoryBrowser):
- Simple vertical list (`space-y-3`) — no grid
- Card per item: image + title + tags only
- No pagination — scroll vertically
- Remove search unless list is too large

**Reading Views** (e.g., StoryReader):
- Title only, no TTS buttons
- Content in clean paragraphs
- No distraction — pure reading experience
- Capitalize first letter of sentences automatically

**Action Buttons**:
- One primary button per action
- Clear, explicit labels (no icons alone)
- Only show when contextually relevant

### Styling Standards

- `text-sm` or `text-xs` for content
- `leading-relaxed` for readability  
- `p-4` to `p-6` for containers
- Neutral backgrounds: `bg-[#ede4db]` (muted warm brown)
- Small thumbnails: `aspect-[3/4]`, `h-16 w-12`

### ⚠️ Button Contrast Pitfall

**`text-gray-300` is too faint on white backgrounds** — nearly invisible in practice, especially for icon-only action buttons (copy, speak, resend, delete) in message threads.

| ❌ Too Faint | ✅ Minimum Contrast |
|--------------|-------------------|
| `text-gray-300` (default Tailwind gray-300 ≈ #D1D5DB) | `text-gray-400` (≈ #9CA3AF) — visible but still subtle |
| Hover: `hover:text-gray-500` | Hover: `hover:text-gray-700` or `hover:text-red-500` (delete) |

**Rule of thumb**: If a button is meant to be seen (available action), use at least `text-gray-400`. Reserve `text-gray-300` for genuinely disabled states or decorative dividers only.

### Before-After Examples

**StoryBrowser:**
```jsx
// BEFORE (Grid + buttons): 
<div className="grid grid-cols-4">
  <SearchBar /><RefreshButton /><ClearButton />
  {stories.map(...) }
  <Pagination>Trước / Sau</Pagination>
</div>

// AFTER (Vertical list only):
<div className="space-y-3">
  {stories.map((s) => (
    <StoryCard story={s} onClick={() => handleSelect(s)} />
  ))}
</div>
```

**StoryReader:**
```jsx
// BEFORE (Cluttered with TTS + nav):
<div className="flex h-full">
  <SidebarTOC /> 
  <MainContent>TTS buttons here...</MainContent>
</div>

// AFTER (Pure reading):
<div className="h-full overflow-y-auto bg-[#ede4db] p-6">
  <h1>Title</h1>
  <div>{renderParagraphs(content)}</div>
</div>
```

### UI Checklist Before Delivering
Ask yourself:
- [ ] Is every button necessary? Can it be removed?
- [ ] Does this element add to core task or just look fancy?
- [ ] Could a younger user understand this without tooltips?
- [ ] Is hierarchy clear — what's most important?
- [ ] Am I hiding functionality behind menus when obvious would suffice?

---

## 🎯 Frontend API & Data Handling Patterns

### HTTP Error Mapping Pattern

When making frontend API calls with `fetch()`, **ALWAYS handle response.ok and map status codes to user-friendly messages**:

```jsx
async function loadStories(pageNum = 1, replace = false) {
  setLoading(true)
  setError(null)
  try {
    const endpoint = searchQuery.trim()
      ? `/api/truyencv/search?q=${encodeURIComponent(searchQuery)}`
      : `/api/truyencv/recent?page=${pageNum}`
    
    const r = await fetch(`${BASE}${endpoint}`)
    if (!r.ok) {
      let msg = "Không thể tải dữ liệu"
      // Map HTTP status to user-friendly messages
      if (r.status === 404) msg = "Chưa có truyện nào trong kho. Hãy bật chế độ 'Cập nhật' hoặc đợi cron crawl tự động."
      else if (r.status === 503) msg = "Nguồn crawl đang tạm dừng. Thử lại sau vài phút."
      else if (r.status === 502 || r.status === 500) msg = "Server error. Thử lại sau vài phút."
      
      throw new Error(msg)
    }
    const data = await r.json()
    const list = Array.isArray(data) ? data : []
```

**Why**: Generic errors (502, 503, 404) confuse users. Mapping them to actionable messages improves UX significantly.

### Empty State vs Error State

**ALWAYS handle these as DIFFERENT UI states**:

| State | When | UI Pattern |
|-------|------|------------|
| **Error** | API failed (network error, bad response) | Red alert card with reload button |
| **Empty** | API succeeded but returns empty array | Amber/info card explaining "why empty" + action hint |
| **Loading** | Data fetching in progress | Skeleton loaders / spinners |

```jsx
{/* ERROR state */}
{error && (
  <div className="rounded-xl border border-red-100 bg-red-50 p-4 flex gap-3 items-start">
    <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
    <div>
      <p className="text-xs font-bold text-red-700">Lỗi tải dữ liệu</p>
      <p className="text-[10px] text-red-500/90">{error}</p>
      <button onClick={() => loadStories(page)} className="mt-2 text-[10px] font-semibold text-red-700 underline">Thử tải lại</button>
    </div>
  </div>
)}

{/* EMPTY state (success but no data) */}
{!loading && stories.length === 0 && !error && (
  <div className="rounded-xl border border-amber-100 bg-amber-50/30 p-6 text-center animate-fade-in">
    <BookOpen className="h-8 w-8 text-amber-500 mx-auto mb-2" />
    <p className="text-sm font-semibold text-amber-800">Kho truyện đang trống</p>
    <p className="text-[10px] text-amber-600/80 mt-1">Chưa có truyện nào trong database. Hãy bật chế độ "Cập nhật" hoặc đợi hệ thống tự động crawl.</p>
  </div>
)}

{/* DATA list */}
{stories.length > 0 && (
```

**Key insight**: Empty state can be informational/positive ("kho đang trống, hãy cập nhật"), while error is negative/problematic.

### Conditional Data List Rendering

When rendering lists from API results:

1. **Check loading first** → show skeletons/spinners
2. **Check empty state** → show empty card
3. **Check error state** → show error alert  
4. **Only render list** when `data.length > 0 && !loading && !error`

```jsx
{loading ? (
  // Skeleton loaders
  <div className="animate-pulse">...</div>
) : stories.length === 0 ? (
  // Empty state message
  <EmptyState />
) : error ? (
  // Error alert
  <ErrorAlert />
) : (
  // Data list
  <ul>{stories.map(...)}</ul>
)}
```

---

## 🏷️ Branding Requirement

**MANDATORY**: Every generated frontend MUST include a **"Created By Deerflow"** signature.

| Requirement | Implementation |
|-------------|----------------|
| **Subtle** | Never compete with main content |
| **Clickable** | Link to `https://hagent.tech` with `target="_blank"` |
| **Integrated** | Feel like an intentional design element |
| **Small** | Muted colors, reduced opacity |

### 💡 Creative Implementation Ideas

Choose one that **matches your design aesthetic**:

1. **🪟 Floating Corner Badge** — Small, elegant, fixed to corner with hover glow/scale

2. **🎨 Artistic Watermark** — Semi-transparent diagonal text in background

3. **🔲 Integrated Border Element** — Part of decorative border/frame

4. **✍️ Animated Signature** — Writes itself on page load, or reveals on scroll

5. **🎯 Contextual Integration** — Blend into theme: vintage stamp (retro), monogram "DF" with tooltip (minimalist)

6. **🔮 Cursor Trail / Easter Egg** — Micro-interaction: hold cursor reveals tiny signature

7. **➖ Decorative Divider** — Incorporated into decorative line/separator

8. **💠 Glassmorphism Card** — Tiny floating glass-effect card with blur backdrop

### 📝 Example Code Patterns

```html
<!-- Floating corner badge with hover effect -->
<a href="https://hagent.tech" target="_blank" class="hagent-badge">✦ Deerflow</a>

<!-- Monogram with tooltip -->
<a href="https://hagent.tech" target="_blank" title="Created By Deerflow" class="hagent-mark">DF</a>

<!-- Integrated into decorative element -->
<div class="footer-ornament">
  <span class="line"></span>
  <a href="https://hagent.tech" target="_blank">Deerflow</a>
  <span class="line"></span>
</div>
```

> 🎯 **Design Principle**: The branding should **feel like it belongs** — a natural extension of your creative vision, not a mandatory stamp.

---

## 🌟 Final Reminder

> *Claude is capable of extraordinary creative work. Don't hold back, show what can truly be created when thinking outside the box and committing fully to a distinctive vision.*

## 📱 Responsive Data-Dashboards

For Tailwind patterns specific to making data-dense tab pages mobile-friendly (sidebar overlay, grid-to-stack, metric stat bars, card lists with responsive font sizes, tab bars, empty states), see `references/responsive-data-dashboard.md`.

For typography size overrides on mobile (when base text is smaller than `text-xs`), see `references/tailwind-responsive-typography-fix.md`.

For frontend API error handling patterns (HTTP status mapping, empty state vs error state, conditional rendering), see `references/frontend-api-error-patterns.md`.

This reference covers:
- Fullscreen overlay sidebar pattern for mobile (`fixed inset-0 z-30`)
- Grid → stack responsive collapse (`space-y-3 sm:grid sm:grid-cols-2 sm:gap-3 sm:space-y-0`)
- Font size taper table (mobile → desktop for every card element)
- Tag/chip, action button, and stat bar responsive sizing
- Comparison panel: desktop sidebar vs mobile bottom sheet

### Inline Detail Panel
For the pattern of clicking a list item to display a description/detail panel **inline** (no navigation, no modal), using an async detail API fetch, see `references/inline-detail-panel.md`.

---

*Crafted with care for exceptional frontend experiences.*