# Modern Web Guidance 应用记录

通过 GoogleChrome 官方 Codex marketplace 安装了 `modern-web-guidance@googlechrome`。本次执行官方 CLI 的 `search` 和 `retrieve`，使用 `DISABLE_TELEMETRY=1`。以下设计由实际命中的指南指导。

| 指南 ID | 在 MindSync 的应用 |
| --- | --- |
| `dialog` | 玩法、创建、加入使用原生 `<dialog>` 和 `showModal()`，用标题关联、原生 Esc、关闭和焦点恢复。 |
| `forms`、`ime-safe-enter-submit` | 有明确标签、字段组、约束与回报。词语使用单行输入与原生隐式提交，中文输入法选字无需自定义回车处理。 |
| `responsive-design`、`form-factor-adaptation` | 网格列可收缩，手机使用单列大厅、固定席位的双列词语。输入随页面滚动，避免固定底部被软键盘遮挡。 |
| `motion` | 只在允许动态效果时用透明度和位移动画，状态本身独立于动画。 |
| `dark-mode` | 根元素声明 `color-scheme`，原生表单和页面颜色与系统偏好或用户覆盖一致。 |
| `copy-button` | Clipboard API 加可见状态播报，权限不足时选中原始值供手动复制。 |
| `efficient-background-processing`、`performance` | 将倒计时局部渲染，隐藏时停止显示刷新，前台从绝对截止时间重新计算。首页图示使用 CSS，字体和资源均在本地。 |

升级界面前重新查询，按指南的 Baseline 兼容信息选择合适的标准和降级。
