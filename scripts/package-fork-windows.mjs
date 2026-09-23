/** Build the owner's current pinned snapshot, with public plugins and no local profile data. */
import { resolve } from 'node:path'
import { createWindowsPackageOptions, packageWindowsInstaller } from '../dsh-plugin-desktop/scripts/package-win.ts'

const options = createWindowsPackageOptions()
packageWindowsInstaller({
  ...options,
  run(command, args, cwd, env) {
    options.run(command, args.includes(options.builderCli)
      ? [...args, '--config', resolve(options.desktopRoot, 'electron-builder.fork.cjs')]
      : args, cwd, env)
  },
})
