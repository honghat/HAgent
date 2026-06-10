# Canvas Enhancement Patterns (PDF Viewer Example)

## Overview

This document documents techniques for enhancing canvas-based viewers (e.g., PDF with pdfjs-dist).

## Auto-page-turn on Mouse Wheel

### Implementation

Add event listener to container/canvas element:

```jsx
<div 
  className="canvas-container" 
  onMouseWheel={handleMouseWheel}
/>

const handleMouseWheel = useCallback((e) => {
  const wheelSpeed = -1 * e.deltaY * 0.5; // Normalize scroll speed
  const newIdx = Math.min(
    Math.max(activeIdx + wheelSpeed, 0),
    pages.length - 1
  );
  if (newIdx !== activeIdx) {
    setActiveIdx(newIdx);
    // Render the page with pdfjsLib
  }
}, [activeIdx, pages]);
```

### Key Considerations

- **Calculate scroll speed** from `deltaY`:
  - Positive deltaY = scroll down (next page)
  - Negative deltaY = scroll up (previous page)
  - Multiply by 0.5 for finer control

- **Use `useCallback`** for event handlers to prevent re-render issues

- **Validate page bounds** before navigation:
  ```js
  const newIdx = Math.min(
    Math.max(activeIdx + wheelSpeed, 0),
    pages.length - 1
  );
  ```

- **Canvas-based renderers need explicit scroll listeners** (unlike scrollable containers)

## Display Page Numbers at Corner

### Implementation

```jsx
<div className="text-[10px] text-gray-500">
  {pages.length} trang · Trang {activeIdx + 1} / {totalPages}
</div>
```

### Best Practices

- Place page indicator in toolbar for visibility
- Show both total pages and current page
- Use small font size (10px) to maintain clean UI
- Consider color contrast with background

## Related Patterns

See `video-generation` skill for complete GSAP full animation compose workflow.