# Debug: Frontend shows empty/nothing despite data existing in DB + API returning it

## Symptom
A tab/hub component (e.g. Kho truyện / StoryBrowser) shows empty state or "Loading..." indefinitely, even though:
- DB has data (`SELECT COUNT(*) FROM stories` returns > 0)
- Backend API returns the data (`curl http://localhost:8010/api/truyencv/recent?page=1` shows JSON)
- Frontend component exists and is wired to the correct endpoint

## Root causes (most likely first)

### 1. Stale frontend bundle (most common)
`npm run build` produces hashed JS files in `frontend/dist/assets/`. If the user's browser loaded an older bundle (before the feature was added or the component was finalized), it will not render the tab correctly.

**Fix:**
```bash
cd frontend && npm run build
```
Then **hard refresh** (F5 / Cmd+Shift+R) on the browser — no server restart needed.

**Verification:** The dist file for the component will have a fresh hash after build.
```bash
ls -la frontend/dist/assets/*StoryBrowser*    # Check if it exists and is recent
```

### 2. Component not imported/lazy-loaded in parent Hub
The Hub component (e.g. `EntertainmentHub.jsx`) uses `React.lazy` to import children. If the import path is wrong or the component was renamed:
```jsx
// Wrong:
const StoryBrowser = lazy(() => import('./OldStoryBrowser'))
// Correct:
const StoryBrowser = lazy(() => import('./StoryBrowser'))
```

**Fix:** Check `import()` paths in the Hub component.

### 3. Tab not registered in Header.jsx / routing
The sidebar button for the tab may not exist in `Header.jsx`, or the Hub component is not rendered in `App.jsx`.

**Check:**
- `Header.jsx` — look for `activeTab === 'entertainment'` or similar
- `App.jsx` — look for `{view === 'entertainment' && <EntertainmentHub .../>}`

### 4. Backend API not serving correct format
Frontend may expect a specific response shape. Check the component's `apiGet()` call and the backend's response model.

**Example mismatch:** Frontend expects `{ stories: [...] }` but backend returns `[...]` directly, or vice versa.

## Investigation sequence
```
1. curl backend API → confirm 200 + data
2. `npm run build` → confirm component chunk exists in dist/
3. Hard refresh browser → if still broken, check browser DevTools console for errors
4. Check Hub component import paths
5. Check Header.jsx tab registration + App.jsx render guard
```
