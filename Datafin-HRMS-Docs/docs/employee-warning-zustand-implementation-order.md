# Employee Warning Zustand Implementation Order

This is the recommended sequence for moving employee warning UI state from mocks/local state to a normalized Zustand store.

## UI parity during wiring

Wiring steps should be **data-only**: replace mocks and scattered local state with store selectors, queries, and API-backed actions. **Do not** restyle or restructure screens as part of this work unless there is a separate, explicit UI change request.

- **Keep markup and layout**: Preserve existing JSX structure, spacing, and Tailwind classes so the discipline dashboard, tables, dialogs, and employee profile panels **look the same** before and after wiring.
- **Keep behavior**: Match current filters, search, sort, pagination, escalation cues (e.g. icons beside names, banners), and tooltips; only the source of truth for data should change.
- **Store vs presentation**: The store holds normalized entities and ordered IDs; derived presentation (badges, icons, formatted labels) stays in components.
- **Loading / empty / error**: Avoid layout shift where possible—mirror today’s behavior first (e.g. same shell while loading), then refine if needed.

Any visual or UX change should be a **deliberate follow-up**, not a side effect of Zustand integration.

## Order

1. **Types + API client**
   - Finalize warning domain types and request/response contracts.
   - Add a dedicated warning API client wrapper.

2. **Normalized Zustand store**
   - Implement `warningsById` entity map.
   - Add ID lists by scope (discipline list, employee list).
   - Add timeline and escalation maps.
   - Add loading/error state buckets.

3. **Selectors**
   - Add focused selectors for rows, detail by id, timeline by id, escalation by user, and action loading state.
   - Use shallow comparison where selectors return objects/arrays.

4. **Wire discipline list first**
   - Connect discipline header/table search, filters, sort, and pagination to store.
   - Keep feature **and visual** parity with the current UI (see [UI parity during wiring](#ui-parity-during-wiring)).

5. **Wire detail dialog + timeline**
   - Drive selected warning and detail panel from store.
   - Load and show timeline from warning-scoped timeline state—**without** changing dialog layout or styles.

6. **Wire employee profile warnings + escalation**
   - Connect profile cases panel to normalized entities and per-employee ids.
   - Replace escalation mock with store-backed summary state while keeping banners and panels visually unchanged.

7. **Wire mutation actions**
   - Connect issue/submit/return/resolve/void/escalate/duplicate/export flows to API via store actions.
   - Update entities and ids optimistically or from server responses; toasts and action bars should match existing patterns unless separately redesigned.

8. **Cleanup**
   - Remove mock adapters and redundant local state.
   - Keep store as single source of truth for warning module data.

## Notes

- Prioritize stable read flows before mutation flows.
- Keep UI components selector-driven to avoid broad rerenders.
- Normalize once, derive many views via selectors.
- Treat regressions in **appearance** (spacing, alignment, hierarchy) the same as functional bugs during wiring—fix by restoring previous UI, not by re-theming in the same PR.
