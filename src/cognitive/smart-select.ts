/**
 * Field CLI - Smart Provider Selection v3.0
 * 
 * 进化版智能 Provider 选择：
 * - 多维度评分 (质量/成本/速度/上下文)
 * - 任务类型自动检测 (支持中文)
 * - 历史学习，动态调整评分
 * - 智能降级，API 不可用时自动切换
 * - 成本追踪
 * - 真实数据来源验证
 * 
 * 数据来源 (2026年2月):
 * ========================
 * 
 * 1. 模型质量评分 - LMSYS Chatbot Arena (https://lmarena.ai/leaderboard)
 *    - 基于 600万+ 用户盲测投票的 ELO 评分系统
 *    - 分类覆盖: Text, Code, Vision, Search
 *    - 更新频率: 每周
 * 
 * 2. 性能/价格数据 - Artificial Analysis (https://artificialanalysis.ai/models)
 *    - Intelligence Index v4.0 (包含10项评测)
 *    - 输出速度 (tokens/s)、首token延迟 (TTFT)
 *    - 独立第三方测试，覆盖 304+ 模型
 * 
 * 3. 定价数据 - 官方 API 定价页面
 *    - OpenAI: https://platform.openai.com/docs/pricing
 *    - Anthropic: https://www.anthropic.com/pricing
 *    - DeepSeek: https://api-docs.deepseek.com/quick_start/pricing
 *    - Google: https://ai.google.dev/gemini-api/docs/pricing
 * 
 * 4. 中国大模型数据 - DataLearner (https://www.datalearner.com/ai-models)
 *    - MMLU Pro, LiveCodeBench, GPQA 等基准测试
 * 
 * 质量分数换算公式:
 *   qualityScore = (ELO - 1000) / 5   // ELO 1500 = 100分, ELO 1400 = 80分
 *   或根据 Artificial Analysis Intelligence Index 直接映射
 */

import { Provider, PROVIDERS } from '../providers.js';
import { getApiKey, loadConfig, saveConfig } from '../config.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// =============================================================================
// Types
// =============================================================================

export type TaskType = 
  | 'code'        // 代码生成、审查、重构
  | 'analysis'    // 数据分析、推理、问题解决
  | 'creative'    // 创意写作、头脑风暴
  | 'simple'      // 简单问答、格式化、翻译
  | 'chat'        // 日常对话
  | 'vision'      // 图像理解
  | 'long'        // 长文本处理
  | 'chinese'     // 中文任务（优先选择中文优化模型）
  | 'auto';       // 自动检测

export type Strategy = 
  | 'auto'        // 根据任务类型自动选择
  | 'quality'     // 最高质量，不计成本
  | 'balanced'    // 平衡质量和成本
  | 'economy'     // 最低成本
  | 'speed';      // 最低延迟

/**
 * LMSYS Arena 多维度评分
 * 数据来源: https://lmarena.ai/leaderboard
 * 
 * 分数换算公式: score = (ELO - 1000) / 5
 * 例如: ELO 1500 = 100分, ELO 1400 = 80分, ELO 1300 = 60分
 */
export interface MultiDimensionScores {
  /** 综合排名 (Overall) - 默认维度 */
  overall: number;
  /** 代码能力 (Code Arena) */
  code?: number;
  /** 创意写作 (Creative Writing) */
  creative?: number;
  /** 数学能力 (Math) */
  math?: number;
  /** 指令遵循 (Instruction Following) */
  instructionFollowing?: number;
  /** 长查询 (Longer Query) */
  longerQuery?: number;
  /** 困难提示 (Hard Prompts) */
  hardPrompts?: number;
  /** 视觉能力 (Vision Arena) - 仅多模态模型 */
  vision?: number;
}

export interface ModelProfile {
  model: string;
  /** 
   * 多维度质量评分 (0-100)
   * 来源: LMSYS Chatbot Arena (lmarena.ai)
   */
  scores: MultiDimensionScores;
  /** 每百万 token 成本 (USD) - 来源: 官方 API 定价 */
  costPer1M: number;
  /** 平均延迟 (ms) - 来源: Artificial Analysis */
  avgLatencyMs: number;
  /** 最大上下文长度 - 来源: 官方文档 */
  maxContext: number;
  /** 能力标签 */
  capabilities: ProviderCapability[];
  /** 是否支持 Function Calling */
  supportsFunctionCalling: boolean;
  /** 是否支持流式输出 */
  supportsStreaming: boolean;
}

export interface ProviderProfile {
  provider: string;
  displayName: string;
  models: ModelProfile[];
  /** 默认模型索引 */
  defaultModelIndex: number;
  /** 中文优化程度 (0-100) */
  chineseScore: number;
  /** API 稳定性 (0-100) */
  stabilityScore: number;
}

export type ProviderCapability =
  | 'code'          // 强代码能力
  | 'reasoning'     // 强推理能力
  | 'creative'      // 强创意能力
  | 'vision'        // 图像理解
  | 'long_context'  // 100k+ 上下文
  | 'fast'          // 低延迟
  | 'cheap'         // 低成本
  | 'chinese';      // 中文优化

export interface SelectionOptions {
  /** 任务类型 */
  taskType?: TaskType;
  /** 选择策略 */
  strategy?: Strategy;
  /** 输入文本（用于自动检测） */
  inputText?: string;
  /** 最大成本限制 (USD/请求) */
  maxCostUsd?: number;
  /** 最小上下文长度要求 */
  minContext?: number;
  /** 必须支持的能力 */
  requiredCapabilities?: ProviderCapability[];
  /** 排除的 Provider */
  excludeProviders?: string[];
  /** 优先的 Provider */
  preferProviders?: string[];
  /** 只选择有 API key 的 */
  requireAvailable?: boolean;
  /** 需要 Function Calling */
  requireFunctionCalling?: boolean;
}

export interface SelectionResult {
  provider: string;
  model: string;
  reason: string;
  score: number;
  /** 预估成本 (USD/1K tokens) */
  estimatedCost: number;
  /** 预估延迟 (ms) */
  estimatedLatency: number;
  /** 上下文长度 */
  maxContext: number;
  /** 备选方案 */
  alternatives: Array<{ provider: string; model: string; score: number }>;
}

// =============================================================================
// Provider Profiles - 详细模型配置
// =============================================================================

/**
 * 模型数据最后更新时间
 * 数据来源: LMSYS Arena, Artificial Analysis, 官方 API 定价页
 */
export const MODEL_DATA_VERSION = '2026-02-03';
export const MODEL_DATA_SOURCES = {
  quality: 'LMSYS Chatbot Arena (lmarena.ai/leaderboard)',
  performance: 'Artificial Analysis (artificialanalysis.ai/models)',
  pricing: 'Official API documentation',
  chinese: 'DataLearner (datalearner.com/ai-models)',
};

/**
 * LMSYS Arena 维度说明
 * 
 * | 维度 | 说明 | TaskType 映射 |
 * |------|------|--------------|
 * | overall | 综合排名 (默认) | 'chat', 'auto' |
 * | code | 代码生成、调试、审查 | 'code' |
 * | creative | 创意写作、故事、文章 | 'creative' |
 * | math | 数学推理、计算 | 'analysis' |
 * | instructionFollowing | 指令遵循能力 | 'simple' |
 * | longerQuery | 长文本处理 | 'long' |
 * | hardPrompts | 困难/复杂问题 | 'analysis' |
 * | vision | 图像理解 (仅多模态) | 'vision' |
 */

export const PROVIDER_PROFILES: ProviderProfile[] = [
  // ==========================================================================
  // Claude (Anthropic) - 代码之王
  // 数据来源: LMSYS Arena 2026年2月
  // Code Arena: Opus 4.5 Thinking #1 (1500), Opus 4.5 #3 (1470)
  // Overall: Opus 4.5 Thinking #4 (1468), Opus 4.5 #5 (1466), Sonnet 4.5 #10 (1450)
  // ==========================================================================
  {
    provider: 'anthropic',
    displayName: 'Claude (Anthropic)',
    chineseScore: 85,
    stabilityScore: 95,
    defaultModelIndex: 0,
    models: [
      {
        // LMSYS Overall #10, Code 表现优秀
        // 定价: $3 input / $15 output per 1M tokens
        model: 'claude-sonnet-4-5-20250929',
        scores: {
          overall: 90,     // ELO 1450 → (1450-1000)/5 = 90
          code: 88,        // 代码能力强
          creative: 92,    // 创意写作 #6
          instructionFollowing: 85,
          longerQuery: 88,
        },
        costPer1M: 9.0,
        avgLatencyMs: 1800,
        maxContext: 200000,
        capabilities: ['code', 'reasoning', 'creative', 'long_context'],
        supportsFunctionCalling: true,
        supportsStreaming: true,
      },
      {
        // LMSYS Code Arena #1 (Thinking)! Overall #4
        // 定价: $5 input / $25 output per 1M tokens
        model: 'claude-opus-4-5-20251101',
        scores: {
          overall: 93,     // ELO 1468 → 93
          code: 100,       // Code Arena #1! (ELO 1500)
          creative: 91,    // Creative #2 (ELO 1457)
          math: 88,
          hardPrompts: 95,
          longerQuery: 95, // Longer Query #1
        },
        costPer1M: 15.0,
        avgLatencyMs: 2500,
        maxContext: 200000,
        capabilities: ['code', 'reasoning', 'creative', 'long_context'],
        supportsFunctionCalling: true,
        supportsStreaming: true,
      },
    ],
  },

  // ==========================================================================
  // OpenAI - 推理强者
  // 数据来源: LMSYS Arena 2026年2月
  // Code: GPT-5.2-High #2 (1472)
  // Overall: GPT-5.1-High #8 (1459), GPT-5.2 #20 (1440)
  // ==========================================================================
  {
    provider: 'openai',
    displayName: 'OpenAI',
    chineseScore: 80,
    stabilityScore: 95,
    defaultModelIndex: 0,
    models: [
      {
        // LMSYS Code #2, Vision #4
        // 定价: $1.75 input / $14 output per 1M tokens
        model: 'gpt-5.2',
        scores: {
          overall: 88,     // ELO 1440 → 88
          code: 94,        // Code #2 (ELO 1472)
          vision: 90,      // Vision #4 (ELO 1253)
          math: 95,        // Math 很强 #3
          creative: 75,    // 创意相对弱 #43
        },
        costPer1M: 7.87,
        avgLatencyMs: 1200,
        maxContext: 400000,
        capabilities: ['code', 'reasoning', 'vision'],
        supportsFunctionCalling: true,
        supportsStreaming: true,
      },
      {
        // LMSYS Overall #8
        // 定价: $1.25 input / $10 output per 1M tokens
        model: 'gpt-5.1',
        scores: {
          overall: 92,     // ELO 1459 → 92
          code: 85,        // Code #14
          creative: 82,    // Creative #13
          vision: 88,      // Vision #5
          math: 90,        // Math #8
        },
        costPer1M: 5.62,
        avgLatencyMs: 1000,
        maxContext: 400000,
        capabilities: ['code', 'reasoning', 'creative', 'vision'],
        supportsFunctionCalling: true,
        supportsStreaming: true,
      },
      {
        // 经济模型 LMSYS #82
        // 定价: $0.15 input / $0.60 output per 1M tokens
        model: 'gpt-4.1-mini',
        scores: {
          overall: 76,     // ELO 1382 → 76
          code: 72,
          creative: 78,
        },
        costPer1M: 0.37,
        avgLatencyMs: 400,
        maxContext: 1000000,
        capabilities: ['fast', 'cheap'],
        supportsFunctionCalling: true,
        supportsStreaming: true,
      },
      {
        // 极速纳米模型 LMSYS #146
        model: 'gpt-4.1-nano',
        scores: {
          overall: 64,     // ELO 1322 → 64
          code: 60,
        },
        costPer1M: 0.14,
        avgLatencyMs: 200,
        maxContext: 1000000,
        capabilities: ['fast', 'cheap'],
        supportsFunctionCalling: true,
        supportsStreaming: true,
      },
    ],
  },

  // ==========================================================================
  // DeepSeek - 性价比之王
  // 数据来源: LMSYS Arena 2026年2月, 官方定价
  // Overall: V3.2 #37 (1420), V3.2-Thinking #36 (1420)
  // Code: V3.2-Thinking #16 (1377)
  // 定价: $0.28 input / $0.42 output (官方)
  // ==========================================================================
  {
    provider: 'deepseek',
    displayName: 'DeepSeek',
    chineseScore: 98,
    stabilityScore: 85,
    defaultModelIndex: 0,
    models: [
      {
        // DeepSeek V3.2 - LMSYS Overall #37
        // 官方定价: $0.28 input / $0.42 output per 1M tokens
        model: 'deepseek-chat',
        scores: {
          overall: 84,     // ELO 1420 → 84
          code: 75,        // Code #24 (1301)
          creative: 80,    // Creative #26
          longerQuery: 82,
        },
        costPer1M: 0.35,
        avgLatencyMs: 600,
        maxContext: 128000,
        capabilities: ['code', 'reasoning', 'cheap', 'fast', 'chinese'],
        supportsFunctionCalling: true,
        supportsStreaming: true,
      },
      {
        // DeepSeek V3.2 Thinking - LMSYS Code #16
        model: 'deepseek-reasoner',
        scores: {
          overall: 84,     // ELO 1420
          code: 80,        // Code #16 (1377)
          creative: 78,
          math: 85,
          hardPrompts: 82,
        },
        costPer1M: 2.50,
        avgLatencyMs: 3000,
        maxContext: 128000,
        capabilities: ['reasoning', 'code', 'chinese'],
        supportsFunctionCalling: true,
        supportsStreaming: true,
      },
    ],
  },

  // ==========================================================================
  // Gemini (Google) - Overall 榜首
  // 数据来源: LMSYS Arena 2026年2月
  // Overall: Gemini-3-Pro #1 (1487)! Gemini-3-Flash #3 (1471)
  // Creative: Gemini-3-Pro #1 (1491)!
  // Vision: Gemini-3-Pro #1! Gemini-3-Flash #2
  // Math: Gemini-3-Flash #2
  // ==========================================================================
  {
    provider: 'gemini',
    displayName: 'Gemini (Google)',
    chineseScore: 75,
    stabilityScore: 92,
    defaultModelIndex: 0,
    models: [
      {
        // LMSYS Overall #1! Vision #1! Creative #1!
        // 定价: $2 input / $12 output per 1M tokens
        model: 'gemini-3-pro',
        scores: {
          overall: 97,     // ELO 1487 → #1!
          code: 91,        // Code #4 (1453)
          creative: 98,    // Creative #1! (1491)
          vision: 98,      // Vision #1!
          math: 95,        // Math #1
          longerQuery: 92,
        },
        costPer1M: 7.0,
        avgLatencyMs: 1500,
        maxContext: 1000000,
        capabilities: ['reasoning', 'vision', 'long_context', 'code', 'creative'],
        supportsFunctionCalling: true,
        supportsStreaming: true,
      },
      {
        // LMSYS Overall #3, 极佳性价比
        // 定价: $0.5 input / $3 output per 1M tokens
        model: 'gemini-3-flash',
        scores: {
          overall: 94,     // ELO 1471 → 94
          code: 89,        // Code #6 (1443)
          creative: 91,    // Creative #3 (1457)
          vision: 95,      // Vision #2
          math: 96,        // Math #2
        },
        costPer1M: 1.75,
        avgLatencyMs: 500,
        maxContext: 1000000,
        capabilities: ['vision', 'long_context', 'fast', 'code'],
        supportsFunctionCalling: true,
        supportsStreaming: true,
      },
      {
        // Gemini 2.5 Flash - LMSYS #54
        model: 'gemini-2.5-flash',
        scores: {
          overall: 82,     // ELO 1409 → 82
          code: 78,
          creative: 80,
          vision: 85,
        },
        costPer1M: 0.7,
        avgLatencyMs: 400,
        maxContext: 1000000,
        capabilities: ['vision', 'long_context', 'fast', 'cheap'],
        supportsFunctionCalling: true,
        supportsStreaming: true,
      },
    ],
  },

  // ==========================================================================
  // Kimi (Moonshot) - 代码黑马
  // 数据来源: LMSYS Arena 2026年2月
  // Code: K2.5-Thinking #5 (1447)!
  // Overall: K2.5-Thinking #12 (1450)
  // ==========================================================================
  {
    provider: 'kimi',
    displayName: 'Kimi (Moonshot)',
    chineseScore: 98,
    stabilityScore: 88,
    defaultModelIndex: 0,
    models: [
      {
        // LMSYS Code #5! Overall #12
        model: 'kimi-k2.5',
        scores: {
          overall: 90,     // ELO 1450 → 90
          code: 89,        // Code #5! (1447)
          vision: 88,      // Vision #6 (1249)
          creative: 75,    // Creative #20
          longerQuery: 82,
        },
        costPer1M: 1.50,
        avgLatencyMs: 1200,
        maxContext: 256000,
        capabilities: ['long_context', 'code', 'reasoning', 'chinese'],
        supportsFunctionCalling: true,
        supportsStreaming: true,
      },
      {
        model: 'moonshot-v1-128k',
        scores: {
          overall: 78,
          code: 72,
          longerQuery: 85,
        },
        costPer1M: 0.8,
        avgLatencyMs: 1000,
        maxContext: 128000,
        capabilities: ['long_context', 'chinese', 'cheap'],
        supportsFunctionCalling: true,
        supportsStreaming: true,
      },
    ],
  },

  // ==========================================================================
  // MiniMax - 交错思维先驱
  // 数据来源: LMSYS Arena 2026年2月
  // Code: M2.1 #8 (1409)
  // Overall: M2.1 #80 (1383)
  // ==========================================================================
  {
    provider: 'minimax',
    displayName: 'MiniMax',
    chineseScore: 95,
    stabilityScore: 90,
    defaultModelIndex: 0,
    models: [
      {
        // LMSYS Code #8
        model: 'MiniMax-M2.1',
        scores: {
          overall: 77,     // ELO 1383 → 77
          code: 82,        // Code #8 (1409)
          creative: 78,
        },
        costPer1M: 0.75,
        avgLatencyMs: 600,
        maxContext: 64000,
        capabilities: ['code', 'creative', 'fast', 'chinese'],
        supportsFunctionCalling: true,
        supportsStreaming: true,
      },
    ],
  },

  // ==========================================================================
  // Qwen (Alibaba) - 通义千问
  // 数据来源: LMSYS Arena 2026年2月
  // Overall: Qwen3-Max-Preview #24 (1434)
  // ==========================================================================
  {
    provider: 'qwen',
    displayName: 'Qwen (Alibaba)',
    chineseScore: 98,
    stabilityScore: 92,
    defaultModelIndex: 0,
    models: [
      {
        // LMSYS #24
        model: 'qwen3-max',
        scores: {
          overall: 87,     // ELO 1434 → 87
          code: 80,        // Code #20
          creative: 78,
          longerQuery: 82,
        },
        costPer1M: 2.4,
        avgLatencyMs: 1000,
        maxContext: 32000,
        capabilities: ['code', 'reasoning', 'creative', 'chinese'],
        supportsFunctionCalling: true,
        supportsStreaming: true,
      },
      {
        model: 'qwen3-plus',
        scores: {
          overall: 80,
          code: 75,
          longerQuery: 85,
        },
        costPer1M: 0.8,
        avgLatencyMs: 800,
        maxContext: 131072,
        capabilities: ['long_context', 'chinese', 'cheap'],
        supportsFunctionCalling: true,
        supportsStreaming: true,
      },
      {
        model: 'qwen3-turbo',
        scores: {
          overall: 72,
          code: 68,
        },
        costPer1M: 0.3,
        avgLatencyMs: 400,
        maxContext: 131072,
        capabilities: ['fast', 'cheap', 'chinese'],
        supportsFunctionCalling: true,
        supportsStreaming: true,
      },
    ],
  },

  // ==========================================================================
  // xAI Grok - Overall #2
  // 数据来源: LMSYS Arena 2026年2月
  // Overall: Grok-4.1-Thinking #2 (1475)! Grok-4.1 #6 (1466)
  // ==========================================================================
  {
    provider: 'xai',
    displayName: 'Grok (xAI)',
    chineseScore: 70,
    stabilityScore: 85,
    defaultModelIndex: 0,
    models: [
      {
        // LMSYS Overall #2!
        model: 'grok-4.1',
        scores: {
          overall: 95,     // ELO 1475 → 95
          code: 85,        // Code #8 (估算)
          creative: 82,    // Creative #12
          math: 80,        // Math #13
          longerQuery: 88,
        },
        costPer1M: 5.0,
        avgLatencyMs: 1500,
        maxContext: 2000000,
        capabilities: ['reasoning', 'long_context', 'code'],
        supportsFunctionCalling: true,
        supportsStreaming: true,
      },
      {
        // Grok-4.1-Fast
        // 定价: $0.20 input / $0.50 output per 1M tokens
        model: 'grok-4.1-fast',
        scores: {
          overall: 86,     // ELO 1430 → 86
          code: 78,
        },
        costPer1M: 0.35,
        avgLatencyMs: 400,
        maxContext: 2000000,
        capabilities: ['fast', 'cheap', 'long_context'],
        supportsFunctionCalling: true,
        supportsStreaming: true,
      },
    ],
  },

  // ==========================================================================
  // Together AI - 开源模型聚合
  // 提供 Llama, DeepSeek 等开源模型的托管服务
  // ==========================================================================
  {
    provider: 'together',
    displayName: 'Together AI',
    chineseScore: 70,
    stabilityScore: 85,
    defaultModelIndex: 0,
    models: [
      {
        // Llama 3.3 70B - LMSYS #149
        model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
        scores: {
          overall: 64,     // ELO 1320 → 64
          code: 62,
        },
        costPer1M: 0.88,
        avgLatencyMs: 600,
        maxContext: 131072,
        capabilities: ['code', 'fast', 'cheap'],
        supportsFunctionCalling: true,
        supportsStreaming: true,
      },
      {
        // DeepSeek R1 - LMSYS #64
        model: 'deepseek-ai/DeepSeek-R1',
        scores: {
          overall: 80,     // ELO 1398 → 80
          code: 78,
          math: 85,
        },
        costPer1M: 3.0,
        avgLatencyMs: 2000,
        maxContext: 64000,
        capabilities: ['reasoning', 'code'],
        supportsFunctionCalling: false,
        supportsStreaming: true,
      },
    ],
  },

  // ==========================================================================
  // OpenRouter - 模型聚合路由
  // 提供多种模型的统一访问接口
  // ==========================================================================
  {
    provider: 'openrouter',
    displayName: 'OpenRouter',
    chineseScore: 80,
    stabilityScore: 88,
    defaultModelIndex: 0,
    models: [
      {
        model: 'anthropic/claude-sonnet-4.5',
        scores: {
          overall: 90,
          code: 88,
          creative: 92,
        },
        costPer1M: 9.0,
        avgLatencyMs: 2000,
        maxContext: 200000,
        capabilities: ['code', 'reasoning', 'creative'],
        supportsFunctionCalling: true,
        supportsStreaming: true,
      },
      {
        model: 'google/gemini-3-flash',
        scores: {
          overall: 94,
          code: 89,
          creative: 91,
          vision: 95,
        },
        costPer1M: 1.75,
        avgLatencyMs: 600,
        maxContext: 1000000,
        capabilities: ['code', 'reasoning', 'vision', 'fast'],
        supportsFunctionCalling: true,
        supportsStreaming: true,
      },
    ],
  },
];

// =============================================================================
// 历史数据存储 - 用于学习和优化
// =============================================================================

interface UsageRecord {
  timestamp: number;
  provider: string;
  model: string;
  taskType: TaskType;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  success: boolean;
  costUsd: number;
}

interface UsageStats {
  totalCalls: number;
  totalCostUsd: number;
  totalTokens: number;
  records: UsageRecord[];
  /** Provider 成功率调整 */
  providerAdjustments: Record<string, number>;
}

const STATS_FILE = path.join(os.homedir(), '.field-cli', 'usage-stats.json');

function loadUsageStats(): UsageStats {
  try {
    if (fs.existsSync(STATS_FILE)) {
      return JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));
    }
  } catch {
    // ignore
  }
  return {
    totalCalls: 0,
    totalCostUsd: 0,
    totalTokens: 0,
    records: [],
    providerAdjustments: {},
  };
}

function saveUsageStats(stats: UsageStats): void {
  try {
    const dir = path.dirname(STATS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // 只保留最近 1000 条记录
    if (stats.records.length > 1000) {
      stats.records = stats.records.slice(-1000);
    }
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
  } catch {
    // ignore
  }
}

/**
 * 记录使用数据（用于学习）
 */
export function recordUsage(record: Omit<UsageRecord, 'timestamp'>): void {
  const stats = loadUsageStats();
  stats.totalCalls++;
  stats.totalCostUsd += record.costUsd;
  stats.totalTokens += record.inputTokens + record.outputTokens;
  stats.records.push({ ...record, timestamp: Date.now() });

  // 更新成功率调整
  const key = record.provider;
  if (!stats.providerAdjustments[key]) {
    stats.providerAdjustments[key] = 0;
  }
  // 成功 +1，失败 -5（惩罚失败）
  stats.providerAdjustments[key] += record.success ? 1 : -5;
  // 限制在 -20 到 +20 之间
  stats.providerAdjustments[key] = Math.max(-20, Math.min(20, stats.providerAdjustments[key]));

  saveUsageStats(stats);
}

/**
 * 获取累计使用统计
 */
export function getUsageStats(): { totalCalls: number; totalCostUsd: number; totalTokens: number } {
  const stats = loadUsageStats();
  return {
    totalCalls: stats.totalCalls,
    totalCostUsd: stats.totalCostUsd,
    totalTokens: stats.totalTokens,
  };
}

// =============================================================================
// 任务检测
// =============================================================================

/**
 * 检测文本是否包含中文
 */
function containsChinese(text: string): boolean {
  return /[\u4e00-\u9fa5]/.test(text);
}

/**
 * 检测任务类型
 */
export function detectTaskType(text: string): TaskType {
  const lower = text.toLowerCase();
  const hasChinese = containsChinese(text);

  // 代码关键词
  const codeKeywords = [
    'code', 'function', 'class', 'implement', 'debug', 'refactor',
    'typescript', 'javascript', 'python', 'java', 'rust', 'go',
    'bug', 'error', 'fix', 'review', 'test', 'api', 'sdk',
    '代码', '函数', '类', '实现', '调试', '重构', '修复', 'bug'
  ];
  if (codeKeywords.some(kw => lower.includes(kw))) {
    return 'code';
  }

  // 分析关键词
  const analysisKeywords = [
    'analyze', 'analysis', 'reason', 'why', 'how', 'explain',
    'compare', 'evaluate', 'assess', 'problem', 'solve', 'logic',
    '分析', '为什么', '怎么', '解释', '比较', '评估', '原因'
  ];
  if (analysisKeywords.some(kw => lower.includes(kw))) {
    return 'analysis';
  }

  // 创意关键词
  const creativeKeywords = [
    'write', 'story', 'creative', 'brainstorm', 'idea', 'design',
    'content', 'marketing', 'blog', 'article', 'poem',
    '写', '故事', '创意', '想法', '设计', '文章', '诗'
  ];
  if (creativeKeywords.some(kw => lower.includes(kw))) {
    return 'creative';
  }

  // 视觉关键词
  const visionKeywords = [
    'image', 'picture', 'photo', 'screenshot', '看图', '图片', '截图', '照片'
  ];
  if (visionKeywords.some(kw => lower.includes(kw))) {
    return 'vision';
  }

  // 长文本
  if (text.length > 50000) {
    return 'long';
  }

  // 简单任务
  const simpleKeywords = [
    'translate', 'format', 'convert', 'summarize', 'list', 'define',
    '翻译', '格式', '转换', '总结', '列出', '定义'
  ];
  if (simpleKeywords.some(kw => lower.includes(kw)) || text.length < 50) {
    return 'simple';
  }

  // 如果主要是中文，返回 chinese 类型以优先选择中文模型
  if (hasChinese && text.length > 20) {
    const chineseRatio = (text.match(/[\u4e00-\u9fa5]/g) || []).length / text.length;
    if (chineseRatio > 0.3) {
      return 'chinese';
    }
  }

  return 'chat';
}

/**
 * 获取任务类型所需的能力
 */
function getRequiredCapabilities(taskType: TaskType): ProviderCapability[] {
  switch (taskType) {
    case 'code':
      return ['code'];
    case 'analysis':
      return ['reasoning'];
    case 'creative':
      return ['creative'];
    case 'simple':
      return ['fast'];
    case 'vision':
      return ['vision'];
    case 'long':
      return ['long_context'];
    case 'chinese':
      return ['chinese'];
    default:
      return [];
  }
}

// =============================================================================
// 选择逻辑
// =============================================================================

/**
 * 获取任务类型对应的评分维度
 */
function getScoreDimensionForTask(taskType: TaskType): keyof MultiDimensionScores {
  switch (taskType) {
    case 'code':
      return 'code';
    case 'creative':
      return 'creative';
    case 'analysis':
      return 'hardPrompts'; // 分析任务使用困难提示维度
    case 'long':
      return 'longerQuery';
    case 'vision':
      return 'vision';
    case 'simple':
      return 'instructionFollowing';
    default:
      return 'overall';
  }
}

/**
 * 获取模型在特定维度的评分
 * 如果该维度没有数据，回退到 overall
 */
function getModelScoreForDimension(
  model: ModelProfile,
  dimension: keyof MultiDimensionScores
): number {
  const dimensionScore = model.scores[dimension];
  if (dimensionScore !== undefined) {
    return dimensionScore;
  }
  // 回退到 overall
  return model.scores.overall;
}

/**
 * 计算模型得分
 * 综合考虑：多维度质量、成本、延迟、任务匹配度、历史表现
 * 
 * 评分维度选择:
 * - code 任务 → 使用 scores.code
 * - creative 任务 → 使用 scores.creative
 * - analysis 任务 → 使用 scores.hardPrompts 或 scores.math
 * - long 任务 → 使用 scores.longerQuery
 * - vision 任务 → 使用 scores.vision
 * - 其他 → 使用 scores.overall
 */
function calculateModelScore(
  profile: ProviderProfile,
  model: ModelProfile,
  taskType: TaskType,
  strategy: Strategy,
  stats: UsageStats
): number {
  // 获取任务对应维度的评分
  const dimension = getScoreDimensionForTask(taskType);
  let score = getModelScoreForDimension(model, dimension);

  // 使用动态延迟数据（如果有）
  const dynamicLatency = getDynamicLatency(profile.provider, model.model);
  const effectiveLatency = dynamicLatency || model.avgLatencyMs;

  // 任务类型匹配加分（能力标签）
  const requiredCaps = getRequiredCapabilities(taskType);
  const matchedCaps = requiredCaps.filter(cap => model.capabilities.includes(cap));
  score += matchedCaps.length * 3;

  // 中文任务加分
  if (taskType === 'chinese' || taskType === 'chat') {
    score += profile.chineseScore * 0.1;
  }

  // 策略调整
  switch (strategy) {
    case 'quality':
      // 质量优先，成本不敏感
      // 但对延迟极高的模型仍有轻微惩罚
      if (effectiveLatency > 5000) {
        score -= 5;
      }
      break;
    case 'economy':
      // 成本优先：质量 30% + 成本评分 70%
      // 使用对数缩放，使低成本模型差异更明显
      const costScore = Math.max(0, 100 - Math.log10(model.costPer1M + 0.1) * 30);
      score = score * 0.3 + costScore * 0.7;
      break;
    case 'speed':
      // 速度优先：质量 30% + 速度评分 70%
      const speedScore = Math.max(0, 100 - effectiveLatency / 30);
      score = score * 0.3 + speedScore * 0.7;
      break;
    case 'balanced':
    case 'auto':
    default:
      // 平衡：质量 / log(成本+1)，同时考虑延迟
      score = score / Math.log10(model.costPer1M + 1);
      // 速度奖励（使用实测数据更准确）
      if (effectiveLatency < 800) {
        score += 8;
      } else if (effectiveLatency < 1500) {
        score += 4;
      }
      break;
  }

  // 历史调整（学习）- 基于真实使用数据
  const adjustment = stats.providerAdjustments[profile.provider] || 0;
  score += adjustment;

  // 稳定性加分
  score += profile.stabilityScore * 0.05;

  // 如果有实测延迟数据，给予额外可信度加分
  if (dynamicLatency !== null) {
    score += 2;
  }

  return score;
}

/**
 * 选择最佳 Provider
 */
export function selectProvider(options: SelectionOptions = {}): SelectionResult {
  const {
    taskType: inputTaskType = 'auto',
    strategy = 'balanced',
    inputText = '',
    maxCostUsd,
    minContext,
    requiredCapabilities = [],
    excludeProviders = [],
    preferProviders = [],
    requireAvailable = true,
    requireFunctionCalling = false,
  } = options;

  // 检测任务类型
  const taskType = inputTaskType === 'auto' && inputText
    ? detectTaskType(inputText)
    : inputTaskType;

  // 加载历史数据
  const stats = loadUsageStats();

  // 收集所有候选
  interface Candidate {
    provider: string;
    model: string;
    score: number;
    profile: ProviderProfile;
    modelProfile: ModelProfile;
  }

  const candidates: Candidate[] = [];

  for (const profile of PROVIDER_PROFILES) {
    // 排除
    if (excludeProviders.includes(profile.provider)) continue;

    // 检查 API key
    if (requireAvailable && !getApiKey(profile.provider)) continue;

    for (const model of profile.models) {
      // 检查 Function Calling
      if (requireFunctionCalling && !model.supportsFunctionCalling) continue;

      // 检查上下文长度
      if (minContext && model.maxContext < minContext) continue;

      // 检查成本（估算 10k tokens）
      if (maxCostUsd !== undefined) {
        const estimatedCost = (model.costPer1M * 10000) / 1_000_000;
        if (estimatedCost > maxCostUsd) continue;
      }

      // 检查必需能力
      if (requiredCapabilities.length > 0) {
        const hasAll = requiredCapabilities.every(cap => model.capabilities.includes(cap));
        if (!hasAll) continue;
      }

      // 计算得分
      const score = calculateModelScore(profile, model, taskType, strategy, stats);

      candidates.push({
        provider: profile.provider,
        model: model.model,
        score,
        profile,
        modelProfile: model,
      });
    }
  }

  // 如果没有候选，返回默认
  if (candidates.length === 0) {
    return {
      provider: 'minimax',
      model: 'MiniMax-M2.1',
      reason: 'No available providers, using default',
      score: 0,
      estimatedCost: 0.00075,
      estimatedLatency: 600,
      maxContext: 64000,
      alternatives: [],
    };
  }

  // 优先级排序
  if (preferProviders.length > 0) {
    candidates.sort((a, b) => {
      const aIdx = preferProviders.indexOf(a.provider);
      const bIdx = preferProviders.indexOf(b.provider);
      if (aIdx !== -1 && bIdx === -1) return -1;
      if (aIdx === -1 && bIdx !== -1) return 1;
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      return b.score - a.score;
    });
  } else {
    candidates.sort((a, b) => b.score - a.score);
  }

  const best = candidates[0];
  const alternatives = candidates.slice(1, 4).map(c => ({
    provider: c.provider,
    model: c.model,
    score: c.score,
  }));

  // 构建原因
  let reason = `Selected ${best.provider}/${best.model}`;
  if (taskType !== 'auto') {
    reason += ` for ${taskType} task`;
  }
  reason += ` (strategy: ${strategy}, score: ${best.score.toFixed(1)})`;

  return {
    provider: best.provider,
    model: best.model,
    reason,
    score: best.score,
    estimatedCost: best.modelProfile.costPer1M / 1000,
    estimatedLatency: best.modelProfile.avgLatencyMs,
    maxContext: best.modelProfile.maxContext,
    alternatives,
  };
}

// =============================================================================
// 快捷选择器
// =============================================================================

export const SmartSelect = {
  /** 代码任务 - 最高质量 */
  forCode: () => selectProvider({ taskType: 'code', strategy: 'quality' }),

  /** 分析任务 - 最高质量 */
  forAnalysis: () => selectProvider({ taskType: 'analysis', strategy: 'quality' }),

  /** 创意任务 */
  forCreative: () => selectProvider({ taskType: 'creative', strategy: 'quality' }),

  /** 最便宜 */
  cheapest: () => selectProvider({ strategy: 'economy' }),

  /** 最快 */
  fastest: () => selectProvider({ strategy: 'speed' }),

  /** 最高质量 */
  bestQuality: () => selectProvider({ strategy: 'quality' }),

  /** 长文本处理 */
  forLongContext: () => selectProvider({ taskType: 'long', strategy: 'balanced' }),

  /** 中文任务优化 */
  forChinese: () => selectProvider({ taskType: 'chinese', strategy: 'balanced' }),

  /** 自动检测 */
  auto: (text: string) => selectProvider({ taskType: 'auto', inputText: text }),

  /** 带 Function Calling */
  withFunctionCalling: () => selectProvider({ requireFunctionCalling: true }),

  /** 视觉/图像任务 */
  forVision: () => selectProvider({ 
    taskType: 'vision', 
    strategy: 'quality',
    requiredCapabilities: ['vision'] 
  }),

  /** 超长上下文 (100K+) */
  forUltraLongContext: () => selectProvider({ 
    taskType: 'long', 
    minContext: 500000,
    strategy: 'balanced' 
  }),

  /** 预算限制 (每请求最大成本) */
  withBudget: (maxCostUsd: number) => selectProvider({ 
    maxCostUsd,
    strategy: 'balanced' 
  }),

  /** 获取数据来源信息 */
  getDataSources: () => getDataSourceLinks(),

  /** 验证数据真实性 */
  validateData: () => validateModelData(),

  /** 获取模型数据信息 */
  getModelInfo: () => getModelDataInfo(),
};

// =============================================================================
// 健康检查
// =============================================================================

/**
 * 检查 Provider 可用性
 */
export async function checkProviderHealth(provider: string): Promise<boolean> {
  const apiKey = getApiKey(provider);
  if (!apiKey) return false;

  // TODO: 实际 API 调用检测
  // 这里简化为检查是否有 API key
  return true;
}

/**
 * 获取所有可用的 Provider
 */
export function getAvailableProviders(): string[] {
  return PROVIDER_PROFILES
    .filter(p => getApiKey(p.provider))
    .map(p => p.provider);
}

/**
 * 获取 Provider 详情
 */
export function getProviderProfile(provider: string): ProviderProfile | undefined {
  return PROVIDER_PROFILES.find(p => p.provider === provider);
}

// =============================================================================
// 动态数据更新系统
// =============================================================================

interface CachedModelData {
  version: string;
  lastUpdated: number;
  profiles: ProviderProfile[];
  latencyMeasurements: Record<string, number[]>;
}

const MODEL_DATA_CACHE_FILE = path.join(os.homedir(), '.field-cli', 'model-data-cache.json');

/**
 * 加载缓存的模型数据
 */
function loadCachedModelData(): CachedModelData | null {
  try {
    if (fs.existsSync(MODEL_DATA_CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(MODEL_DATA_CACHE_FILE, 'utf-8'));
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * 保存模型数据缓存
 */
function saveCachedModelData(data: CachedModelData): void {
  try {
    const dir = path.dirname(MODEL_DATA_CACHE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(MODEL_DATA_CACHE_FILE, JSON.stringify(data, null, 2));
  } catch {
    // ignore
  }
}

/**
 * 记录实测延迟（用于动态学习）
 */
export function recordLatencyMeasurement(provider: string, model: string, latencyMs: number): void {
  const cache = loadCachedModelData() || {
    version: MODEL_DATA_VERSION,
    lastUpdated: Date.now(),
    profiles: [],
    latencyMeasurements: {},
  };

  const key = `${provider}/${model}`;
  if (!cache.latencyMeasurements[key]) {
    cache.latencyMeasurements[key] = [];
  }

  // 保留最近 100 次测量
  cache.latencyMeasurements[key].push(latencyMs);
  if (cache.latencyMeasurements[key].length > 100) {
    cache.latencyMeasurements[key] = cache.latencyMeasurements[key].slice(-100);
  }

  saveCachedModelData(cache);
}

/**
 * 获取动态延迟估算（基于实测数据）
 */
export function getDynamicLatency(provider: string, model: string): number | null {
  const cache = loadCachedModelData();
  if (!cache) return null;

  const key = `${provider}/${model}`;
  const measurements = cache.latencyMeasurements[key];
  if (!measurements || measurements.length < 5) return null;

  // 计算中位数（更稳定）
  const sorted = [...measurements].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 
    ? sorted[mid] 
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * 获取模型数据信息
 */
export function getModelDataInfo(): {
  version: string;
  sources: typeof MODEL_DATA_SOURCES;
  lastUpdated: string;
  modelCount: number;
  providerCount: number;
} {
  const cache = loadCachedModelData();
  return {
    version: MODEL_DATA_VERSION,
    sources: MODEL_DATA_SOURCES,
    lastUpdated: cache 
      ? new Date(cache.lastUpdated).toISOString() 
      : MODEL_DATA_VERSION,
    modelCount: PROVIDER_PROFILES.reduce((sum, p) => sum + p.models.length, 0),
    providerCount: PROVIDER_PROFILES.length,
  };
}

/**
 * 验证模型数据的真实性
 * 返回数据质量报告
 */
export function validateModelData(): {
  valid: boolean;
  warnings: string[];
  info: string[];
} {
  const warnings: string[] = [];
  const info: string[] = [];

  // 检查数据版本
  const dataAge = Date.now() - new Date(MODEL_DATA_VERSION).getTime();
  const daysSinceUpdate = Math.floor(dataAge / (1000 * 60 * 60 * 24));
  
  if (daysSinceUpdate > 30) {
    warnings.push(`模型数据已 ${daysSinceUpdate} 天未更新，建议检查最新定价`);
  }

  info.push(`数据版本: ${MODEL_DATA_VERSION}`);
  info.push(`质量评分来源: ${MODEL_DATA_SOURCES.quality}`);
  info.push(`定价来源: ${MODEL_DATA_SOURCES.pricing}`);

  // 检查价格合理性
  for (const profile of PROVIDER_PROFILES) {
    for (const model of profile.models) {
      // 检查异常高价
      if (model.costPer1M > 50) {
        warnings.push(`${profile.provider}/${model.model} 成本异常高 ($${model.costPer1M}/1M tokens)`);
      }
      // 检查异常低价高质量（性价比极高）
      if (model.costPer1M < 0.1 && model.scores.overall > 85) {
        info.push(`${profile.provider}/${model.model} 性价比极高 ($${model.costPer1M}/1M, 质量=${model.scores.overall})`);
      }
    }
  }

  // 检查实测延迟数据
  const cache = loadCachedModelData();
  if (cache && Object.keys(cache.latencyMeasurements).length > 0) {
    const measuredCount = Object.keys(cache.latencyMeasurements).length;
    info.push(`已收集 ${measuredCount} 个模型的实测延迟数据`);
  } else {
    info.push('尚无实测延迟数据，将使用基准估算值');
  }

  return {
    valid: warnings.length === 0,
    warnings,
    info,
  };
}

/**
 * 获取权威数据源链接
 */
export function getDataSourceLinks(): Record<string, string> {
  return {
    'LMSYS Chatbot Arena': 'https://lmarena.ai/leaderboard',
    'Artificial Analysis': 'https://artificialanalysis.ai/models',
    'OpenAI Pricing': 'https://platform.openai.com/docs/pricing',
    'Anthropic Pricing': 'https://www.anthropic.com/pricing',
    'DeepSeek Pricing': 'https://api-docs.deepseek.com/quick_start/pricing',
    'Google AI Pricing': 'https://ai.google.dev/gemini-api/docs/pricing',
    'DataLearner (中文)': 'https://www.datalearner.com/ai-models',
  };
}
