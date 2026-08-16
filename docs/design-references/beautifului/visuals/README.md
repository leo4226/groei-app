# Visual evidence

Visual files in this directory are internal reference evidence only. They are not Floreren product assets and must never be shipped by the application.

## Current status

No screenshot is committed in version 1.0.0. On 2026-08-16, the live catalogue was visually inspected through browser automation. The capture tool rendered a screenshot to the agent session but did not provide a reliable repository-readable image file. No image was fabricated or copied from an unverified path.

The empty `manifest.yaml` is intentional and ready for a future manual capture.

## Adding a capture

Only add a small, representative capture when it can be saved reliably. For every file, add a manifest entry with:

- stable capture ID and relative path;
- source URL and capture date;
- viewport, theme, and what the image shows;
- SHA-256 checksum;
- statement that it is internal evidence, not a product asset.

Prefer an overview or one component state. Do not capture or include logos, marketing areas, or example business data unless that evidence is necessary and the scope is recorded. Do not use an image without a matching manifest entry.
