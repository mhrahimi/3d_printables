# Changelog

## 1.1.0 — 2026-11-12

- Filament choice (PLA, PETG, ABS/ASA) sets the starting rail and drawer clearances; a new
  [filament page](docs/materials.md) explains the choice.
- Clearances are now fine-tuned as offsets from the preset (±0.10 mm) under *Advanced*.
- Test kit: groove pieces centred on the preset, plus a drawer opening and three drawer slices.
- Sturdy rails option (2.0 mm high, 6 mm neck), in the builder and `cad/build.py --rails sturdy`.
- Finger-notch drawer pull as an alternative to the lip.
- New tests: whole walls checked part against part (drawers closed and at their stops), and
  every insertion path swept to map contact.
- [Where the numbers come from](docs/sources.md): the research behind the design choices.
- Rows are listed top row first, as on the wall (still numbered from the bottom).
- Legs are off by default (base plate); when on they start at 7.5 mm, adjustable 5–120 mm.
- Panel pieces are chosen separately for the top, the sides and the bottom.
- *Open in Kiri:Moto* (3 Print > Slice in your browser): send one part or the whole set straight
  into Grid.Space's free browser slicer, without downloading or uploading anything.

## 1.0.0 — 2026-11-12

First public release.

- Modular drawer system on a 60 × 40 × 130 mm grid: casings, drawers, dividers, base plates
  and a fit test kit. Dovetail rails with a snap lock, drawer stop, no supports.
- Browser builder: columns, rows built from the bottom up, compartments, 3D preview with
  overall dimensions, parts list, ZIP of print-ready STLs.
- Finish add-ons: minimal, labelled (title or per column and row, pressed in or raised,
  flat or tilted strip) and structural panels (round or square rod, 3–12 mm); base plate or
  legs (15 mm by default); panels in bed-sized or per-column and per-row pieces.
- Clearance and printability audit: every mating pair measured, every print mesh sliced.
