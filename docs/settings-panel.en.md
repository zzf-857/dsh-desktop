# Draggable and resizable settings panel

In the Desktop settings panel:

- Drag the title, blank header area or move icon to reposition the panel.
- Drag any edge, corner or the bottom-right resize icon to change its size.
- Focus the move or bottom-right resize icon and use the arrow keys for fine adjustments; hold Shift for larger steps.
- Double-click the title, blank header area or move icon to restore the initial size and center the panel.
- Closing and reopening retains geometry within the current window; restarting the application restores the default layout.
- The whole panel stays within the visible content area. Its normal minimum is 720 × 380 CSS pixels, reduced when the available area is smaller.

## Upstream boundary

The feature lives in each Stable/Beta package's `src/client/settings-panel/` directory:

- `geometry.ts`: pure geometry without React, Electron or upstream markup dependencies.
- `dom-adapter.ts`: the single markup adapter. It locates the panel through the control's public `settings.action` slot, `role="dialog"`, `aria-modal`, `aria-labelledby` and the parent presentation layer. An unfamiliar semantic structure leaves the enhancement inactive.
- `index.tsx`: registers an additive settings action and manages its own resize handles through a React portal. Copy and styles have separate namespaces.

The Desktop Client entry adds only the import and `applySettingsPanelEnhancement(ctx)` call. An ordinary browser without the Desktop environment does not activate it. It does not replace SettingsRoot or the settings page, modify `deepseek-harness/`, add vendor patches, or introduce IPC/API endpoints.

Geometry lives only in memory for the current renderer generation and does not change user-settings schemas. Disposal releases pointer capture, listeners and observers, and restores the styles this module owns without reverting style values changed by another module.

If an upstream update changes the settings dialog's semantics, adapt only `dom-adapter.ts`. Keep geometry out of business settings pages and avoid generated CSS class names. Removing the entry call disables the feature without a user-data migration.

## Maintenance verification

`tests/client-settings-panel.spec.ts` covers geometry, semantic matching, preserved button/input interaction, pointer cancellation, viewport bounds and disposal. `tests/client-environment.spec.ts` covers registration boundaries. Keep Stable/Beta behavior aligned through `check:desktop-variants`.

Normal packaging still uses `corepack yarn package:local` at the repository root and preserves the `exe/DSH Desktop.exe` output path.
