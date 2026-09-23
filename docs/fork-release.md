# Fork snapshot releases

This checkout publishes the owner's custom Windows build only to
<https://github.com/zzf-857/dsh-desktop/releases>. It is an independent fork release,
not an official Anywhere Labs release. No pull request or upstream merge is part of this workflow.

Run `corepack yarn install --immutable`, then `corepack yarn dist:win:fork` from the repository root.
The command runs the Windows package gate and produces the unsigned x64 NSIS installer
`dsh-plugin-desktop/dist/DSH-Desktop-<version>-x64-Setup.exe`.
Keep the checked-in DSH and Agents Anywhere snapshots for this target. The separate
upstream release commands still use their original freshness checks.

The fork metadata disables the upstream automatic update installer. Future fork upgrades
are downloaded manually from this fork's Releases. The installer uses standard per-user
application data; it does not contain the repository-local data marker or any profile data.
The local `package:local` command continues to manage the owner's existing `exe/` deployment.

## Bundled plugins in 2.0.15

These are public registry packages pinned to the versions installed in the owner's Desktop
profile when this release was requested. Their code and production dependencies are shipped
offline. Nothing is copied from the private profile's package directory.

| Package | Version |
| --- | --- |
| @agentscope-ai/reme-dsh-plugin | 0.1.0 |
| @changfenhuang/dsh-genui | 0.11.0 |
| @linxin666/dsh-client-ui-git-graph | 0.3.24 |
| dsh-better-sidebar | 0.19.1 |
| dsh-context | 0.54.4 |
| dsh-diff-approval | 0.28.0 |
| dsh-workbuddy-connect | 0.5.4 |
| dshmarket | 1.55.0 |
| open-sea-skin | 1.2.3 |

A new Desktop profile is seeded with these bundle names. Existing profiles and their
enable/disable choices are preserved. DSH Market remains subject to the existing marketplace
selection in Desktop settings. WorkBuddy uses the Desktop profile's 0.5.4 version; the older
copy in the separate local Web profile is not duplicated in this installer.
API keys, logins, remote service endpoints and personalized plugin settings must be configured
by each recipient. Bundling a plugin does not include an account or a subscription to its service.

The exact selected plugin versions are listed in Yarn's version-scoped preapproval list because
some were installed locally less than 24 hours before release. The general 24-hour age gate
and disabled install scripts remain in force for other new dependencies.

The ReMe npm package declares Apache-2.0 but omits its license file. Its upstream license is
included at `dsh-plugin-desktop/licenses/reme-LICENSE`, sourced from
<https://github.com/agentscope-ai/ReMe/blob/main/LICENSE>.
`THIRD_PARTY_NOTICES.md` records the production dependency licenses.

## Privacy and release checks

- Never stage or upload `.local-data/`, `exe/`, environment files, account settings, sessions,
  cookies, credentials, local databases, migration backups or private certificates.
- Review the explicit staged file list and scan it with redacted secret detection.
- Inspect `dist/win-unpacked/resources/app` for the nine pinned plugin manifests and fork marker;
  scan the full payload for secrets before uploading the installer. Do not include diagnostic logs.
- Upload only the installer and its SHA-256 checksum file. Keep build and audit logs outside Git.
- Validate in disposable state. Do not run an installer smoke over the owner's existing installation.
