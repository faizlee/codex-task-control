# Codex Task Control

一个面向 Codex task 与 subagent 的本地、可审计、带主控审查门的生命周期台账。

GPT-5.6 很擅长主动委派任务，但大量 fan-out 也会让模型消耗、任务归属和完成状态变得不可预测。Codex Task Control 在项目规则之外增加一层用户级控制面，同时保留项目自己的 `AGENTS.md`、SOP、测试和验收标准作为事实源。

> v0.1 是 Windows-first preview。台账完全保存在本地，台账操作不会调用模型 provider。

[English](README.md)

![Codex Task Control 演示](media/codex-task-control-demo.gif)

[MP4 版本](media/codex-task-control-demo.mp4) · 由 [`demo/render_demo.py`](demo/render_demo.py) 在临时隔离台账中运行真实 CLI 流程后生成。

## v0.1 已经解决什么

- 按项目根目录隔离任务注册表。
- 记录直接父任务、controller、模型、reasoning 和生命周期状态。
- 子任务只能查询自己、生成 completion event 或通知失败回执。
- 只有 controller 可以登记、要求返工、接受和集成。
- 拒绝不安全 task ID、旧事件、项目错配、父子环和矛盾状态。
- 使用原子写入和保守的 stale-lock 恢复协议。
- 不覆盖项目自己的规则、命令、测试和验收流程。
- 台账操作零 provider 调用。

## v0.1 不做什么

- 不读取或重置 Codex 额度。
- 不承诺固定节省百分比。
- 不自动创建、停止或 steer Codex task。
- 会记录模型选择，但尚未在 spawn 时强制执行模型路由。
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

## 快速开始

```powershell
$CodexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME '.codex' }
$TaskControl = "$CodexHome\skills\codex-task-control\scripts\task-control.mjs"

node $TaskControl register `
  --project-root "C:\work\example" `
  --controller "controller-1" `
  --thread "worker-1" `
  --parent "controller-1" `
  --title "Audit authentication flow" `
  --model "gpt-5.6-terra" `
  --thinking "low"

node $TaskControl query-self --self "worker-1"
node $TaskControl query-parent --self "worker-1"
node $TaskControl complete --self "worker-1" --candidate-commit "candidate-v1"
```

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
- spawn-time 路由执行。
- fan-out、深度和停止点预算。
- 本地 task dashboard。
- 在数据源可靠时增加 usage-window telemetry。

## License

MIT
