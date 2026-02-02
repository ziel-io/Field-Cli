# Field CLI

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/license-Apache--2.0-green.svg" alt="License">
  <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg" alt="Node">
  <img src="https://img.shields.io/badge/typescript-5.3+-blue.svg" alt="TypeScript">
</p>

**Field CLI** 是一个功能强大的 AI 命令行助手，原生支持 **Cognitive Modules（认知模块）** 系统。它提供了一个统一的接口来与多种大语言模型（LLM）进行交互，并支持通过 OpenAI Function Calling API 自动调用认知模块。

```
╭───────────────────────────────────────────────────────────────╮
│                                                               │
│  ██████╗   Welcome to Field CLI!                              │
│  █ ■■ █    The AI-powered coding assistant with               │
│  ██████╝   native Cognitive Modules support.                  │
│                                                               │
│  Send /help for help, /cog for Cognitive commands.            │
│                                                               │
╰───────────────────────────────────────────────────────────────╯
```

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

### 🤖 多模型支持
- **10+ LLM 提供商**：MiniMax、DeepSeek、Kimi、OpenAI、Claude、Qwen、Gemini、Together AI、OpenRouter 等
- **统一 API**：所有提供商使用相同的 OpenAI 兼容接口
- **推理模型优化**：自动检测并配置推理模型（如 Kimi K2.5、DeepSeek Reasoner）

### 🧠 Cognitive Modules（认知模块）
- **Contract-First 设计**：基于 Schema 的输入输出验证
- **自动发现**：自动扫描本地和全局模块目录
- **OpenAI Function Calling**：LLM 可自动调用认知模块
- **Subagent 支持**：模块间嵌套调用与依赖管理
- **GitHub 安装**：一键从 GitHub 安装模块

### 🔒 策略引擎（Policy Engine）
- **硬停策略**：在执行前拦截危险操作
- **TOML 配置**：可读的策略定义文件
- **多层策略**：系统 → 用户 → 项目 三层策略覆盖
- **审批模式**：suggest / auto-edit / full-auto / none

### 💻 现代化 UI
- **React + Ink**：基于 React 的终端 UI 框架
- **实时命令补全**：输入 `/` 即显示命令菜单
- **流式响应**：支持 SSE 流式输出
- **思考过程过滤**：自动过滤 `<think>` 标签内容

---

## 安装

### 从 npm 安装（推荐）

```bash
npm install -g @anthropic-field/cli
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

## 致谢

- [Ink](https://github.com/vadimdemedes/ink) - React for CLI
- [gemini-cli-cognitive](https://github.com/anthropics/gemini-cli-cognitive) - Cognitive Modules 灵感来源

---

**Made with ❤️ by ziel-io**
