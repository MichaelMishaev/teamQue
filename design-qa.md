# Public line games-remaining timeline

- source: `/Users/michaelmishayev/.codex/generated_images/019fad59-d437-71d0-82d7-08c9d15703f5/call_d23OM8xTuDqwB18sopr0oGUp.png`
- implementation: `/Users/michaelmishayev/.codex/visualizations/2026/07/29/019fad59-d437-71d0-82d7-08c9d15703f5/public-line-timeline-local-390x844.png`
- viewport: 390 × 844 CSS px at 1× density
- state: active match with approximately 04:27 remaining and six complete waiting pairs
- combined comparison: `/Users/michaelmishayev/.codex/visualizations/2026/07/29/019fad59-d437-71d0-82d7-08c9d15703f5/public-line-timeline-comparison.png`

## Comparison findings

- The right-side vertical timeline contains the visible games-remaining values 1–6.
- The first marker is filled and later markers are outlined, matching the selected hierarchy.
- Six complete pairs remain visible in one 390 × 844 viewport.
- Pair names, the accent "against" label, and the approximate wait remain readable without overlap or truncation.
- Duplicate textual game counts and queue-position numbers were removed so the marker numbers have one unambiguous meaning.
- Existing app-shell and live-match patterns were retained intentionally. ETA values include the product's configured one-minute transition gap between games, so they are one minute later than the concept image.

## QA history

- P1 resolved: moved game counts from row copy into the timeline markers.
- P1 resolved: moved the community block below the queue so the line remains the hero surface.
- P2 resolved: collapsed separate cards into compact continuous rows and removed duplicate numeric labels.
- P2 resolved: aligned the vertical line through every marker and kept the active marker visually dominant.

## Sticky WhatsApp follow-up

- implementation: `/Users/michaelmishayev/.codex/visualizations/2026/07/29/019fad59-d437-71d0-82d7-08c9d15703f5/public-line-whatsapp-sticky-local-390x844.png`
- viewport: 390 × 844 CSS px at 1× density
- The WhatsApp link is a visible 44 × 44 touch target inside the 84.5px sticky header.
- The large lower community card was removed to avoid duplicate calls to action and preserve queue density.
- The viewport remains exactly 390px wide with no horizontal overflow, and all six waiting pairs remain visible.

final result: passed
