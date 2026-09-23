# 设置面板拖动与缩放

在 Desktop 的设置面板中：

- 拖动顶部标题、空白区域或移动图标，可移动面板。
- 拖动四条边、四个角或右下角的缩放图标，可调整大小。
- 聚焦移动图标或右下角缩放图标后，用方向键微调；按住 Shift 使用更大的步长。
- 双击顶部标题、空白区域或移动图标，恢复初始大小并居中。
- 关闭后再打开会保留当前窗口内的位置和大小；重新启动应用后恢复默认布局。
- 面板限制在可见内容区域内，常规最小尺寸为 720 × 380 CSS 像素；内容区域更小时会收敛到可用尺寸。

## 与上游的边界

功能位于 Stable/Beta 两个包各自的 `src/client/settings-panel/` 目录：

- `geometry.ts`：纯几何计算，不依赖 React、Electron 或上游页面。
- `dom-adapter.ts`：唯一的界面适配层。通过当前控件所在的公开 `settings.action` 插槽，以及 `role="dialog"`、`aria-modal`、`aria-labelledby` 和父级 presentation 层定位面板。没有匹配的语义结构时不激活。
- `index.tsx`：注册一个附加的设置页操作项，并通过 React portal 管理自身的缩放把手。文字和样式由独立命名空间拥有。

Desktop Client 入口只增加模块导入和 `applySettingsPanelEnhancement(ctx)` 调用。普通浏览器未匹配 Desktop 环境时不会激活。没有替换上游 SettingsRoot、覆盖整个设置页、修改 `deepseek-harness/`、增加 vendor 补丁或新增 IPC/API。

尺寸和位置只保存在当前 renderer generation 的内存中，不修改用户设置的数据结构。卸载时会释放指针捕获、事件监听和观察器，并恢复本模块接管的样式；不会回滚其他模块修改的样式值。

后续升级如更改了上游设置弹窗的语义结构，只调整 `dom-adapter.ts`。不要把适配扩散到业务设置页，也不要依赖构建生成的 CSS 类名。关闭功能只需撤掉上述入口调用，不需要迁移用户数据。

## 维护验证

几何、语义结构识别、按钮与输入框不被拖动拦截、指针取消、视口约束和卸载清理的测试位于 `tests/client-settings-panel.spec.ts`。注册边界由 `tests/client-environment.spec.ts` 覆盖。Stable/Beta 的共享实现须通过 `check:desktop-variants` 保持一致。

日常打包仍使用根目录的 `corepack yarn package:local`，输出路径保持 `exe/DSH Desktop.exe`。
