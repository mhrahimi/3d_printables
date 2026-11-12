---
title: Where the numbers come from
---

# Where the numbers come from

[← Builder](../index.html) · [Build guide](build-guide.md)

The design choices below come from published drawer systems, printer-maker guides and
tolerance references. The geometry itself was then checked by the tests in `web/test/`.

## Design decisions

| Decision | Choice | Evidence |
| --- | --- | --- |
| Joining modules | Dovetail rails on all four faces, running front to back | Published systems also use dovetails but add glue or loose joiners ([MakerWorld 164305](https://makerworld.com/en/models/164305), [MakerWorld 1711239](https://makerworld.com/models/1711239)). Front-to-back rails let a module slide into a corner between two neighbours. |
| Holding modules together | A sprung snap lock, blocked by the drawer | In [Modular Stackable Drawer Storage](https://printables.com/model/869842-modular-stackable-drawer-storage-many-variants), heavy drawers lifted the frame above until screws were added; [Gridfinity Modular Drawer System](https://printables.com/model/300896-gridfinity-modular-drawer-system) cases only stack on feet. |
| Rail clearance | 0.25 mm per side for PLA, test pieces ±0.10 mm | [Qidi](https://qidi3d.com/en-br/blogs/news/how-to-3d-print-interlocking-parts-and-assemblies) gives 0.20–0.30 mm for sliding dovetails, with friction rising sharply below 0.20. The [UAL fabrication lab](https://wiki.cci.arts.ac.uk/books/digital-fabrication-lab/page/design-the-clearance-and-tolerance) uses 0.15–0.2 mm on one printer and 0.3–0.4 mm on another, so the test kit decides. |
| Clearance by material | +0.05 mm per side from PLA to PETG to ABS/ASA | [Sovol](https://www.sovol3d.com/blogs/news/fdm-3d-printing-tolerances-clearances-how-to-design-parts-that-fit) suggests 0.15–0.25 (PLA), 0.2–0.3 (PETG), 0.25–0.35 mm (ASA) for sliding fits. [Qidi](https://us.qidi3d.com/blogs/print-lab/3d-printed-snap-fit-joints-clearance-guide) gives 0.2–0.3 mm for PLA/PETG and 0.3–0.5 mm for ABS/ASA. |
| Drawer clearance | 0.35 mm a side, 0.5 mm above (PLA) | The [Ultimate Drawer System](https://github.com/ALittleSlow/Ultimate-Drawer-System) leaves 0.5 mm. Here the casing walls print vertically, where size is most accurate, so the sides can be tighter. |
| Drawer stop | Built-in springs, 30° lead-in, 50° holding ramp | Rigid stops make insertion awkward (the 164305 designer warns drawers break if forced). An add-on [MultiBin stopper bar](https://thangs.com/designer/LeoB26/3d-model/MultiBin%3A%20Improved%20Drawer%20Stopper%20Bars-1220909) had to be glued down. |
| Spring direction | Springs lie flat in the print layers, under 1% strain | [Core77's snap-fit guide](https://www.core77.com/posts/65318/How-to-Design-Snap-Fit-Components) advises cantilevers in the X-Y plane; Qidi advises layers along a snap's length. |
| Bed-side edges | 0.5 mm chamfers, slits flared at the bed | Qidi recommends a 0.4 mm × 45° base chamfer plus 0.15–0.25 mm elephant's-foot compensation. |
| Fit test before a full print | Rail and drawer test pieces | Most published systems ship tolerance tests or looser variants, because fits differ between printers. |

## Material properties

| Source | Used for |
| --- | --- |
| [All3DP: glass transition of PLA, PETG and ABS](https://all3dp.com/2/pla-petg-glass-transition-temperature-3d-printing/) | Softening temperatures on the [filament page](materials.md) |
| [All3DP: PETG vs ABS](https://all3dp.com/2/petg-vs-abs-3d-printing-filaments-compared/) | Enclosure needs, ASA for outdoor use |
| [Sovol: FDM tolerances and clearances](https://www.sovol3d.com/blogs/news/fdm-3d-printing-tolerances-clearances-how-to-design-parts-that-fit) | Clearance ranking PLA < PETG < ASA |

## Not verified

Nothing here has been printed by the authors yet. Forces and spring life are beam-theory
estimates. Please share what fits on your printer in a
[print report](https://github.com/mhrahimi/3d_printables/issues/new?template=print_report.md).
