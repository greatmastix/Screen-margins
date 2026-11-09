# Changelog

## v1.1.0 (2026-11-09)

- **Relative PiPs:** position a PiP from another one.
  - Choose "Relative to …" in the row's position menu, then a point on the reference and a point on this PiP, plus the offset ΔX / ΔY between them.
  - "Same size as …" keeps its W/H equal to the reference.
  - Moving or resizing the reference moves its dependants.
  - Deleting a reference turns its dependants into absolute positions where they are.
  - Adding a PiP after a relative row continues the chain.
- **Sums in number fields:** every number field accepts arithmetic (`+ - * /`, brackets, decimal comma), e.g. `200+10` or `(1920-640)/2`. Enter or leaving the field shows the result.
- **Download PNG:** the canvas at the target resolution with every PiP's measurements, to load on the switcher as a still.
- **Download PDF report:** both profiles, the results table and the canvas, as A4 landscape.
- **Exports are blocked while numbers are invalid.** The buttons say why, and a click jumps to the field that needs fixing.
- **Canvas background:** show an image behind the PiPs (button, drag and drop, or paste), stretched to the canvas, with a dim slider. It's remembered in the browser and included in both exports.
- Small relative offsets share one label in the preview instead of overlapping.
- Try dividing by zero and pressing Enter.

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
