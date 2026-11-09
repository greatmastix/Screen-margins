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
- **Preview.** Drag PiPs to move them, and use the corner handle to resize. For the selected PiP, solid lines show what each source number measures and dashed lines show what each target number measures, each labelled with its value.
- **Layout generator.** Lays out N equal PiPs in a grid with outer margins, gaps and an aspect ratio.

## Presets

Presets set the conventions and the device's field names. They keep your canvas size. Each preset shows a note in the app saying what it's based on.

| Preset | Position | Size |
|---|---|---|
| Barco Event Master · E2 / E3 / S3 / PDS-4K | H Pos / V Pos: pixels from the destination's top-left to the layer's top-left | H Size / V Size, px |
| Barco Event Master · "Layer Position Center of Destination" | 0,0 = destination centre, layer centre, px. *V direction not stated in Barco's docs; assumed down.* | px |
| Analog Way LivePremier (Aquilon) · Alta 4K (Zenith) · Web RCS | layer centre, px from the screen's top-left | px |
| OBS Studio · Positional Alignment top-left / centre | Position at the alignment point, canvas px | Size, px |
| vMix · Position tab | Pan X / Pan Y = layer centre, 0 = centred, ±1 = frame edge; *Pan Y counts up (forum-sourced)* | Zoom, 1 = full frame |

The two points in italics haven't been confirmed on hardware. If you can check one, please open an issue.

## Development

Plain HTML/JS, with no build step:

- `convert.js` holds the conversion maths and has no DOM code.
- `app.js` is the UI.
- `presets.js` holds the switcher presets.

Run the tests:

```bash
node test/convert.test.js
```

## Changes

See [CHANGELOG.md](CHANGELOG.md).

## License

MIT, see [LICENSE](LICENSE). No warranty: check the numbers on your switcher before the show.
