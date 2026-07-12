# Codex Task Control

一个只面向用户可见 Codex task、明确禁止内部 subagent 的本地可审计主控台账。

前沿模型适合规划、判断和审查，但重复机械操作会白白消耗昂贵额度。Codex Task Control 让前沿模型继续主控，禁止不可见的内部 subagent，只把确有额度收益的机械工作交给侧边栏里可检查、可单独选择便宜模型的 Codex task。

> v0.3 是 Windows-first preview。台账完全保存在本地，台账操作不会调用模型 provider。

[English](README.md)

![Codex Task Control 演示](media/codex-task-control-demo.gif)

[MP4 版本](media/codex-task-control-demo.mp4) · 由 [`demo/render_demo.py`](demo/render_demo.py) 在临时隔离台账中运行真实 CLI 流程后生成。

## v0.3 已经解决什么

- 按项目根目录隔离任务注册表。
- 记录直接父任务、controller、执行界面、模型等级、reasoning、额度理由和生命周期状态。
- 拒绝内部 subagent，只接受用户可见的 Codex task/thread。
- 委派必须显式授权，并使用 economical 模型与 low reasoning。
- 自动分配 `01`、`01.1` 这类层级编号，并把生命周期标题同步到 Codex 侧边栏。
- heartbeat 会持续处理事件、审查队列、标题同步和终态归档，全部收口后才删除。
- `integrated` 或 `blocked` 的可见任务按后代优先顺序归档，但完整台账历史永久保留。
- 子任务只能查询自己、生成 completion event 或通知失败回执。
- 只有 controller 可以登记、要求返工、接受和集成。
- 拒绝不安全 task ID、旧事件、项目错配、父子环和矛盾状态。
- 使用原子写入和保守的 stale-lock 恢复协议。
- 不覆盖项目自己的规则、命令、测试和验收流程。
- 台账操作零 provider 调用。

## v0.3 不做什么

- 不读取或重置 Codex 额度。
- 不承诺固定节省百分比。
- 不自动创建、停止或 steer Codex task。
- 无法拦截绕过 skill 直接调用的内部 subagent 工具，因此还必须用 `AGENTS.md` 明确禁止这类调用。
- 当前只对 Windows 项目路径做了完整验证。

## 安装

需要 Node.js 20 或更高版本。

```powershell
git clone https://github.com/faizlee/codex-task-control.git
cd codex-task-control
pwsh -File .\scripts\install.ps1
```

覆盖旧版本：

```powershell
pwsh -File .\scripts\install.ps1 -Force
```

安装器只会把 skill 复制到 `${CODEX_HOME:-~/.codex}/skills/codex-task-control`，不会修改全局 `AGENTS.md`，也不会接触 live task ledger。

然后把 [`examples/AGENTS.md`](examples/AGENTS.md) 中适用的控制规则加入你的用户级或项目级 `AGENTS.md`。

核心规则：绝不使用内部 subagent 或 `spawn_agent`；委派只能创建用户可见的 Codex task/thread。任务必须用语义标题登记、完成真实侧边栏改名并确认 `dispatchAllowed: true`，才能发送工作提示词。可见任务可以并行或嵌套，但每一个都必须独立登记、可供用户检查。

## 快速开始

```powershell
$CodexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME '.codex' }
$TaskControl = "$CodexHome\skills\codex-task-control\scripts\task-control.mjs"

$Registration = node $TaskControl register `
  --project-root "C:\work\example" `
  --controller "controller-1" `
  --thread "worker-1" `
  --parent "controller-1" `
  --title "Audit authentication flow" `
  --model "economical-worker" `
  --thinking "low" `
  --delegation "explicit" `
  --execution-surface "visible_task" `
  --model-class "economical" `
  --quota-reason "Mechanical work is cheaper than using the frontier controller."

$Registration = $Registration | ConvertFrom-Json
```

登记会返回类似 `执行｜01 Audit authentication flow` 的标题，并且初始 `dispatchAllowed: false`。主控必须先使用 Codex 改名工具真实修改侧边栏标题，再执行：

```powershell
node $TaskControl controller-record-title-synced `
  --project-root "C:\work\example" `
  --controller "controller-1" `
  --thread "worker-1" `
  --title $Registration.desiredThreadTitle

node $TaskControl query-self --self "worker-1"
node $TaskControl query-parent --self "worker-1"
node $TaskControl complete --self "worker-1" --candidate-commit "candidate-v1"
```

不能在没有真实改名的情况下伪造同步成功。heartbeat 会执行扫描返回的标题和归档动作；终态后代先归档，父任务后归档，台账历史不会删除。

子任务提交 candidate 后只能停在 `awaiting_review`：

```text
executing -> awaiting_review -> accepted -> integrated
     \----> changes_requested -> awaiting_review
```

完整存储、事件和锁协议见 [`lifecycle.md`](skill/codex-task-control/references/lifecycle.md)。

## 验证

```powershell
npm run check
npm test
```

测试全部运行在临时 `CODEX_HOME`，并会比较测试前后的真实 live ledger，避免测试污染用户环境。

## 后续路线

- 跨平台项目路径规范化。
- 按任务复杂度选择 model/reasoning。
- 扩展当前改名/归档工具之外的 Codex task 界面兼容性。
- 可见任务的 fan-out、深度和停止点预算。
- 本地 task dashboard。
- 在数据源可靠时增加 usage-window telemetry。

## License

MIT
