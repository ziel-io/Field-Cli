/**
 * Field CLI - Policy Engine
 * 策略引擎核心 - 与 gemini-cli-cognitive 完全一致
 */

import {
  PolicyDecision,
  ApprovalMode,
  type PolicyEngineConfig,
  type PolicyRule,
  type CheckResult,
  type ToolCall,
} from './types.js';
import { stableStringify } from './stable-stringify.js';

/**
 * 检查规则是否匹配
 */
function ruleMatches(
  rule: PolicyRule,
  toolCall: ToolCall,
  stringifiedArgs: string | undefined,
  currentApprovalMode: ApprovalMode,
): boolean {
  // 检查审批模式
  if (rule.modes && rule.modes.length > 0) {
    if (!rule.modes.includes(currentApprovalMode)) {
      return false;
    }
  }

  // 检查工具名称
  if (rule.toolName) {
    // 支持通配符模式: "serverName__*" 匹配 "serverName__anyTool"
    if (rule.toolName.endsWith('__*')) {
      const prefix = rule.toolName.slice(0, -3);
      if (!toolCall.name || !toolCall.name.startsWith(prefix + '__')) {
        return false;
      }
    } else if (toolCall.name !== rule.toolName) {
      return false;
    }
  }

  // 检查参数模式
  if (rule.argsPattern) {
    if (!toolCall.args) {
      return false;
    }
    if (
      stringifiedArgs === undefined ||
      !rule.argsPattern.test(stringifiedArgs)
    ) {
      return false;
    }
  }

  return true;
}

/**
 * 策略引擎类
 */
export class PolicyEngine {
  private rules: PolicyRule[];
  private readonly defaultDecision: PolicyDecision;
  private readonly nonInteractive: boolean;
  private approvalMode: ApprovalMode;

  constructor(config: PolicyEngineConfig = {}) {
    // 按优先级排序（高优先级在前）
    this.rules = (config.rules ?? []).sort(
      (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
    );
    this.defaultDecision = config.defaultDecision ?? PolicyDecision.ASK_USER;
    this.nonInteractive = config.nonInteractive ?? false;
    this.approvalMode = config.approvalMode ?? ApprovalMode.DEFAULT;
  }

  /**
   * 设置审批模式
   */
  setApprovalMode(mode: ApprovalMode): void {
    this.approvalMode = mode;
  }

  /**
   * 获取审批模式
   */
  getApprovalMode(): ApprovalMode {
    return this.approvalMode;
  }

  /**
   * 检查工具调用是否被允许
   */
  async check(toolCall: ToolCall): Promise<CheckResult> {
    let stringifiedArgs: string | undefined;

    // 仅在需要时计算序列化参数
    if (toolCall.args && this.rules.some((rule) => rule.argsPattern)) {
      stringifiedArgs = stableStringify(toolCall.args);
    }

    // 查找第一个匹配的规则
    for (const rule of this.rules) {
      if (ruleMatches(rule, toolCall, stringifiedArgs, this.approvalMode)) {
        return {
          decision: this.applyNonInteractiveMode(rule.decision),
          rule,
        };
      }
    }

    // 没有规则匹配，使用默认决定
    return {
      decision: this.applyNonInteractiveMode(this.defaultDecision),
    };
  }

  /**
   * 检查认知模块调用
   */
  async checkCognitiveModule(
    moduleName: string,
    args?: Record<string, unknown>,
  ): Promise<CheckResult> {
    // 使用 cognitive_ 前缀
    const toolName = `cognitive_${moduleName}`;
    return this.check({ name: toolName, args });
  }

  /**
   * 添加规则
   */
  addRule(rule: PolicyRule): void {
    this.rules.push(rule);
    this.rules.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  /**
   * 移除指定工具的规则
   */
  removeRulesForTool(toolName: string, source?: string): void {
    this.rules = this.rules.filter(
      (rule) =>
        rule.toolName !== toolName ||
        (source !== undefined && rule.source !== source),
    );
  }

  /**
   * 获取所有规则
   */
  getRules(): readonly PolicyRule[] {
    return this.rules;
  }

  /**
   * 检查是否存在指定工具的规则
   */
  hasRuleForTool(toolName: string, ignoreDynamic = false): boolean {
    return this.rules.some(
      (rule) =>
        rule.toolName === toolName &&
        (!ignoreDynamic || rule.source !== 'Dynamic (Confirmed)'),
    );
  }

  /**
   * 应用非交互模式
   */
  private applyNonInteractiveMode(decision: PolicyDecision): PolicyDecision {
    if (this.nonInteractive && decision === PolicyDecision.ASK_USER) {
      return PolicyDecision.DENY;
    }
    return decision;
  }
}
