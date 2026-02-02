/**
 * Field CLI - Risk Aggregator
 * 根据模块配置计算聚合风险级别
 */

import type { RiskLevel, RiskRule, CognitiveModule } from '../types.js';

// =============================================================================
// Risk Level Mapping
// =============================================================================

const RISK_LEVELS: Record<string, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
};

const RISK_NAMES: RiskLevel[] = ['none', 'low', 'medium', 'high'];

// =============================================================================
// Risk Aggregation Functions
// =============================================================================

/**
 * 从列表计算最大风险
 */
export function aggregateRiskFromList(
  items: Array<Record<string, unknown>>
): RiskLevel {
  if (!items || items.length === 0) {
    return 'medium'; // 默认保守
  }

  let maxLevel = 0;
  for (const item of items) {
    const risk = item['risk'] as string | undefined;
    const level = RISK_LEVELS[risk ?? 'medium'] ?? 2;
    maxLevel = Math.max(maxLevel, level);
  }

  return RISK_NAMES[maxLevel];
}

/**
 * 根据 risk_rule 计算聚合风险
 *
 * 规则:
 * - max_changes_risk: max(data.changes[*].risk) - 默认
 * - max_issues_risk: max(data.issues[*].risk) - 用于 review 类模块
 * - explicit: 返回 "medium"，模块应显式设置风险
 */
export function aggregateRisk(
  data: Record<string, unknown>,
  riskRule: RiskRule = 'max_changes_risk'
): RiskLevel {
  switch (riskRule) {
    case 'max_changes_risk': {
      const changes = data['changes'] as Array<Record<string, unknown>> | undefined;
      return aggregateRiskFromList(changes ?? []);
    }
    case 'max_issues_risk': {
      const issues = data['issues'] as Array<Record<string, unknown>> | undefined;
      return aggregateRiskFromList(issues ?? []);
    }
    case 'explicit':
      // 模块应覆盖，返回默认值
      return 'medium';
    default: {
      // 回退到 changes
      const changes = data['changes'] as Array<Record<string, unknown>> | undefined;
      return aggregateRiskFromList(changes ?? []);
    }
  }
}

/**
 * 根据模块配置计算风险
 */
export function aggregateRiskForModule(
  data: Record<string, unknown>,
  module: CognitiveModule
): RiskLevel {
  return aggregateRisk(data, module.riskRule);
}

// =============================================================================
// Risk Comparison
// =============================================================================

/**
 * 比较两个风险级别
 * 返回: 负数 if a < b, 0 if 相等, 正数 if a > b
 */
export function compareRisk(a: RiskLevel, b: RiskLevel): number {
  return RISK_LEVELS[a] - RISK_LEVELS[b];
}

/**
 * 获取两个风险级别中较高的
 */
export function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return compareRisk(a, b) >= 0 ? a : b;
}

/**
 * 获取两个风险级别中较低的
 */
export function minRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return compareRisk(a, b) <= 0 ? a : b;
}

/**
 * 从多个风险级别中聚合
 */
export function aggregateRiskLevels(risks: RiskLevel[]): RiskLevel {
  if (risks.length === 0) return 'medium';
  return risks.reduce((max, r) => maxRisk(max, r), 'none' as RiskLevel);
}

// =============================================================================
// Risk Review/Confirmation
// =============================================================================

/**
 * 检查风险级别是否需要人工审核
 */
export function requiresReview(risk: RiskLevel): boolean {
  return risk === 'high';
}

/**
 * 检查风险级别是否需要执行前确认
 */
export function requiresConfirmation(risk: RiskLevel): boolean {
  return risk === 'high' || risk === 'medium';
}

/**
 * 检查模块是否需要确认（基于 tier 和 risk）
 */
export function moduleRequiresConfirmation(module: CognitiveModule, risk?: RiskLevel): boolean {
  // exec tier 总是需要确认
  if (module.tier === 'exec') {
    return true;
  }
  
  // 高风险需要确认
  if (risk && requiresReview(risk)) {
    return true;
  }
  
  return false;
}

/**
 * 判断执行结果是否应该升级为人工审核
 * （低置信度、高风险或执行失败）
 */
export function shouldEscalate(
  result: { ok: boolean; meta: { confidence: number; risk: string } },
  confidenceThreshold: number = 0.7
): boolean {
  // 低置信度需要升级
  if (result.meta.confidence < confidenceThreshold) {
    return true;
  }
  
  // 高风险需要升级
  if (result.meta.risk === 'high') {
    return true;
  }
  
  // 执行失败需要升级
  if (!result.ok) {
    return true;
  }
  
  return false;
}

// =============================================================================
// Risk Utilities
// =============================================================================

/**
 * 验证风险级别是否有效
 */
export function isValidRisk(risk: unknown): risk is RiskLevel {
  return typeof risk === 'string' && risk in RISK_LEVELS;
}

/**
 * 将字符串转换为风险级别（带默认值）
 */
export function parseRisk(value: unknown, defaultValue: RiskLevel = 'medium'): RiskLevel {
  if (isValidRisk(value)) {
    return value;
  }
  return defaultValue;
}

/**
 * 获取风险级别的数值（用于排序等）
 */
export function getRiskValue(risk: RiskLevel): number {
  return RISK_LEVELS[risk];
}

/**
 * 获取风险级别的描述
 */
export function getRiskDescription(risk: RiskLevel): string {
  switch (risk) {
    case 'none':
      return 'No risk - safe to execute';
    case 'low':
      return 'Low risk - minor changes';
    case 'medium':
      return 'Medium risk - review recommended';
    case 'high':
      return 'High risk - careful review required';
    default:
      return 'Unknown risk level';
  }
}
