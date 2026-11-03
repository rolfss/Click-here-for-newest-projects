# Campaign Canvas

A focused, desktop-first relationship map for Dungeons & Dragons campaigns. No account, server, analytics, or remote storage. The campaign is saved privately to IndexedDB in the current browser.

## Start locally

Requires Node.js 20.19+ (Node 22 recommended).

    cd campaign-canvas
    npm install
    npm run dev

Open the URL printed by Vite.

## Verify and build

    npm run typecheck
    npm test
    npm run build
    npm run preview

The production build is written to dist/. Vite uses relative asset URLs so this app works in a GitHub Pages subdirectory.

## Working with the map

- Double-click empty canvas space to create an NPC and focus its name.
- **V** / **Select**: select and drag nodes, connect their visible handles (right of source to left of target), edit selected records in the sidebars.
- **H** / **Hand**: drag the background or nodes to pan without moving them. Hold **Space** for temporary Hand mode.
- Wheel / trackpad scroll: pan. Ctrl/Cmd + wheel (including trackpad pinch): zoom toward the pointer, 20%–200%.
- **Escape**: deselect; inside a text editor, blur instead. **Delete/Backspace**: delete selected element, with safeguards where necessary.
- Node and relationship changes save automatically. Refresh restores campaign metadata, node positions, relationships, event timelines, and viewport.
- Change a node type in the left editor. Incompatible populated fields are listed before removal. Faction and leader text are deliberately not automatic graph links.
- Relationship strength is always a number from -5 to +5. Every change is an immutable delta in the event timeline; deleting an event replays the remaining deltas from 0, in chronological order.

## Architecture

- src/domain/: discriminated-union data models, type registry, pure graph and history rules, Zod schema.
- src/store/: Zustand domain state and transient UI state.
- src/storage/: CanvasRepository contract and IndexedDB implementation.
- src/hooks/: guarded shortcuts and debounced autosave.
- src/canvas/, src/nodes/, src/relationships/: interactive React Flow rendering and geometry.
- src/sidebars/, src/ui/: contextual editors, timeline, field controls, accessible confirmation dialog.
- Unit tests cover domain constraints, history replay, storage recovery, and shortcuts. UI tests cover primary interactions.

The app always starts with exactly one canvas, with ID campaign-canvas-default. Persistence contains schemaVersion = 1. Corrupted data is copied to a timestamped IndexedDB backup key and an empty canvas is opened. Orphaned links are dropped on restore. Only saved domain state is persisted.

## MVP boundaries

No accounts, sync, back end, multiple canvases, multi-select, undo/redo, search, exports, imports, portraits, minimap, or mobile-specific layout. Browser storage is device- and browser-specific; clearing site storage deletes the map.

## GitHub Pages

The parent repository's deploy-pages.yml validates, builds and copies dist/ to _site/campaign-canvas. Public URL: https://rolfss.github.io/Click-here-for-newest-projects/campaign-canvas/

**Privacy:** GitHub Pages serves static app code; campaign records never leave the browser. Anyone with access to the same browser profile can access its saved campaign.
