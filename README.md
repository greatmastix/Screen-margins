# Screen margins

**Use it:** https://greatmastix.github.io/Screen-margins/

Converts picture-in-picture (PiP) positions and sizes between coordinate systems. Use it when a document gives a PiP one way (say, 640×360 px, 40 px from the right and bottom edges) and the switcher wants it another way (say, the PiP's centre, or a −1…1 pan with a zoom factor).

Everything runs in the browser. There is no server, and profiles and PiPs are saved in your browser's local storage.

## What it does

- **Source and target profiles.** Each one describes a coordinate system:
  - canvas size
  - unit: pixels, percent, 0–1, or a custom range (what each frame edge is worth, e.g. −16…16)
  - where 0,0 is, and whether Y counts up or down
  - what the position numbers name: a point of the PiP (any of 9), the distance from two frame edges, all four insets, or corner coordinates
  - size: same units as the position, or a scale where 1 / 100 % = full frame (optionally one value that keeps the aspect)
- **Switcher presets** (see below), plus your own saved profiles.
- **PiP table.** Add as many PiPs as you need. Each row can use its own position format, and each has an aspect lock between W and H: type whichever one is given, and the other follows. You can paste straight from a spreadsheet or a PDF. Click a result to copy it, or use "Copy results" for the whole table (tab-separated).
- **Relative PiPs.** A row can be positioned from another PiP: pick a point on the reference (e.g. its bottom-right), a point on this PiP (e.g. its top-left) and the offset ΔX / ΔY between them. Optionally it keeps the reference's size. Moving the reference moves everything that hangs off it. The target values are always absolute positions.
- **Sums in number fields.** Type `200+10` or `(1920-640)/2`; Enter or leaving the field replaces the sum with the result.
- **Preview.** Drag PiPs to move them, and drag any corner or edge handle to resize. With the aspect lock on, the PiP keeps its shape. Dragging snaps to the frame edges and centre, to other PiPs, and to equal gaps (centred between neighbours, or the same gap as next door); the Snap menu picks which, and Alt places freely. After clicking a PiP, the arrow keys move it by 1 px (Shift: 10 px, Alt: resize). For the selected PiP, solid lines show what each source number measures and dashed lines show what each target number measures, each labelled with its value.
- **Undo and redo** for every change: Ctrl+Z / ⌘Z, Ctrl+Shift+Z / Ctrl+Y / ⇧⌘Z, or the arrow buttons at the top.
- **Share links.** "Copy share link" puts both profiles and all PiPs into the link itself (after the `#`, so it never reaches a server). Opening it replaces the layout; Undo brings yours back. Saved profiles and the background image aren't included.
- **Layout generator.** Lays out N equal PiPs in a grid with outer margins, gaps and an aspect ratio.
- **Canvas background.** Load, drop or paste an image (a frame grab, the show's background) to see it behind the PiPs. It is stretched to the canvas, and a slider dims it.
- **Exports.**
  - *Download PNG*: the canvas at the target resolution, one image pixel per canvas pixel, with every PiP's measurements. Load it on the switcher as a still to check the layout.
  - *Download PDF report*: both profiles, the results table and the canvas.
  - Both are blocked while a number is missing or invalid.

  The PDF uses the standard Helvetica font, so a few characters are replaced (Δ prints as "d", → as "->", emoji as "?").

## Privacy

No cookies, no tracking, and nothing is loaded from other servers. What you enter stays in your browser's local storage, and share links keep their data after the `#`, which browsers never send to a server. GitHub Pages sees your IP address to deliver the page (see the [GitHub Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement)).

## Presets

Presets set the conventions and the device's field names. They keep your canvas size. Each preset shows a note in the app saying what it's based on.

| Preset | Position | Size |
|---|---|---|
| Blackmagic ATEM · Upstream key DVE / Picture in Picture | Position X / Y = DVE centre, 0,0 = frame centre, ±16 / ±9 = frame edges, Y counts up | Size X / Size Y, 1 = full frame |
| Blackmagic ATEM · SuperSource box | *assumed the same grid as the DVE* | Size, 1 = full frame (16:9) |
| Barco Event Master · E2 / E3 / S3 / PDS-4K | H Pos / V Pos: pixels from the destination's top-left to the layer's top-left | H Size / V Size, px |
| Barco Event Master · "Layer Position Center of Destination" | 0,0 = destination centre, layer centre, px. *V direction not stated in Barco's docs; assumed down.* | px |
| Analog Way LivePremier (Aquilon) · Alta 4K (Zenith) · Web RCS | layer centre, px from the screen's top-left | px |
| OBS Studio · Positional Alignment top-left / centre | Position at the alignment point, canvas px | Size, px |
| vMix · Position tab | Pan X / Pan Y = layer centre, 0 = centred, ±1 = frame edge; *Pan Y counts up (forum-sourced)* | Zoom, 1 = full frame |

The points in italics haven't been confirmed on hardware. If you can check one, please open an issue.

## Development

Plain HTML/JS, with no build step:

- `convert.js` holds the conversion maths and has no DOM code.
- `app.js` is the UI.
- `presets.js` holds the switcher presets.
- `pdf.js` is a small PDF writer for the report (text, lines, rectangles, one JPEG), with no dependencies.

Run the tests:

```bash
node test/convert.test.js
```

The browser tests (`test/e2e.test.mjs`) serve the page and drive it with [Playwright](https://playwright.dev) in Chromium, Firefox or WebKit:

```bash
npm i --no-save playwright && npx playwright install chromium
BROWSER=chromium node test/e2e.test.mjs
```

CI runs both, the browser tests in all three engines.

## Changes

See [CHANGELOG.md](CHANGELOG.md).

## License

MIT, see [LICENSE](LICENSE). No warranty: check the numbers on your switcher before the show.
