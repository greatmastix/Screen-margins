# Changelog

## v1.0.0 (2026-11-09)

First release.

- Source and target coordinate profiles:
  - units: pixels, percent, 0–1 or a custom range
  - any origin and Y direction
  - position as a point of the PiP, as distances from frame edges, as insets or as corner coordinates
  - size in position units or as a scale
- Switcher presets:
  - Barco Event Master / E2 / E3 / S3 / PDS-4K (top-left, and "Layer Position Center of Destination")
  - Analog Way LivePremier (Aquilon) and Alta 4K (Zenith) Web RCS
  - OBS Studio (top-left and centre alignment)
  - vMix Position tab (Pan / Zoom)
- Saved profiles, kept in the browser.
- PiP table:
  - each PiP can override the source's position format
  - aspect lock between W and H
  - paste from spreadsheets and PDFs
  - click a result to copy it, or copy all results as a table
- Preview:
  - drag to move, corner handle to resize
  - for the selected PiP, solid lines show what the source numbers measure and dashed lines what the target numbers measure, each labelled with its values
- Layout generator: N equal PiPs with outer margins, gaps and an aspect ratio.
