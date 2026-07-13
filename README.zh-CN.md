# Codex Task Control

一个只面向用户可见 Codex task、明确禁止内部 subagent 的本地可审计主控台账。

前沿模型适合规划、判断和审查，但重复机械操作会白白消耗昂贵额度。Codex Task Control 让前沿模型继续主控，禁止不可见的内部 subagent，只把确有额度收益的机械工作交给侧边栏里可检查、可单独选择便宜模型的 Codex task。

> v0.6.0 是 Windows-first preview。台账、合同校验与路由预检完全保存在本地，不会调用模型 provider。

[English](README.md)

![Codex Task Control 演示](media/codex-task-control-demo.gif)

[MP4 版本](media/codex-task-control-demo.mp4) · 由 [`demo/render_demo.py`](demo/render_demo.py) 在临时隔离台账中运行真实 CLI 流程后生成。

## v0.6.0 已经解决什么

- 按项目根目录隔离任务注册表。
- 记录直接父任务、controller、执行界面、模型等级、reasoning、额度理由和生命周期状态。
- 拒绝内部 subagent，只接受用户可见的 Codex task/thread。
- 委派必须显式授权，并使用 economical 模型与至少 medium reasoning；low 直接 fail closed。
- 架构/合同/错误策略未决、scope 或验收证据不明确时，登记直接 fail closed。
- 新登记必须显式分类为 `control_only`、`implementation` 或 `visual_implementation`；代码、资源、UI、测试和截图 runner 修改必须绑定项目根目录内的版本化 JSON 实施合同。
- 台账保存合同快照与 SHA-256 摘要；worker 改动复用要求、禁建路径、阶段、证据命令、错误策略或视觉预言时，派发、进度或完成都会 fail closed。
- 实施任务必须按顺序提交命名阶段与证据引用；当前轮次所有 required stage 入账前不能 complete。
- completion 与 review 输出明确返回合同版本/摘要以及已完成、缺失阶段；旧台账只读时安全识别为 `legacy_unclassified`，不会因扫描被重写。
- 将 `repeatable` 硬绑定到 `gpt-5.6-luna`，将 `bounded_reasoning` 硬绑定到 `gpt-5.6-terra`；旧模型或错配模型在登记时直接 fail closed。
- 将 `repeatable` 的 reasoning 固定为 medium，允许 `bounded_reasoning` 使用 medium 或 high。
- Sol 主控默认使用 high；边界明确的短主控工作允许 medium；xhigh/max 必须先通过零 provider 调用的 `audit-controller-routing`，并留下明确升级证据。
- 新增只读的活跃任务模型审计；安装器会报告遗留任务，但不会偷改模型身份或台账历史。
- 新增只读的活跃任务 thinking 审计，报告遗留 low 任务但不原地篡改其身份。
- 新增只读的终态归档积压审计，按登记的直接主控分组，生成后代优先的可执行动作，并识别旧版缺失的归档元数据。
- 审查失败先进入停止的“待决”状态，只允许一次明确的机械返工，其他失败由主控收回。
- 自动分配 `01`、`01.1` 这类层级编号，并把生命周期标题同步到 Codex 侧边栏。
- 只有工作提示词真实派发后才启动一个可替换的单次 heartbeat；有效进度入账后续租，完成/审查收口后重排。
- 自适应间隔为 Luna repeatable 3 分钟、Terra medium 5 分钟、Terra high 10 分钟、主控队列 5 分钟；多种义务并存时取最短间隔，旧 generation 触发时直接无操作退出。
- 把可执行清理与历史债务分开：标题/归档工具调用一旦记录失败，仍可审计，但不会反复生成动作或单独维持 heartbeat。
- 只有登记的直接主控可以带原因显式重新排队失败的侧边栏动作。
- `integrated`、`blocked` 或 `reclaimed` 的可见任务按后代优先顺序归档，但完整台账历史永久保留。
- 子任务只能查询自己、生成带阶段证据的 progress event、completion event 或通知失败回执。
- 只有 controller 可以登记、要求返工、接受和集成。
- 拒绝不安全 task ID、旧事件、项目错配、父子环和矛盾状态。
- 使用原子写入和保守的 stale-lock 恢复协议。
- 不覆盖项目自己的规则、命令、测试和验收流程。
- 台账操作零 provider 调用。

## v0.6.0 不做什么

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

安装器会把 skill 复制到 `${CODEX_HOME:-~/.codex}/skills/codex-task-control`，然后执行只读的模型路由、thinking 路由和终态归档积压审计。它不会修改全局 `AGENTS.md`，也不会改写 live task ledger；报告的遗留任务必须由登记的直接主控处理。

然后把 [`examples/AGENTS.md`](examples/AGENTS.md) 中适用的控制规则加入你的用户级或项目级 `AGENTS.md`。

核心规则：绝不使用内部 subagent 或 `spawn_agent`；委派只能创建用户可见的 Codex task/thread。任务必须用语义标题登记、完成真实侧边栏改名并确认 `dispatchAllowed: true`，才能发送工作提示词。可见任务可以并行或嵌套，但每一个都必须独立登记、可供用户检查。

Sol 主控默认使用 high；medium 只用于边界明确的短控制工作。xhigh 必须记录允许的升级触发条件和具体原因；max 只允许用户明确授权或 xhigh 仍未解决的最终仲裁。搜索、格式化、命令、重复测试和机械实现不得使用 Sol xhigh/max。

## 快速开始

实施任务先把 [`implementation-contract.example.json`](skill/codex-task-control/assets/implementation-contract.example.json) 复制到项目内，替换成项目自己的路径、阶段、命令和错误策略，并赋予明确 revision 或 commit。视觉任务可以直接从 [`visual-implementation-contract.example.json`](skill/codex-task-control/assets/visual-implementation-contract.example.json) 开始。控制面只校验结构与摘要身份，具体实施规则仍由项目文档负责。

```powershell
$CodexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME '.codex' }
$TaskControl = "$CodexHome\skills\codex-task-control\scripts\task-control.mjs"

node $TaskControl audit-controller-routing `
  --model "gpt-5.6-sol" `
  --thinking "xhigh" `
  --work-class "hard_arbitration" `
  --escalation-trigger "cross_module_contract_conflict" `
  --reason "多个模块存在互相冲突的合同边界，需要前沿主控仲裁。"

$Registration = node $TaskControl register `
  --project-root "C:\work\example" `
  --controller "controller-1" `
  --thread "worker-1" `
  --parent "controller-1" `
  --title "Audit authentication flow" `
  --model "gpt-5.6-luna" `
  --thinking "medium" `
  --delegation "explicit" `
  --execution-surface "visible_task" `
  --model-class "economical" `
  --quota-reason "Mechanical work is cheaper than using the frontier controller." `
  --work-class "repeatable" `
  --decision-status "resolved" `
  --scope "Only update the named authentication tests." `
  --acceptance "Run the targeted authentication test successfully." `
  --forbidden-decisions "Do not change authentication contracts or error policy." `
  --task-mode "implementation" `
  --implementation-contract "docs/codex-task-contract.json"

$Registration = $Registration | ConvertFrom-Json
```

登记会返回类似 `执行｜01 Audit authentication flow` 的标题，并且初始 `dispatchAllowed: false`。主控必须先使用 Codex 改名工具真实修改侧边栏标题，再执行：

```powershell
node $TaskControl controller-record-title-synced `
  --project-root "C:\work\example" `
  --controller "controller-1" `
  --thread "worker-1" `
  --title $Registration.desiredThreadTitle

# 真实发送工作提示词成功后再执行，并把返回的 heartbeatAction
# 应用为主控唯一的单次 automation。
node $TaskControl controller-record-dispatched `
  --project-root "C:\work\example" `
  --controller "controller-1" `
  --thread "worker-1"

node $TaskControl query-self --self "worker-1"
node $TaskControl query-parent --self "worker-1"
node $TaskControl complete --self "worker-1" --candidate-commit "candidate-v1"
```

不能在没有真实改名的情况下伪造同步成功，也不能在提示词真实发送前登记派发。每次返回的 heartbeatAction 都要替换主控当前的单次 automation；终态后代先归档，父任务后归档，台账历史不会删除。

如果侧边栏改名或归档工具调用失败，只记录一次失败。它会成为不再自动执行的审计债务；没有其他工作时 heartbeat 必须停止。登记的直接主控以后可以有意识地重新排队：

```powershell
node $TaskControl controller-retry-thread-action `
  --project-root "C:\work\example" `
  --controller "controller-1" `
  --thread "worker-1" `
  --action "set_thread_archived" `
  --reason "Codex 归档 API 已恢复，显式重试一次。"
```

子任务到达真实检查点时可以发送进度；主控成功入账后才会续租：

```powershell
node $TaskControl progress `
  --self "worker-1" `
  --summary "已复用并检查现有认证路径。" `
  --stage "reuse-check" `
  --evidence-ref "diff-check=artifacts/diff-check.txt"
node $TaskControl controller-ingest-progress `
  --project-root "C:\work\example" `
  --controller "controller-1" `
  --event "<返回的事件路径>"
```

子任务提交 candidate 后只能停在 `awaiting_review`：

```text
executing -> awaiting_review -> accepted -> integrated
                 \----> changes_requested（已停止 / 待决）
                              \----> 明确派发一次机械返工
                              \----> 主控收回
```

完整存储、事件和锁协议见 [`lifecycle.md`](skill/codex-task-control/references/lifecycle.md)。

审查不通过后，先记录原因，再由主控明确选择返工或收回：

```powershell
node $TaskControl mark-changes-requested `
  --project-root "C:\work\example" --controller "controller-1" --thread "worker-1" `
  --failure-class "mechanical" --reason "A named assertion is missing."

# 只允许第一次机械性失败原 worker 返工：
node $TaskControl controller-dispatch-rework `
  --project-root "C:\work\example" --controller "controller-1" --thread "worker-1"

# 理解/判断/规格失败，或已经返工过一次：
node $TaskControl controller-reclaim `
  --project-root "C:\work\example" --controller "controller-1" --thread "worker-1" `
  --reason "The controller must resolve the contract boundary."
```

## 验证

```powershell
npm run check
npm test
```

测试全部运行在临时 `CODEX_HOME`，并会比较测试前后的真实 live ledger，避免测试污染用户环境。

## 后续路线

- 跨平台项目路径规范化。
- 在 work-class 路由之上增加可选的项目级具体模型名验证。
- 扩展当前改名/归档工具之外的 Codex task 界面兼容性。
- 可见任务的 fan-out、深度和停止点预算。
- 本地 task dashboard。
- 在数据源可靠时增加 usage-window telemetry。

## License

MIT
