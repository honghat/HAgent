# Next.js Dev Mode: Turbopack HMR `insertBefore` Errors

## Symptom

Browser console shows a `DOMException: Failed to execute 'insertBefore' on 'Node'` error during hot module replacement (HMR). The error appears after saving a file while the dev server is running. A full page refresh (F5) clears the error and the page renders fine.

No stack trace pointing to user code — the error is in the Turbopack HMR client runtime.

## Root Cause

Turbopack (Next.js 15-16's default bundler) has a race condition in its HMR client when updating the DOM tree. When a hot update tries to insert a new element into the DOM at a position that has already changed (due to a previous pending update or component unmount), the browser throws `insertBefore` on `null` parentNode.

This is a **known Turbopack bug** — not a code defect. It is especially common:
- During rapid save cycles (saving multiple files in quick succession)
- When HMR tries to update components that are conditionally rendered
- In development mode (`next dev`) with Turbopack's parallel compilation

## Not a Code Problem

| Check | Result |
|-------|--------|
| Fresh page load (F5) | Works perfectly |
| Production build (`next build`) | No errors |
| `git diff` on relevant files | No changes |
| Other developers on same code | Same HMR errors |

If all of these pass, it is a dev-mode-only Turbopack HMR issue.

## Diagnostic Steps

1. **Confirm it's HMR-only:** Open the page in a new tab — does it work? → Yes → HMR issue
2. **Check the error details:** Browser DevTools console → look for the failed module path in the HMR client logs above the error
3. **Identify the exact file you were editing** when the error occurred — that module's HMR boundary may need a manual trigger:
   ```js
   // In browser console, force a re-hydration of the broken module
   // (Rarely needed, but if F5 doesn't work):
   localStorage.clear(); sessionStorage.clear(); location.reload();
   ```

## Fix Options

### 1. Quick Fix (Choose One)
- **F5 / Cmd+R** — 90% of cases resolved by a full page reload
- **Kill dev server and restart:**
  ```bash
  pkill -f "next dev" && npm run dev
  ```
- **Clear Turbopack's in-memory cache** by touching a file that triggers a full HMR boundary:
  ```bash
  touch src/app/layout.tsx  # triggers layout re-render, often unsticks HMR
  ```

### 2. Permanent Fix — Switch to Production Mode
```bash
# Build once
npm run build    # or pnpm build

# Serve the production build (no HMR at all)
npx next start -p 3012
```
Production mode uses the compiled bundle — no Turbopack, no HMR race conditions.

### 3. Switch to Webpack (Next.js option)
In `next.config.ts`:
```ts
const nextConfig = {
  experimental: { turbo: { enabled: false } }, // disable Turbopack, use Webpack
}
```
Then restart dev server. Webpack's HMR is slower but more stable for complex component trees.

## Prevention

- **Save files one at a time** with a brief pause between saves (avoid rapid-save bursts)
- **Use production build** for demo/QA sessions
- **Set `experimental.turbo.enabled: false`** if HMR breaks multiple times per day

## When NOT to Use This Guide

If the error persists after page reload AND production build fails → it's a real code bug. Follow the main systematic-debugging skill (Phase 1-4) to find the root cause.
