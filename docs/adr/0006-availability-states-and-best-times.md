# 0006. Three availability states and a "Best times" list

- **Status:** accepted
- **Date:** 2026-11-01

## Context

Across Europe, the Americas and Asia, many workable slots are early or late for someone. "I can do
06:00, but I'd rather not" is exactly the information that decides an international meeting, and a
binary grid can't express it. A heatmap alone also makes people hunt for the answer.

## Decision

**States.** Each slot in a response is **available**, **if needed**, or **unavailable** (the default).
Painting the grid uses two brushes (available / if needed) plus erase. The brush UI must stay one-tap
simple on mobile.

**Showing the result:**
- **Heatmap** over the shared grid. "If needed" counts less than "available" (shown in a lighter shade).
- **Slot detail:** tapping or hovering a slot shows who is available, who is "if needed", and who is missing.
- **Best times list:** consecutive slots merged into ranges and ranked, shown in the viewer zone with the
  creator zone alongside, e.g. "Tue 15:00–16:30 (Warsaw 21:00–22:30) · 7 of 8 · if needed: Ana · missing: Kenji".
- Ranking: most people available first; among equals, fewer "if needed"; then earlier in time.

**Meeting duration.** The creator can set how long the meeting is: 30 min, 1 h (default), 1.5 h or
2 h. "Best times" then lists only ranges at least that long. Viewers can change the duration as a local
filter, which isn't saved.

## Consequences

- Stored per response: two sets of slots (available, if needed). Everything else is unavailable.
- All computation happens in the browser from the full list of responses.
- The duration is stored on the event.
