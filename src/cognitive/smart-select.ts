/**
 * Field CLI - Smart Provider Selection
 * 根据任务类型自动选择最佳 Provider
 */

import { Provider, PROVIDERS } from '../providers.js';
import { getApiKey } from '../config.js';

export type TaskType = 'code' | 'analysis' | 'simple' | 'long' | 'vision' | 'auto';
export type Strategy = 'auto' | 'quality' | 'balanced' | 'economy' | 'speed';

interface ProviderScore {
  provider: string;
  model: string;
  score: number;
  reason: string;
}

interface SelectionOptions {
  taskType?: TaskType;
  inputText?: string;
  strategy?: Strategy;
  maxCostUsd?: number;
  excludeProviders?: string[];
  requireAvailable?: boolean; // 只选择有 API key 的
}

interface SelectionResult {
  provider: string;
  model: string;
  reason: string;
  score: number;
}

// Provider 能力评分 (0-100)
const PROVIDER_CAPABILITIES: Record<string, Record<string, number>> = {
  anthropic: {
    code: 95,
    analysis: 90,
    simple: 80,
    long: 85,
    vision: 70,
    quality: 95,
    speed: 70,
    cost: 40, // 较贵
  },
  openai: {
    code: 85,
    analysis: 95,
    simple: 85,
    long: 80,
    vision: 95,
    quality: 90,
    speed: 80,
    cost: 35, // 贵
  },
  deepseek: {
    code: 85,
    analysis: 80,
    simple: 90,
    long: 75,
    vision: 0,
    quality: 80,
    speed: 85,
    cost: 95, // 便宜
  },
  minimax: {
    code: 80,
    analysis: 85,
    simple: 90,
    long: 85,
    vision: 70,
    quality: 82,
    speed: 90,
    cost: 85,
  },
  kimi: {
    code: 75,
    analysis: 85,
    simple: 85,
    long: 95, // 200K+ context
    vision: 60,
    quality: 80,
    speed: 75,
    cost: 80,
  },
  qwen: {
    code: 88,
    analysis: 88,
    simple: 90,
    long: 90, // qwen-long 支持长文本
    vision: 80,
    quality: 85,
    speed: 85,
    cost: 80,
  },
  gemini: {
    code: 85,
    analysis: 90,
    simple: 90,
    long: 95, // 1M+ context
    vision: 95,
    quality: 88,
    speed: 90,
    cost: 85,
  },
  together: {
    code: 80,
    analysis: 75,
    simple: 85,
    long: 70,
    vision: 60,
    quality: 75,
    speed: 90,
    cost: 90,
  },
  openrouter: {
    code: 90,
    analysis: 90,
    simple: 85,
    long: 85,
    vision: 85,
    quality: 88,
    speed: 75,
    cost: 70,
  },
  custom: {
    code: 70,
    analysis: 70,
    simple: 70,
    long: 70,
    vision: 50,
    quality: 70,
    speed: 70,
    cost: 70,
  },
};

/**
 * 检测任务类型
 */
function detectTaskType(text: string): TaskType {
  const lower = text.toLowerCase();
  
  // 代码任务
  const codeKeywords = ['code', 'function', 'class', 'bug', 'error', 'debug', 'refactor', 'implement', 'fix', 'write', '代码', '函数', '调试', '修复'];
  if (codeKeywords.some((k) => lower.includes(k))) {
    return 'code';
  }
  
  // 长文本任务
  if (text.length > 10000) {
    return 'long';
  }
  
  // 分析任务
  const analysisKeywords = ['analyze', 'review', 'evaluate', 'compare', 'reason', 'why', 'how', '分析', '评估', '比较', '为什么'];
  if (analysisKeywords.some((k) => lower.includes(k))) {
    return 'analysis';
  }
  
  // 视觉任务 (如果提到图片)
  const visionKeywords = ['image', 'picture', 'photo', 'screenshot', '图片', '截图', '照片'];
  if (visionKeywords.some((k) => lower.includes(k))) {
    return 'vision';
  }
  
  // 简单任务
  if (text.length < 100) {
    return 'simple';
  }
  
  return 'analysis';
}

/**
 * 计算 Provider 得分
 */
function calculateScore(
  provider: string,
  taskType: TaskType,
  strategy: Strategy
): number {
  const caps = PROVIDER_CAPABILITIES[provider];
  if (!caps) return 0;

  const taskScore = caps[taskType] || 50;
  
  switch (strategy) {
    case 'quality':
      return taskScore * 0.7 + caps.quality * 0.3;
    case 'economy':
      return taskScore * 0.3 + caps.cost * 0.7;
    case 'speed':
      return taskScore * 0.3 + caps.speed * 0.7;
    case 'balanced':
    case 'auto':
    default:
      return taskScore * 0.5 + caps.quality * 0.25 + caps.cost * 0.15 + caps.speed * 0.1;
  }
}

/**
 * 选择最佳 Provider
 */
export function selectProvider(options: SelectionOptions = {}): SelectionResult {
  const {
    taskType: inputTaskType,
    inputText = '',
    strategy = 'balanced',
    excludeProviders = [],
    requireAvailable = true,
  } = options;

  // 检测或使用指定的任务类型
  const taskType = inputTaskType === 'auto' || !inputTaskType
    ? detectTaskType(inputText)
    : inputTaskType;

  // 计算每个 Provider 的得分
  const scores: ProviderScore[] = [];

  for (const [name, provider] of Object.entries(PROVIDERS)) {
    // 排除指定的 Provider
    if (excludeProviders.includes(name)) continue;

    // 检查是否有 API key
    if (requireAvailable && !getApiKey(name)) continue;

    const score = calculateScore(name, taskType, strategy);
    
    scores.push({
      provider: name,
      model: provider.defaultModel,
      score,
      reason: `${taskType} task, ${strategy} strategy`,
    });
  }

  // 排序
  scores.sort((a, b) => b.score - a.score);

  if (scores.length === 0) {
    // 默认 MiniMax
    return {
      provider: 'minimax',
      model: 'MiniMax-M2.1',
      reason: 'Default fallback (no available providers)',
      score: 0,
    };
  }

  const best = scores[0];
  return {
    provider: best.provider,
    model: best.model,
    reason: `Selected ${best.provider}/${best.model} for ${taskType} task (strategy: ${strategy}, score: ${best.score.toFixed(0)})`,
    score: best.score,
  };
}

/**
 * 快捷选择器
 */
export const SmartSelect = {
  /**
   * 最适合代码任务
   */
  forCode(): SelectionResult {
    return selectProvider({ taskType: 'code', strategy: 'quality' });
  },

  /**
   * 最适合分析任务
   */
  forAnalysis(): SelectionResult {
    return selectProvider({ taskType: 'analysis', strategy: 'quality' });
  },

  /**
   * 最便宜
   */
  cheapest(): SelectionResult {
    return selectProvider({ strategy: 'economy' });
  },

  /**
   * 最快
   */
  fastest(): SelectionResult {
    return selectProvider({ strategy: 'speed' });
  },

  /**
   * 最高质量
   */
  bestQuality(): SelectionResult {
    return selectProvider({ strategy: 'quality' });
  },

  /**
   * 长文本处理
   */
  forLongContext(): SelectionResult {
    return selectProvider({ taskType: 'long', strategy: 'quality' });
  },
};
