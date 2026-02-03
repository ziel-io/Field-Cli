# Field CLI

<p align="center">
  <strong>The First Contract-First AI CLI</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-2.2.0-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/license-Apache--2.0-green.svg" alt="License">
  <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg" alt="Node">
  <img src="https://img.shields.io/badge/typescript-5.3+-blue.svg" alt="TypeScript">
</p>

<p align="center">
  <em>Structured AI. No Surprises.</em>
</p>

---

**Field CLI** is an independent, lightweight AI agent with native support for **Cognitive Modules v2.2** — guaranteeing structured, validated outputs from any LLM.

```
╭───────────────────────────────────────────────────────────────╮
│                                                               │
│  ◆ FIELD    The Contract-First AI CLI                         │
│                                                               │
│  ✓ Structured outputs via Envelope Contract                   │
│  ✓ Multi-provider freedom (10+ LLMs, no lock-in)              │
│  ✓ Production-ready with Schema validation                    │
│                                                               │
│  Send /help for help, /cog for Cognitive commands.            │
│                                                               │
╰───────────────────────────────────────────────────────────────╯
```

---

## Why Field CLI?

Unlike other AI CLIs that sacrifice reliability for speed, Field CLI **guarantees**:

| Feature | Field CLI | Traditional AI CLIs |
|---------|-----------|---------------------|
| **Structured outputs** | ✅ Envelope Contract | ❌ Unpredictable text |
| **Schema validation** | ✅ JSON Schema + Repair Pass | ❌ Hope for the best |
| **Multi-provider** | ✅ 10+ LLMs, switch freely | ❌ Vendor lock-in |
| **Lightweight** | ✅ ~3,000 lines | ❌ 50,000+ lines |
| **Startup time** | ✅ <500ms | ❌ 2-3 seconds |

---

## 目录

- [特性](#特性)
- [安装](#安装)
- [快速开始](#快速开始)
- [支持的 LLM 提供商](#支持的-llm-提供商)
- [命令参考](#命令参考)
- [Cognitive Modules 系统](#cognitive-modules-系统)
  - [什么是 Cognitive Modules](#什么是-cognitive-modules)
  - [模块目录结构](#模块目录结构)
  - [模块规范 v2.2](#模块规范-v22)
  - [安装模块](#安装模块)
  - [自动调用（Function Calling）](#自动调用function-calling)
- [策略引擎](#策略引擎)
  - [策略决策](#策略决策)
  - [审批模式](#审批模式)
  - [自定义策略](#自定义策略)
- [架构设计](#架构设计)
- [配置](#配置)
- [开发](#开发)
- [许可证](#许可证)

---

## 特性

### 📜 Contract-First Architecture
- **Envelope Contract**: 每个模块输出遵循标准化的 `{ meta, data, overflow }` 格式
- **Schema Validation**: JSON Schema 验证输入输出，拒绝不合格数据
- **Repair Pass**: 自动修复轻微格式问题，提高成功率
- **Predictable**: AI 行为可预测、可验证、可审计

### 🤖 Multi-Provider Freedom (10+ LLMs)
- **无厂商锁定**：MiniMax、DeepSeek、Kimi、OpenAI、Claude、Qwen、Gemini、Together AI、OpenRouter
- **统一 API**：所有提供商使用相同的 OpenAI 兼容接口
- **Smart Provider Selection v3.0**：基于 LMSYS Arena 多维度评分自动选择最优模型
- **动态切换**：运行时一键切换，无需重启

### 🧠 Cognitive Modules v2.2
- **模块化 AI 能力**：将 AI 能力封装为可复用模块
- **自动发现**：自动扫描本地和全局模块目录
- **OpenAI Function Calling**：LLM 自动调用认知模块
- **Subagent 支持**：模块间嵌套调用与依赖管理
- **一键安装**：从 GitHub 安装模块

### 🔒 Policy Engine (安全优先)
- **硬停策略**：在执行前拦截危险操作
- **TOML 配置**：可读的策略定义文件
- **多层策略**：系统 → 用户 → 项目 三层覆盖
- **审批模式**：suggest / auto-edit / full-auto / none

### 💻 Modern UI (React + Ink)
- **轻量快速**：<500ms 启动，~3000 行代码
- **实时补全**：输入 `/` 即显示命令菜单
- **流式响应**：支持 SSE 流式输出
- **思考过滤**：自动过滤 `<think>` 标签

### 🔐 Enterprise-Ready
- **Secure Storage**: AES-256-GCM 加密 API Key
- **Version Management**: 智能更新检查
- **Offline Support**: 离线可用（使用缓存数据）

---

## 安装

### 从 npm 安装（推荐）

```bash
npm install -g field-cli-core
```

### 从源码安装

```bash
# 克隆仓库
git clone https://github.com/ziel-io/field-cli.git
cd field-cli

# 安装依赖
npm install

# 构建
npm run build

# 全局链接
npm link
```

### 系统要求

- Node.js >= 18.0.0
- npm >= 9.0.0

---

## 快速开始

### 1. 启动 Field CLI

```bash
field
```

### 2. 选择 LLM 提供商

首次启动时会提示选择提供商并输入 API Key：

```
Select Provider
ESC cancel

❯ MiniMax
  DeepSeek
  Kimi (Moonshot)
  OpenAI
  Claude (Anthropic)
  ...
```

### 3. 开始对话

```
Model: MiniMax-M2.1 (powered by MiniMax)

> 你好，介绍一下你自己
● 你好！我是 Field CLI 的 AI 助手...

> /help
Commands: /help /model /api /cog /stats /history /clear /quit
```

---

## 支持的 LLM 提供商

| 提供商 | 默认模型 | 环境变量 |
|--------|----------|----------|
| **MiniMax** | MiniMax-M2.1 | `MINIMAX_API_KEY` |
| **DeepSeek** | deepseek-chat | `DEEPSEEK_API_KEY` |
| **Kimi (Moonshot)** | kimi-k2.5 | `MOONSHOT_API_KEY` |
| **OpenAI** | gpt-4.1 | `OPENAI_API_KEY` |
| **Claude (Anthropic)** | claude-sonnet-4-5-20250929 | `ANTHROPIC_API_KEY` |
| **Qwen (Alibaba)** | qwen3-235b-a22b | `QWEN_API_KEY` |
| **Gemini (Google)** | gemini-2.5-flash | `GEMINI_API_KEY` |
| **Together AI** | Llama-3.3-70B | `TOGETHER_API_KEY` |
| **OpenRouter** | claude-sonnet-4.5 | `OPENROUTER_API_KEY` |
| **Custom** | 自定义 | `CUSTOM_API_KEY` |

### 配置 API Key

**方式一：环境变量（推荐）**

```bash
export MINIMAX_API_KEY="your-api-key"
export DEEPSEEK_API_KEY="your-api-key"
```

**方式二：运行时输入**

首次选择提供商时会提示输入 API Key，自动保存到 `~/.field-cli/config.json`。

**方式三：使用 /api 命令修改**

```
> /api
API Key for MiniMax
Enter confirm • ESC cancel
```

### Smart Provider Selection v3.0

Field CLI 内置智能 Provider 选择引擎，可根据任务类型、策略偏好自动选择最优模型。

#### 🔍 数据真实性保证

所有模型数据均来自权威第三方来源，**不是编造的**：

| 数据类型 | 数据来源 | 链接 |
|----------|----------|------|
| **模型质量排名** | LMSYS Chatbot Arena | [lmarena.ai/leaderboard](https://lmarena.ai/leaderboard) |
| **性能基准测试** | Artificial Analysis | [artificialanalysis.ai/models](https://artificialanalysis.ai/models) |
| **API 定价** | 官方定价页面 | OpenAI / Anthropic / DeepSeek / Google |
| **中文模型评测** | DataLearner | [datalearner.com/ai-models](https://www.datalearner.com/ai-models) |

**数据更新**: 2026-02-03 | **覆盖模型**: 22+ | **覆盖 Provider**: 10+

#### 🎯 多维度评分系统

**核心创新**: 不再使用单一评分，而是根据任务类型使用 LMSYS Arena 对应维度的评分：

| 任务类型 | 使用维度 | 说明 |
|----------|----------|------|
| `code` | `scores.code` | Code Arena 专项排名 |
| `creative` | `scores.creative` | Creative Writing 排名 |
| `analysis` | `scores.hardPrompts` | 困难提示/复杂推理排名 |
| `vision` | `scores.vision` | Vision Arena 排名 |
| `long` | `scores.longerQuery` | 长查询处理排名 |
| `simple` | `scores.instructionFollowing` | 指令遵循排名 |
| `chat` / `auto` | `scores.overall` | 综合排名 (默认) |

每个模型存储多维度评分：

```typescript
{
  model: 'claude-opus-4-5-20251101',
  scores: {
    overall: 93,       // LMSYS Overall #4 (ELO 1468)
    code: 100,         // Code Arena #1! (ELO 1500) 🏆
    creative: 91,      // Creative Writing #2 (ELO 1457)
    math: 88,
    hardPrompts: 95,
    longerQuery: 95,   // Longer Query #1
  },
  // ...
}
```

#### 2026年最新多维度排名 (LMSYS Arena)

**Overall 综合排名:**
| 排名 | 模型 | ELO | 特点 |
|------|------|-----|------|
| #1 | Gemini-3-Pro | 1487 | 综合、创意、视觉三冠王 |
| #2 | Grok-4.1-Thinking | 1475 | 推理强劲 |
| #3 | Gemini-3-Flash | 1471 | 性价比之王 |
| #4 | Claude Opus 4.5 | 1468 | 代码之王 |

**Code 代码排名:**
| 排名 | 模型 | ELO | 特点 |
|------|------|-----|------|
| #1 | Claude Opus 4.5 Thinking | 1500 | 🏆 代码绝对第一 |
| #2 | GPT-5.2-High | 1472 | |
| #3 | Claude Opus 4.5 | 1470 | |
| #5 | Kimi-K2.5-Thinking | 1447 | 国产代码之星 |

**Creative Writing 创意写作:**
| 排名 | 模型 | ELO |
|------|------|-----|
| #1 | Gemini-3-Pro | 1491 |
| #2 | Claude Opus 4.5 | 1457 |
| #3 | Gemini-3-Flash | 1457 |

#### 2026年最新定价对比

| Provider | 模型 | Input ($/1M) | Output ($/1M) | 性价比 |
|----------|------|-------------|---------------|--------|
| DeepSeek | V3.2 | $0.28 | $0.42 | ⭐⭐⭐⭐⭐ |
| Gemini | 3 Flash | $0.50 | $3.00 | ⭐⭐⭐⭐ |
| OpenAI | GPT-4.1-mini | $0.15 | $0.60 | ⭐⭐⭐⭐ |
| Claude | Sonnet 4.5 | $3.00 | $15.00 | ⭐⭐⭐ |
| Gemini | 3 Pro | $2.00 | $12.00 | ⭐⭐⭐ |
| Claude | Opus 4.5 | $5.00 | $25.00 | ⭐⭐ |

#### 选择策略

| 策略 | 说明 | 公式 |
|------|------|------|
| `quality` | 质量优先 | 按 qualityScore 排序 |
| `economy` | 成本优先 | 质量×0.3 + 成本评分×0.7 |
| `speed` | 速度优先 | 质量×0.3 + 速度评分×0.7 |
| `balanced` | 平衡（默认） | quality / log(cost+1) |

#### 任务类型自动检测

引擎会分析输入文本，自动识别任务类型：

| 类型 | 关键词示例 | 推荐 Provider |
|------|-----------|---------------|
| `code` | function, debug, 代码, 修复 | Claude (Code #1), Gemini |
| `analysis` | analyze, 为什么, 分析 | Gemini-3-Pro, Claude |
| `creative` | write, 故事, 创意 | Claude, GPT-5 |
| `chinese` | 中文内容 (>30%) | DeepSeek, Kimi, Qwen |
| `long` | 文本长度 >50k | Gemini (1M ctx), Grok (2M ctx) |
| `vision` | image, 图片, 截图 | Gemini-3-Pro, GPT-5 |

#### 模型评分配置

每个模型有详细的**多维度**性能档案（基于真实数据）：

```typescript
{
  // DeepSeek V3.2 - LMSYS Arena 多维度评分
  model: 'deepseek-chat',
  scores: {
    overall: 84,           // LMSYS Overall #37 (ELO 1420)
    code: 75,              // Code Arena #24 (ELO 1301)
    creative: 80,          // Creative Writing #26
    longerQuery: 82,
  },
  costPer1M: 0.35,         // 官方: $0.28 in / $0.42 out 加权平均
  avgLatencyMs: 600,       // Artificial Analysis 实测
  maxContext: 128000,      // 官方文档
  capabilities: ['code', 'reasoning', 'cheap', 'fast', 'chinese'],
}
```

**评分换算公式**: `score = (ELO - 1000) / 5`
- ELO 1500 → 100 分
- ELO 1400 → 80 分
- ELO 1300 → 60 分

#### 历史学习 + 动态延迟

引擎会记录每次调用的结果，动态调整 Provider 评分：
- 调用成功：+1 分
- 调用失败：-5 分（惩罚不稳定的 Provider）
- **实测延迟**：自动记录并用于未来选择（比基准数据更准确）

数据保存位置：
- 使用统计：`~/.field-cli/usage-stats.json`
- 模型数据缓存：`~/.field-cli/model-data-cache.json`

#### 数据验证

```typescript
import { SmartSelect } from 'field-cli-core';

// 查看数据来源
SmartSelect.getDataSources();
// → { 'LMSYS Chatbot Arena': 'https://lmarena.ai/leaderboard', ... }

// 验证数据真实性
const validation = SmartSelect.validateData();
console.log(validation.info);     // 数据来源信息
console.log(validation.warnings); // 数据过期警告
```

#### 程序化使用

```typescript
import { selectProvider, SmartSelect } from 'field-cli-core';

// 自动选择
const result = selectProvider({
  taskType: 'auto',
  inputText: '帮我写一个 Python 排序函数',
  strategy: 'balanced',
});
// → { provider: 'deepseek', model: 'deepseek-chat', ... }

// 快捷方法
SmartSelect.forCode();         // 代码任务 → Claude (Code #1)
SmartSelect.forChinese();      // 中文任务 → DeepSeek/Kimi/Qwen
SmartSelect.cheapest();        // 最便宜 → DeepSeek ($0.35/1M)
SmartSelect.fastest();         // 最快 → Gemini-3-Flash
SmartSelect.forLongContext();  // 长文本 → Gemini (1M) / Grok (2M)
SmartSelect.forVision();       // 视觉任务 → Gemini-3-Pro
SmartSelect.withBudget(0.01);  // 限制预算
```

---

## 命令参考

### 基础命令

| 命令 | 别名 | 描述 |
|------|------|------|
| `/help` | `/h`, `/?` | 显示帮助信息 |
| `/model` | `/m` | 切换 LLM 提供商/模型 |
| `/api` | - | 修改当前提供商的 API Key |
| `/clear` | `/c` | 清空对话历史 |
| `/history` | - | 显示对话历史统计 |
| `/tokens` | `/t` | 显示 token 使用统计 |
| `/stats` | `/s` | 显示会话统计 |
| `/quit` | `/q`, `/exit` | 退出 Field CLI |

### Cognitive 命令

| 命令 | 描述 |
|------|------|
| `/cog list` | 列出所有可用模块 |
| `/cog info <name>` | 显示模块详情 |
| `/cog validate <name>` | 验证模块结构 |
| `/cog run <name> [json]` | 手动执行模块 |
| `/cog deps <name>` | 显示模块依赖 |
| `/cog install <url> -m <name>` | 从 GitHub 安装模块 |
| `/cog remove <name>` | 删除模块 |
| `/cog update <name>` | 更新模块 |
| `/cog lock <name>` | 锁定模块版本 |
| `/cog unlock <name>` | 解锁模块版本 |
| `/cog versions <url>` | 列出可用版本 |

### 高级命令

| 命令 | 描述 |
|------|------|
| `/fie auto` | 显示自动调用状态 |
| `/fie auto on` | 启用自动调用模块 |
| `/fie auto off` | 禁用自动调用模块 |
| `/fie tokens` | 显示估算 token 数 |
| `/fie tokens reset` | 重置 token 计数器 |

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+C` | 退出程序 |
| `ESC` | 取消当前操作/关闭菜单 |
| `ESC ESC` | 清空输入框 |
| `Tab` | 补全命令（填入输入框） |
| `Enter` | 执行命令/发送消息 |
| `↑/↓` | 选择命令 |
| `Ctrl+A` | 光标移到开头 |
| `Ctrl+E` | 光标移到末尾 |
| `Ctrl+U` | 清空输入框 |

---

## Cognitive Modules 系统

### 什么是 Cognitive Modules

Cognitive Modules（认知模块）是一种 **Contract-First（契约优先）** 的 AI 能力扩展系统。每个模块定义了：

- **输入 Schema**：明确的输入参数定义
- **输出 Schema**：标准化的 Envelope 响应格式
- **行为约束**：明确的职责边界和排除项
- **策略限制**：网络、文件系统、代码执行等权限

这种设计使得 AI 的行为可预测、可验证、可审计。

### 模块目录结构

Field CLI 按以下顺序扫描模块：

1. **项目目录**：`./cognitive_modules/`
2. **全局目录**：`~/.cognitive/modules/`

每个模块是一个目录，包含：

```
code-reviewer/
├── module.yaml      # 模块清单（必需）
├── schema.json      # 输入输出 Schema（必需）
└── prompt.md        # Prompt 模板（必需）
```

### 模块规范 v2.2

#### module.yaml（模块清单）

```yaml
name: code-reviewer
version: 1.0.0
responsibility: "Review code for bugs, security issues, and best practices"
tier: decision            # exec | decision | exploration

# Schema 严格程度
schema_strictness: medium # strict | medium | relaxed

# 排除项（模块不应该做的事）
excludes:
  - "Do not modify code directly"
  - "Do not execute code"

# Overflow 策略（处理超出 Schema 的信息）
overflow:
  enabled: true
  recoverable: true
  max_items: 10
  require_suggested_mapping: false

# Enum 策略
enums:
  strategy: suggest       # strict | suggest | free

# 操作策略
policies:
  network: deny
  filesystem_write: deny
  side_effects: deny
  code_execution: deny

# 风险规则
risk_rule: max_issues_risk

# Subagent 配置
subagent:
  max_depth: 3
  allowed_modules:
    - code-simplifier
  context: main           # main | fork
```

#### schema.json（输入输出定义）

```json
{
  "$schema": "https://cognitive.field.ai/schema/v2.2",
  "input": {
    "type": "object",
    "required": ["code", "language"],
    "properties": {
      "code": {
        "type": "string",
        "description": "The code to review"
      },
      "language": {
        "type": "string",
        "enum": ["javascript", "typescript", "python", "go", "rust"],
        "description": "Programming language"
      },
      "focus": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Areas to focus on"
      }
    }
  },
  "meta": {
    "type": "object",
    "required": ["confidence", "risk", "explain"],
    "properties": {
      "confidence": {
        "type": "number",
        "minimum": 0,
        "maximum": 1
      },
      "risk": {
        "type": "string",
        "enum": ["none", "low", "medium", "high"]
      },
      "explain": {
        "type": "string",
        "maxLength": 280
      }
    }
  },
  "data": {
    "type": "object",
    "required": ["issues"],
    "properties": {
      "issues": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "severity": { "type": "string", "enum": ["info", "warning", "error", "critical"] },
            "line": { "type": "number" },
            "message": { "type": "string" },
            "suggestion": { "type": "string" }
          }
        }
      },
      "summary": { "type": "string" },
      "score": { "type": "number", "minimum": 0, "maximum": 100 }
    }
  }
}
```

#### prompt.md（Prompt 模板）

```markdown
You are a code review expert. Analyze the provided code for:

1. **Bugs**: Logic errors, null references, race conditions
2. **Security**: Injection, XSS, authentication issues
3. **Performance**: Inefficient algorithms, memory leaks
4. **Best Practices**: Code style, naming conventions, documentation

## Guidelines

- Be specific about line numbers
- Provide actionable suggestions
- Consider the language's idioms
- Focus on: {{focus}}

## Input

```{{language}}
{{code}}
```
```

### 安装模块

**从 GitHub 安装：**

```bash
> /cog install github:ziel-io/cognitive-modules -m code-reviewer
Installing code-reviewer from github:ziel-io/cognitive-modules...
✓ Module installed successfully
```

**指定版本：**

```bash
> /cog install github:ziel-io/cognitive-modules -m code-reviewer --tag v1.2.0
```

**锁定版本（防止更新）：**

```bash
> /cog lock code-reviewer
✓ Module locked at version 1.0.0
```

### 自动调用（Function Calling）

Field CLI 使用 **OpenAI Function Calling API** 让 LLM 自动调用认知模块。

**工作流程：**

1. 用户发送消息
2. Field CLI 将可用模块转换为 OpenAI tools 格式
3. LLM 决定是否需要调用模块
4. 策略引擎检查调用是否被允许
5. 执行模块并返回结果
6. 结果加入对话历史

**示例：**

```
> 帮我审查这段代码有没有问题：function add(a, b) { return a + b }

📦 code-reviewer
✓ Module executed successfully

● 代码审查结果：
  - 建议添加类型检查
  - 建议添加参数验证
  - 总体评分：85/100
```

**控制自动调用：**

```bash
> /fie auto off
Auto-invoke disabled

> /fie auto on
Auto-invoke enabled
```

---

## 策略引擎

策略引擎是一个**硬停机制**，在工具执行前进行安全检查。

### 策略决策

| 决策 | 描述 |
|------|------|
| `ALLOW` | 允许执行，无需确认 |
| `DENY` | 拒绝执行，不可覆盖 |
| `ASK_USER` | 需要用户确认 |

### 审批模式

| 模式 | 描述 |
|------|------|
| `suggest` | 所有操作需要确认（最安全） |
| `auto-edit` | 自动批准编辑操作 |
| `full-auto` | 自动批准所有操作 |
| `none` | 无审批（危险） |

### 自定义策略

策略文件使用 TOML 格式，按优先级加载：

1. **默认策略**：`src/policy/policies/default.toml`
2. **用户策略**：`~/.field-cli/policies/*.toml`
3. **项目策略**：`./.field-cli/policies/*.toml`

**示例策略文件：**

```toml
# ~/.field-cli/policies/custom.toml

[[rules]]
toolName = "code-reviewer"
decision = "allow"
priority = 100
description = "Allow code-reviewer without confirmation"

[[rules]]
toolName = "file-writer__*"
decision = "ask_user"
priority = 50
description = "Require confirmation for file writes"

[[rules]]
toolName = "dangerous-tool"
decision = "deny"
priority = 200
description = "Never allow this tool"
```

---

## 架构设计

```
field-cli/
├── src/
│   ├── ui/                      # React + Ink UI 层
│   │   ├── App.tsx              # 主应用组件
│   │   ├── components/          # UI 组件
│   │   │   ├── InputPrompt.tsx  # 输入框
│   │   │   ├── MessageList.tsx  # 消息列表
│   │   │   └── SuggestionsDisplay.tsx  # 命令建议
│   │   ├── hooks/               # React Hooks
│   │   │   ├── useTextBuffer.ts # 文本缓冲区
│   │   │   └── useSlashCompletion.ts  # 命令补全
│   │   └── commands/            # 命令定义
│   │
│   ├── cognitive/               # Cognitive Modules 核心
│   │   ├── types.ts             # 类型定义 (v2.2)
│   │   ├── loader/              # 模块加载器
│   │   ├── validator/           # Schema 验证器
│   │   │   ├── schema.ts        # JSON Schema 验证
│   │   │   ├── envelope.ts      # Envelope 验证
│   │   │   ├── overflow.ts      # Overflow 策略
│   │   │   └── enum-validator.ts # Enum 策略
│   │   ├── runtime/             # 执行引擎
│   │   │   ├── executor.ts      # 模块执行器
│   │   │   ├── prompt-builder.ts # Prompt 构建
│   │   │   ├── repair.ts        # 响应修复
│   │   │   ├── subagent.ts      # Subagent 系统
│   │   │   ├── metrics.ts       # 指标收集
│   │   │   └── risk-aggregator.ts # 风险聚合
│   │   ├── tool-registry.ts     # Function Calling 注册
│   │   ├── smart-select.ts      # 智能选择
│   │   ├── installer.ts         # 模块安装器
│   │   └── commands.ts          # /cog 命令处理
│   │
│   ├── policy/                  # 策略引擎
│   │   ├── policy-engine.ts     # 策略引擎核心
│   │   ├── config.ts            # 策略配置
│   │   ├── toml-loader.ts       # TOML 加载器
│   │   └── types.ts             # 策略类型
│   │
│   ├── llm.ts                   # LLM 客户端（统一接口）
│   ├── providers.ts             # 提供商配置
│   └── config.ts                # 应用配置
│
├── package.json
├── tsconfig.json
└── README.md
```

### 核心组件

| 组件 | 职责 |
|------|------|
| **LLMClient** | 统一的 LLM 调用接口，支持流式和 Function Calling |
| **CognitiveModule** | 模块加载、验证、执行 |
| **PolicyEngine** | 工具调用的安全检查 |
| **ToolRegistry** | 将模块注册为 OpenAI tools |
| **App (React)** | UI 状态管理和渲染 |

### 数据流

```
用户输入 → InputPrompt → App.handleSubmit
                              ↓
                    是否是命令（/开头）？
                    ↙              ↘
                是                  否
                ↓                   ↓
        handleCommand           sendMessage
                                    ↓
                            LLMClient.chatWithTools
                                    ↓
                            有 tool_calls？
                            ↙          ↘
                          是            否
                          ↓             ↓
                    PolicyEngine   直接显示响应
                          ↓
                    允许/拒绝/询问
                          ↓
                    executeToolCall
                          ↓
                    显示结果 + 更新历史
```

---

## 配置

### 配置文件位置

```
~/.field-cli/
├── config.json        # API Keys 和默认设置
└── policies/          # 用户自定义策略
    └── custom.toml
```

### config.json 结构

```json
{
  "defaultProvider": "minimax",
  "defaultModel": "MiniMax-M2.1",
  "apiKeys": {
    "minimax": "sk-xxx",
    "deepseek": "sk-xxx",
    "kimi": "sk-xxx"
  }
}
```

### 环境变量

| 变量 | 描述 |
|------|------|
| `MINIMAX_API_KEY` | MiniMax API Key |
| `DEEPSEEK_API_KEY` | DeepSeek API Key |
| `MOONSHOT_API_KEY` | Kimi/Moonshot API Key |
| `OPENAI_API_KEY` | OpenAI API Key |
| `ANTHROPIC_API_KEY` | Claude API Key |
| `QWEN_API_KEY` | 通义千问 API Key |
| `GEMINI_API_KEY` | Gemini API Key |
| `TOGETHER_API_KEY` | Together AI API Key |
| `OPENROUTER_API_KEY` | OpenRouter API Key |
| `FIELD_CUSTOM_BASE_URL` | 自定义提供商 URL |
| `FIELD_MODEL` | 自定义模型名称 |

---

## 开发

### 本地开发

```bash
# 开发模式（热重载）
npm run dev

# 构建
npm run build

# 运行构建版本
npm start
```

### 目录说明

```bash
src/ui/          # React + Ink UI（修改 UI 相关）
src/cognitive/   # Cognitive Modules（修改模块系统）
src/policy/      # 策略引擎（修改安全策略）
src/llm.ts       # LLM 客户端（添加新提供商）
src/providers.ts # 提供商配置（添加新模型）
```

### 添加新的 LLM 提供商

1. 编辑 `src/providers.ts`：

```typescript
export const PROVIDERS: Record<string, Provider> = {
  // 添加新提供商
  newprovider: {
    name: 'newprovider',
    displayName: 'New Provider',
    baseUrl: 'https://api.newprovider.com/v1',
    defaultModel: 'model-name',
    envKey: 'NEWPROVIDER_API_KEY',
    models: ['model-1', 'model-2'],
  },
  // ...
};
```

2. 如果 API 格式不兼容 OpenAI，需要在 `src/llm.ts` 添加特殊处理。

### 创建 Cognitive Module

1. 创建模块目录：

```bash
mkdir -p ./cognitive_modules/my-module
cd ./cognitive_modules/my-module
```

2. 创建 `module.yaml`、`schema.json`、`prompt.md`

3. 验证模块：

```bash
> /cog validate my-module
✓ Module validation passed
```

---

## 常见问题

### Q: 为什么 Kimi 模型报 temperature 错误？

A: Kimi K2.5 系列是推理模型，要求 `temperature=1`。Field CLI 已自动处理此问题。

### Q: 如何查看思考过程？

A: 默认过滤 `<think>` 标签。如需查看，可修改 `filterThinkingContent` 函数。

### Q: 模块找不到？

A: 确保模块在以下目录之一：
- `./cognitive_modules/`
- `~/.cognitive/modules/`

### Q: 如何禁用自动调用模块？

A: 使用 `/fie auto off` 命令。

---

## 许可证

Apache License 2.0

---

## 贡献

欢迎提交 Issue 和 Pull Request！

---

## Acknowledgments

- [Ink](https://github.com/vadimdemedes/ink) - React for CLI

While inspired by the architecture of Gemini CLI, Field CLI is a complete rewrite focused on reliability and contract-first AI interactions.

---

<p align="center">
  <strong>Built for production. Not just prototypes.</strong>
</p>

<p align="center">
  Made with ◆ by <a href="https://github.com/ziel-io">ziel-io</a>
</p>
