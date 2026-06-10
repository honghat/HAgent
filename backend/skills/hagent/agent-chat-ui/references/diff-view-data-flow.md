# Diff View Data Flow — Session Implementation Notes

## Problem

Agent tool calls (especially `patch`) produce structured diff output, but the frontend only showed `+N -M` counts without the actual line-by-line diff. Users wanted a GitHub-style view: red for deletions, green for additions, per file.

## Solution

Three-layer change spanning backend → frontend chat → UI component.

## Layer 1: Backend (`api/routers/messages.py`)

### How file changes work today

`_emit_file_change()` is called for `write_file` and `patch` tool results. It:
1. Parses the JSON result string
2. For `patch` tools, extracts `data.get("diff", "")` and counts `+`/`-` lines
3. Emits a WS `file_change` event: `{path, added, removed, tool, patches}`
4. Persists to journal: `{added, removed, tool, patches}` JSON

### Key insight: the `patches` field

The `patch` tool returns structured data with `data.patches = [{filename, diff}, ...]`. This is **already in the tool result** — we just weren't passing it through. The fix was minimal:

```python
patches = data.get("patches", [])
# Include in both emit() and add_journal() content
```

The `diff` field is a flat string (unified diff format); `patches` is a structured array. Both exist, but `patches` is preferred because it's already parsed by the patch tool into per-file chunks.

## Layer 2: Frontend Chat (`Chat.jsx`)

`parseJournal()` in Chat.jsx processes journal entries. Before the change:

```javascript
fileChangesFromJournal.push({
  path: entry.name,
  added: parsed.added || 0,
  removed: parsed.removed || 0,
  tool: parsed.tool || ''
})
```

After:

```javascript
fileChangesFromJournal.push({
  path: entry.name,
  added: parsed.added || 0,
  removed: parsed.removed || 0,
  tool: parsed.tool || '',
  patches: parsed.patches || []
})
```

## Layer 3: UI Component (`StepsTimeline.jsx`)

### State management

Two independent toggle states:

```javascript
const [diffExpanded, setDiffExpanded] = useState({})
```

Each file index tracks its own diff state. Object keys = file indices. This prevents "click one, expand all".

### Component props passed down

```javascript
<FileChanges
  fileChanges={fileChanges}
  diffExpanded={diffExpanded}
  toggleDiff={toggleDiff}
/>
```

### The diff renderer

Condition: `hasPatches = fileChanges.some(fc => fc.patches && fc.patches.length > 0)`
- If true: file rows become `<button>` with `cursor-pointer`
- Clicking toggles visibility of a `<div className="bg-gray-900 rounded-md">` container

Inside:
- Each patch item `{filename, diff}` renders as:
  1. Filename header bar (gray-800)
  2. `<pre>` with monospace text
  3. Each line classed by its first character:
     - `+` — green background + text
     - `-` — red background + text
     - `@@` — purple background + text
     - `diff --git` / `---` / `+++` — gray text (meta)
     - everything else — light gray text (context)

## Testing

- Manual: run a session that triggers `patch` tool calls (e.g., `skill_manage(action='patch')`)
- Verify: journal in DB contains `patches` array
- Verify: UI shows clickable file rows with chevron
- Verify: expand shows colored diff lines
- Verify: collapse restores compact view
- Build: `npm run build` must succeed (no new deps needed)
