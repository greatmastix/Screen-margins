/* Built-in switcher conventions. Each `p` is a partial profile; loading one keeps the current canvas size.
 * Keep `note` honest about what is documented and what is assumed. */
window.SM_PRESETS = [
  {
    id: 'atem-dve', label: 'Blackmagic ATEM · Upstream key DVE / Picture in Picture',
    note: 'Position X / Y place the DVE’s centre: 0,0 = frame centre, ±16 = left / right edge, ±9 = top / bottom edge, Y counts up (top-left quarter = −8, 4.5). The same numbers at every resolution. Size X / Size Y: 1 = full frame. Based on ATEM SDK examples for 16:9; check one value on the switcher.',
    p: { unit: 'custom', range: { left: -16, right: 16, top: 9, bottom: -9 }, origin: 'c', yUp: true, pos: 'anchor', anchor: 'c', size: 'scale', uniform: false, decimals: 2,
      labels: { x: 'Position X', y: 'Position Y', w: 'Size X', h: 'Size Y' } },
  },
  {
    id: 'atem-ss', label: 'Blackmagic ATEM · SuperSource box',
    note: 'Assumed to use the same ±16 / ±9 grid as the DVE (box centre, Y up); Size is one value, 1 = full frame, keeping 16:9. Not yet checked on a switcher.',
    p: { unit: 'custom', range: { left: -16, right: 16, top: 9, bottom: -9 }, origin: 'c', yUp: true, pos: 'anchor', anchor: 'c', size: 'scale', uniform: true,
      aspectW: 16, aspectH: 9, decimals: 2, labels: { x: 'X Position', y: 'Y Position', s: 'Size', w: 'Size X', h: 'Size Y' } },
  },
  {
    id: 'barco-em', label: 'Barco Event Master · E2 / E3 / S3 / PDS-4K',
    note: 'H Pos / V Pos: pixels from the destination’s top-left corner to the layer’s top-left corner; H Size / V Size in pixels. This is the default origin (the PDS-4K manual’s API example shows a full-screen layer as 0, 0, 1920, 1080).',
    p: { unit: 'px', origin: 'tl', yUp: false, pos: 'anchor', anchor: 'tl', size: 'axis', uniform: false, decimals: 0,
      labels: { x: 'H Pos', y: 'V Pos', w: 'H Size', h: 'V Size' } },
  },
  {
    id: 'barco-em-center', label: 'Barco Event Master · “Layer Position Center of Destination”',
    note: 'With this Event Master preference ticked, 0,0 is the destination’s centre and the position is the layer’s centre, in pixels. Barco’s manual doesn’t say which way V Pos counts here; this assumes down, like the default mode. Check one value on the processor.',
    p: { unit: 'px', origin: 'c', yUp: false, pos: 'anchor', anchor: 'c', size: 'axis', uniform: false, decimals: 0,
      labels: { x: 'H Pos', y: 'V Pos', w: 'H Size', h: 'V Size' } },
  },
  {
    id: 'aw-webrcs', label: 'Analog Way LivePremier (Aquilon) · Alta 4K (Zenith) · Web RCS',
    note: 'Web RCS positions a layer by its centre, in pixels from the screen’s top-left corner; size in pixels. A full-screen 1920×1080 layer sits at 960, 540.',
    p: { unit: 'px', origin: 'tl', yUp: false, pos: 'anchor', anchor: 'c', size: 'axis', uniform: false, decimals: 0,
      labels: { x: 'Pos X', y: 'Pos Y', w: 'Size W', h: 'Size H' } },
  },
  {
    id: 'obs-tl', label: 'OBS Studio · Positional Alignment top-left (default)',
    note: 'Edit Transform: Position is the point picked in “Positional Alignment”, in canvas pixels from the top-left corner. Size in pixels. Top-left is OBS’s default alignment.',
    p: { unit: 'px', origin: 'tl', yUp: false, pos: 'anchor', anchor: 'tl', size: 'axis', uniform: false, decimals: 0,
      labels: { x: 'Position X', y: 'Position Y', w: 'Size W', h: 'Size H' } },
  },
  {
    id: 'obs-c', label: 'OBS Studio · Positional Alignment centre',
    note: 'Edit Transform with Positional Alignment set to Center: Position is the source’s centre in canvas pixels from the top-left corner. Size in pixels.',
    p: { unit: 'px', origin: 'tl', yUp: false, pos: 'anchor', anchor: 'c', size: 'axis', uniform: false, decimals: 0,
      labels: { x: 'Position X', y: 'Position Y', w: 'Size W', h: 'Size H' } },
  },
  {
    id: 'vmix-pan', label: 'vMix · Position tab (Pan / Zoom)',
    note: 'Resolution-independent. Pan X / Pan Y place the layer’s centre: 0 = centred, ±1 = frame edge, so ±2 at Zoom 1 is fully off screen; Pan Y counts up (forum-sourced, check once). Zoom 1 = full frame and keeps the input’s aspect.',
    p: { unit: 'custom', range: { left: -1, right: 1, top: 1, bottom: -1 }, pos: 'anchor', anchor: 'c', size: 'scale', uniform: true,
      aspectW: 16, aspectH: 9, decimals: 3, labels: { x: 'Pan X', y: 'Pan Y', s: 'Zoom', w: 'Zoom X', h: 'Zoom Y' } },
  },
];
