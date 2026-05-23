# Viewbox is always synced to canvas dimensions

The SVG `viewbox` stored in the `maps` table must always equal `0 0 canvas_w canvas_h` from the map's `canvas_data`. It is updated on every editor save. This means the SVG fills screen space with no hardcoded padding — the user controls whitespace by choosing canvas dimensions in the editor.

Alternatives considered: fixed viewbox set at creation (stale after resizing), or derived from Zone bounds (breaks on empty maps, clips edge zones).
