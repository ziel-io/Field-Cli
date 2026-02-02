/**
 * Field CLI - Overflow Validator
 * 验证 extensions.insights 溢出策略
 */

import type { CognitiveModule, ValidationResult, Insight } from '../types.js';

/**
 * 验证 overflow insights
 */
export function validateOverflow(
  module: CognitiveModule,
  data: Record<string, unknown>
): ValidationResult {
  const errors: string[] = [];
  const extensions = data['extensions'] as { insights?: unknown[] } | undefined;
  const insights = extensions?.insights;

  // 没有 insights，无需验证
  if (!insights || !Array.isArray(insights)) {
    return { valid: true, errors: [] };
  }

  // 检查是否启用 overflow
  if (!module.overflow.enabled && insights.length > 0) {
    errors.push(
      `Overflow not enabled for this module, but ${insights.length} insights provided`
    );
    return { 
      valid: false, 
      errors: errors.map(e => ({ path: '/extensions/insights', message: e }))
    };
  }

  // 检查最大数量
  if (insights.length > module.overflow.max_items) {
    errors.push(
      `Too many insights: ${insights.length} > max ${module.overflow.max_items}`
    );
  }

  // 检查 suggested_mapping 要求
  if (module.overflow.require_suggested_mapping) {
    for (let i = 0; i < insights.length; i++) {
      const insight = insights[i] as Record<string, unknown>;
      if (!insight['suggested_mapping']) {
        errors.push(`Insight[${i}]: missing required suggested_mapping`);
      }
    }
  }

  // 验证每个 insight 的基本结构
  for (let i = 0; i < insights.length; i++) {
    const insight = insights[i] as Record<string, unknown>;
    
    if (typeof insight !== 'object' || insight === null) {
      errors.push(`Insight[${i}]: must be an object`);
      continue;
    }
    
    if (typeof insight['type'] !== 'string') {
      errors.push(`Insight[${i}]: missing or invalid 'type' field`);
    }
    
    if (!('content' in insight)) {
      errors.push(`Insight[${i}]: missing 'content' field`);
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.map(e => ({ path: '/extensions/insights', message: e })),
  };
}

/**
 * 检查是否可以添加更多 insights
 */
export function canAddInsight(
  module: CognitiveModule,
  currentCount: number
): boolean {
  if (!module.overflow.enabled) return false;
  return currentCount < module.overflow.max_items;
}

/**
 * 截断 insights 到最大允许数量
 */
export function truncateInsights(
  insights: Insight[],
  maxItems: number
): Insight[] {
  if (insights.length <= maxItems) {
    return insights;
  }
  return insights.slice(0, maxItems);
}

/**
 * 创建有效的 insight 对象
 */
export function createInsight(
  type: string,
  content: unknown,
  options: {
    suggested_mapping?: string;
    confidence?: number;
  } = {}
): Insight {
  return {
    type,
    content,
    ...options,
  };
}
