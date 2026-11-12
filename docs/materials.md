---
title: Choosing a filament
---

# Choosing a filament

[← Builder](../index.html) · [Build guide](build-guide.md)

Pick the filament in the builder under **3 Print → Filament**. It sets the starting
clearances, and the [fit test kit](fit-test-kit.md) is centred on them, so one test print tells you which way to
adjust.

| | PLA / PLA+ | PETG | ABS / ASA |
| --- | --- | --- | --- |
| Rail clearance per side | 0.25 mm | 0.30 mm | 0.35 mm |
| Drawer clearance per side / above | 0.35 / 0.50 mm | 0.40 / 0.55 mm | 0.45 / 0.60 mm |
| Softens at about (glass transition) | 55–60 °C | 80–85 °C | 100–110 °C |
| Easiest to print | Yes | Yes, a little stringy | Needs an enclosure and a brim |
| Springs and clicks | Firmest click, wears fastest | Longest spring life | Good |
| Best for | Indoor storage at room temperature | Workshops, garages, loaded drawers | Hot rooms, cars, outdoors (ASA resists UV) |

## Why the clearances differ

Each step from PLA to PETG to ABS/ASA adds 0.05 mm per side. Published sliding-fit ranges move
the same way: PLA is the most dimensionally stable, PETG a step more sensitive, and ASA the
most prone to shrinkage and warping. These presets sit at the top of each range because the
rails slide 130 mm across the print layers.

## Things to know

- **PLA** creeps under a steady load and softens on a hot dashboard or a sunny window sill.
  Keep heavy, always-full drawers out of warm places, or print them in PETG.
- **PETG** handles warmth and repeated flexing better, which suits the lock and stop springs.
  Dry it if it strings, and keep the first layer from over-squishing.
- **ABS and ASA** shrink as they cool. Print in an enclosure, with a brim, and away from drafts.
  ASA is the one to choose for anything near a window or outdoors.

## After the first test print

The test kit has five groove pieces (3 notches = the preset, 0.05 mm per notch) and three
drawer slices (2 notches = the preset, 0.10 mm per notch). If another piece fits better, set
the difference under **3 Print → Advanced** and download again.

Sources: [All3DP: glass transition of PLA, PETG and ABS](https://all3dp.com/2/pla-petg-glass-transition-temperature-3d-printing/) ·
[All3DP: PETG vs ABS](https://all3dp.com/2/petg-vs-abs-3d-printing-filaments-compared/) ·
[Sovol: FDM tolerances and clearances](https://www.sovol3d.com/blogs/news/fdm-3d-printing-tolerances-clearances-how-to-design-parts-that-fit) ·
[Qidi: snap-fit clearance by material](https://us.qidi3d.com/blogs/print-lab/3d-printed-snap-fit-joints-clearance-guide).
More in [Where the numbers come from](sources.md).
