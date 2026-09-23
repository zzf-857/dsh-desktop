// Only this explicit target enables fork defaults; ordinary/local builds keep their behavior.
const manifest = require('./package.json')
module.exports = {
  ...manifest.build,
  extends: null,
  extraMetadata: {
    repository: { type: 'git', url: 'https://github.com/zzf-857/dsh-desktop.git' },
    homepage: 'https://github.com/zzf-857/dsh-desktop',
    dshDesktopFork: {
      repository: 'https://github.com/zzf-857/dsh-desktop',
      bundledPlugins: [
        'dsh-workbuddy-connect', '@changfenhuang/dsh-genui', 'open-sea-skin',
        'dshmarket', 'dsh-context', 'dsh-diff-approval', '@agentscope-ai/reme-dsh-plugin',
        'dsh-better-sidebar', '@linxin666/dsh-client-ui-git-graph',
      ],
    },
  },
}
