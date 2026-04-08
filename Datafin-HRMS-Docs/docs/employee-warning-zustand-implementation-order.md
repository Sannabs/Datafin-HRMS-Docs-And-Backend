# Employee Warning Zustand Implementation Order

This is the recommended sequence for moving employee warning UI state from mocks/local state to a normalized Zustand store.

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
   - Keep feature parity with current UI behavior.

5. **Wire detail dialog + timeline**
   - Drive selected warning and detail panel from store.
   - Load and show timeline from warning-scoped timeline state.

6. **Wire employee profile warnings + escalation**
   - Connect profile cases panel to normalized entities and per-employee ids.
   - Replace escalation mock with store-backed summary state.

7. **Wire mutation actions**
   - Connect issue/submit/return/resolve/void/escalate/duplicate/export flows to API via store actions.
   - Update entities and ids optimistically or from server responses.

8. **Cleanup**
   - Remove mock adapters and redundant local state.
   - Keep store as single source of truth for warning module data.

## Notes

- Prioritize stable read flows before mutation flows.
- Keep UI components selector-driven to avoid broad rerenders.
- Normalize once, derive many views via selectors.
