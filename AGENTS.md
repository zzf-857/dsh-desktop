# DSH Desktop repository rules

This repository owns the desktop product around an unmodified DeepSeek Harness checkout.

## Owner's local Windows fork (takes precedence for this checkout)

- The owner explicitly uses this fork for development under `F:\AI\AgentMake\Repo\dsh-desktop`. This project is an authorized exception to the parent workspace's read-only `Repo/` rule.
- All real user state belongs under the root `.local-data/` directory: `dsh-home/` contains sessions, attachments, credentials, settings and profiles; `electron/` contains desktop settings, browser storage and identity. Migration backups and legacy companion files also remain inside `.local-data/`. Never read secrets into logs, fixtures or documentation.
- `.local-data/` and `exe/` must remain ignored by Git. Never force-add, commit, upload, publish or bundle them. Before staging changes, check `git status --short`, `git check-ignore .local-data/dsh-home/settings.yaml "exe/DSH Desktop.exe"`, and ensure `git ls-files .local-data exe` is empty.
- Deploy the Stable desktop to the fixed `exe/DSH Desktop.exe` path with `corepack yarn package:local`. Use `corepack yarn package:local -NoLaunch` when only packaging. This builds and verifies into `dsh-plugin-desktop/dist/win-unpacked`, closes the previous application cleanly, preserves its binaries under `.local-data/build-backups/`, then replaces `exe/`. It never replaces or deletes runtime data. Do not run a generic installer over this checkout or manually edit generated files.
- The adjacent `exe/dsh-local-mode.json` marker enables repository-local data paths before Electron initialization and disables the official update installer. Preserve this marker on every local deployment. Normal upstream builds and packaging smokes without the marker retain upstream behavior.
- Local iteration uses the dependency snapshots already committed in the repository; it is not an upstream public release and does not run `aa:prepare-release`. Public releases still follow the upstream freshness policy below.
- Owner-authorized fork snapshot releases use `corepack yarn dist:win:fork`, preserving the current pinned upstream/AA artifacts instead of updating upstream. Publish only to `zzf-857/dsh-desktop`. This explicit target embeds public plugin code from pinned registry dependencies and fork metadata, seeds only a new Desktop profile, and disables the upstream update installer. It never reads or copies `.local-data/`, `exe/`, account settings or credentials. The ordinary upstream release commands retain their existing freshness policy. Document pinned plugins in `docs/fork-release.md` and scan the source and packaged payload before upload.
- Development and automated tests must use disposable state, never the owner's production `.local-data/dsh-home`. Before changes affecting startup, storage or packaging, run the repository-local storage tests for Stable and Beta, their typechecks, `check:desktop-variants`, and the packaged runtime verification. A real launch using the migrated state is required to verify a migration.
- The C-drive compatibility junctions `%USERPROFILE%/.dsh` and `%APPDATA%/DSH Desktop`, if present, lead to these same runtime directories for existing CLI integrations. Do not treat them as duplicate data or recursively clean them.
- Keep existing Windows shortcut names and target `exe/DSH Desktop.exe`; use `exe/` as the working directory. Future upgrades preserve this path.
- Keep the settings-panel drag/resize feature isolated under `src/client/settings-panel/` in both Desktop packages. Mount it additively through the public `settings.action` slot; do not modify the upstream SettingsRoot or generated CSS selectors. The semantic DOM seam belongs only in `dom-adapter.ts` and must fail inertly when it no longer matches. Preserve reversible cleanup and renderer-local geometry state. See [the settings-panel design boundary](docs/settings-panel.md).
- The local enhanced/extended Workspace row menu adds **打开当前文件夹 / Open current folder**, including right-click access, through `src/client/workspace-folder-menu/` in both Desktop packages. Keep the upstream checkout unchanged. The adapter validates row labels/order against the Workspace controller and fails inertly on a changed DOM shape or remote Host. The context-isolated preload exposes only folder opening; the generation-owned IPC validates its sender and directory, calls Electron `shell.openPath`, and removes its handler on release. An unavailable directory displays a localized error. Run `tests/client-workspace-folder-menu.spec.ts`, `tests/workspace-folder-opener.spec.ts`, and `tests/electron-runtime.spec.ts` for changes to this path.
- The pinned Agents Anywhere client has a separate visible-modal compatibility patch at `patches/agents-anywhere-dialogs@ca022d9286dd.patch`. It excludes hidden/non-modal panels from close and focus-stack decisions, preserving real child-modal protection. Stable/Beta's Yarn dependency references scope it to the exact current AA tarball; neither that tarball nor the upstream checkout is modified. AA release preparation replaces dependency pins with the new artifact, so review its native close logic and drop this patch when upstream fixes it rather than blindly extending the override to newer versions. Local `package:local` builds preserve the installed patch.
- Local Profile package management uses Desktop's bundled pnpm (currently 11.8.0), not an unrelated global pnpm. The `desktop` and `web` Profile `pnpm-workspace.yaml` files pin `storeDir` to the repository's ignored `.local-data/pnpm-store` and `virtualStoreDir` to each Profile's physical F-drive `node_modules/.pnpm` path, including when invoked through the C-drive compatibility junction. Preserve these settings during upgrades. After moving the data root, back up the Profile and regenerate dependencies with the bundled pnpm; never copy stale `node_modules/.modules.yaml` path metadata or rewrite that generated metadata by hand. Market operation errors are recorded in `<profile>/.dsh-market/log.ndjson`.
- Temporary verification scripts/logs belong under `F:\AI\AgentMake\temp\dsh-desktop\`; sensitive migration evidence belongs in the ignored `.local-data/migration/` directory. Do not delete backups without the owner's instruction.

## Prerequisites and setup

- For an already-configured CPA Chat Completions provider, use `corepack yarn provider:cpa:sync --provider <provider-id>` to preview reasoning levels and append `--apply` to import them. Exact provider/model overrides in the ignored `.local-data/cpa-reasoning-overrides.json` take precedence over incomplete CPA catalog metadata and must survive later syncs. Read [the CPA integration guide](docs/cpa-reasoning.md); run `corepack yarn test:cpa-reasoning` after changing the sync logic. Never infer capabilities from model names or log credentials. This is a local settings operation and does not require rebuilding the executable.

- Use Node.js `^22.19.0` or `>=24.0.0` and the root Yarn `4.18.0` release through Corepack.
- Initialize the pinned upstream checkout with `git submodule update --init --recursive`.
- Install root dependencies with `corepack yarn install --immutable`.

## Build, run, and verify

- Start the desktop development workflow with `corepack yarn dev`.
- Build the desktop package with `corepack yarn build`.
- Before each release, run `corepack yarn aa:prepare-release` to build the latest official Agents Anywhere `main` for both Desktop channels. Commit the resulting artifact, provenance, manifests, and lockfile before packaging. Signed macOS releases and root Windows distribution commands verify freshness and installed versions; `DSH_AA_SOURCE_REF=pinned` is no longer supported.
- Run unit tests with `corepack yarn test`.
- Run type checking with `corepack yarn typecheck`.
- Run the complete headless gate with `corepack yarn check`.
- `corepack yarn dev:next` explicitly launches the experimental Next app; `corepack yarn check:next` validates it without a graphical application. Next uses the official published Web frontend and the recorded upstream Desktop presentation, with product capabilities composed as a separate bundle.
- Develop and validate Desktop feature changes in `dsh-plugin-desktop-beta/` first, then synchronize shared changes into `dsh-plugin-desktop/` while preserving declared variant differences. Before committing or pushing shared Desktop changes, run `corepack yarn check:desktop-variants` and validate both affected packages; neither package automatically inherits the other's source edits.
- Run upstream operations through the root scripts, such as `corepack yarn upstream:build`.

- `deepseek-harness/` is a pinned upstream Git submodule. Never edit files inside it from a desktop feature branch.
- `dsh-plugin-desktop/` owns the Cordis Host and Client faces, Electron bootstrap, packaging, and release tests.
- `dsh-desktop-next/` owns the separate experimental Desktop shell, Profiles and recovery, and adapters for the existing AA bridge and Community Market. Next-only changes do not belong in the Stable/Beta variant mirror. Keep its upstream reference and published runtime versions aligned; do not fork the official main frontend.
- `dsh-community-fabric/` owns the community interoperability RFC. Until schemas and a reviewed reference adapter exist, it remains a private documentation scaffold and must not declare loadable DSH or package entry points.
- `dsh-community-market/` owns the community-market shell. Until its runtime is implemented, it remains a private documentation scaffold and must not declare loadable DSH or package entry points.
- The outer repository and all owned packages use the root Yarn release with `nodeLinker: node-modules`.
- The upstream submodule keeps its own pnpm workspace. Run upstream commands through the root `upstream:*` scripts, whose Yarn portable-shell commands enter the submodule before invoking Corepack.
- Compatibility mode must run the upstream default client without overrides. Advanced presentation belongs to desktop-owned client plugins and may replace documented slots or services through profile composition.
- Keep graphical application launch explicit. Builds, typechecks, unit tests, and Loader smokes must remain headless-safe.
- Commit before major changes of direction and keep the submodule pin update separate from desktop behavior changes.
- Keep the repository topology and package-manager split consistent with the [owning Agent Note](.agents/notes/implemented/process/2026-08-15-pinned-upstream-and-isolated-yarn-workspace.md).
