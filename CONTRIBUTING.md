# Contributing

Issues and pull requests are welcome. Print reports are especially useful: say which printer,
material and rail clearance you used, and what fitted or did not.

## Before you open a pull request

1. Change parameters or geometry in **both** kernels when a part changes shape:
   `web/kernel.js` (the builder) and `cad/drawer_system/parts.py` (CadQuery).
2. Run the builder tests and rebuild the page:

   ```bash
   cd web && npm ci && npm test && npm run build
   ```

3. If you touched shared geometry, check parity with CadQuery:

   ```bash
   cd cad && python tools/py_ref.py /tmp/py_default
   cd ../web && npm run test:parity    # then compare volumes, see test/export.test.mjs
   ```

4. Check printability of new or changed meshes (no supports, nothing under 0.4 mm):

   ```bash
   PRINT_DIR=/tmp/prints node test/addons.test.mjs
   python -m drawer_system.check_stl /tmp/prints/addons_print --bed 256   # from cad/
   python tools/thin_check.py /tmp/prints/addons_print                     # from web/
   ```

5. Commit the rebuilt `index.html` with your change. CI fails if it is out of date.

## Conventions

- Clearances are per side and live in parameters, never in scaled files.
- Every part must print without supports in the pose it is exported in.
- UI changes use the design tokens at the top of `web/src/template.html`; keep touch targets
  at least 44 px and text contrast at least 4.5:1.
