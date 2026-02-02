/**
 * Field CLI - Cognitive Tool Registry
 * 将 Cognitive Modules 注册为 AI 可调用的工具
 * 支持 OpenAI Function Calling API + 完整策略引擎
 */

import { CognitiveModule } from './types.js';
import { discoverModules, findModule } from './loader/index.js';
import { executeModule } from './runtime/executor.js';
import { LLMClient, ToolDefinition, ToolCall } from '../llm.js';
import {
  PolicyEngine,
  PolicyDecision,
  ApprovalMode,
  createPolicyEngineConfig,
  saveDynamicPolicy,
  type PolicySettings,
  type CheckResult,
} from '../policy/index.js';

// 重新导出策略类型
export { PolicyDecision, ApprovalMode, type CheckResult };

// =============================================================================
// 类型定义
// =============================================================================

export interface CognitiveTool {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, unknown>;
    required: string[];
  };
  module: CognitiveModule;
}

// =============================================================================
// 策略引擎实例
// =============================================================================

let policyEngine: PolicyEngine | null = null;

/**
 * 初始化策略引擎
 */
export async function initPolicyEngine(
  settings?: PolicySettings,
  approvalMode: ApprovalMode = ApprovalMode.DEFAULT,
): Promise<PolicyEngine> {
  const { config, errors } = await createPolicyEngineConfig(
    settings || {},
    approvalMode,
  );
  
  // 打印加载错误
  if (errors.length > 0) {
    console.warn(`[Policy] ${errors.length} errors loading policies:`);
    for (const error of errors) {
      console.warn(`  - ${error.fileName}: ${error.message}`);
    }
  }
  
  policyEngine = new PolicyEngine(config);
  return policyEngine;
}

/**
 * 获取策略引擎（自动初始化）
 */
export async function getPolicyEngine(): Promise<PolicyEngine> {
  if (!policyEngine) {
    return initPolicyEngine();
  }
  return policyEngine;
}

/**
 * 设置审批模式
 */
export function setApprovalMode(mode: ApprovalMode): void {
  if (policyEngine) {
    policyEngine.setApprovalMode(mode);
  }
}

/**
 * 检查工具调用是否被允许（策略引擎版本）
 */
export async function checkToolCallPolicy(toolCall: ToolCall): Promise<CheckResult> {
  const engine = await getPolicyEngine();
  const moduleName = extractModuleName(toolCall.function.name);
  
  // 解析参数
  let args: Record<string, unknown> | undefined;
  try {
    args = JSON.parse(toolCall.function.arguments);
  } catch {
    // 参数无效，传空
  }
  
  return engine.checkCognitiveModule(moduleName, args);
}

/**
 * 添加动态策略规则（用户确认后）
 */
export async function addDynamicAllowRule(
  toolCall: ToolCall,
  persist: boolean = false,
): Promise<void> {
  const engine = await getPolicyEngine();
  const moduleName = extractModuleName(toolCall.function.name);
  const toolName = `cognitive_${moduleName}`;
  
  // 添加到内存中的策略引擎
  engine.addRule({
    toolName,
    decision: PolicyDecision.ALLOW,
    priority: 2.95,  // 用户层级最高优先级
    source: 'Dynamic (Confirmed)',
  });
  
  // 持久化到用户策略目录
  if (persist) {
    await saveDynamicPolicy(toolName, PolicyDecision.ALLOW);
  }
}

// =============================================================================
// 工具发现
// =============================================================================

/**
 * 获取所有可用的 Cognitive Tools
 */
export function getAvailableTools(): CognitiveTool[] {
  const modules = discoverModules();
  return modules.map((module) => moduleToTool(module));
}

/**
 * 将 Module 转换为 Tool 格式
 */
function moduleToTool(module: CognitiveModule): CognitiveTool {
  return {
    name: module.name,
    description: module.manifest.responsibility,
    parameters: {
      type: 'object',
      properties: module.schema.input.properties || {},
      required: module.schema.input.required || [],
    },
    module,
  };
}

// =============================================================================
// OpenAI Function Calling 格式转换
// =============================================================================

/**
 * 将 CognitiveTool 转换为 OpenAI ToolDefinition 格式
 */
export function toOpenAITools(tools: CognitiveTool[]): ToolDefinition[] {
  return tools.map(tool => ({
    type: 'function' as const,
    function: {
      name: `cognitive_${tool.name}`,
      description: tool.description,
      parameters: {
        type: tool.parameters.type,
        properties: tool.parameters.properties,
        required: tool.parameters.required,
      },
    },
  }));
}

/**
 * 从 OpenAI 工具名提取模块名
 */
export function extractModuleName(toolName: string): string {
  // 移除 cognitive_ 前缀
  if (toolName.startsWith('cognitive_')) {
    return toolName.slice(10);
  }
  return toolName;
}

// =============================================================================
// 工具确认（使用策略引擎）
// =============================================================================

import { moduleRequiresConfirmation, getRiskDescription } from './runtime/risk-aggregator.js';

/**
 * 检查工具调用是否需要确认（使用策略引擎）
 */
export async function toolCallRequiresConfirmation(toolCall: ToolCall): Promise<{
  required: boolean;
  reason?: string;
  module?: CognitiveModule;
  policyResult?: CheckResult;
}> {
  const moduleName = extractModuleName(toolCall.function.name);
  const module = findModule(moduleName);
  
  if (!module) {
    return { required: false };
  }
  
  // 使用策略引擎检查
  const policyResult = await checkToolCallPolicy(toolCall);
  
  // ALLOW = 不需要确认
  if (policyResult.decision === PolicyDecision.ALLOW) {
    return { required: false, module, policyResult };
  }
  
  // DENY = 直接拒绝（不需要确认，因为不会执行）
  if (policyResult.decision === PolicyDecision.DENY) {
    return {
      required: true,
      reason: policyResult.rule?.denyMessage || `Policy denied: ${policyResult.rule?.source || 'default policy'}`,
      module,
      policyResult,
    };
  }
  
  // ASK_USER = 需要用户确认
  let reason = `Module "${moduleName}" requires user confirmation`;
  
  if (module.tier === 'exec') {
    reason = `Module "${moduleName}" is tier "exec" (may execute operations)`;
  }
  
  if (policyResult.rule?.source) {
    reason += ` [Policy: ${policyResult.rule.source}]`;
  }
  
  return {
    required: true,
    reason,
    module,
    policyResult,
  };
}

/**
 * 同步版本（兼容旧代码）
 * @deprecated 使用 async 版本
 */
export function toolCallRequiresConfirmationSync(toolCall: ToolCall): {
  required: boolean;
  reason?: string;
  module?: CognitiveModule;
} {
  const moduleName = extractModuleName(toolCall.function.name);
  const module = findModule(moduleName);
  
  if (!module) {
    return { required: false };
  }
  
  // exec tier 需要确认
  if (module.tier === 'exec') {
    return {
      required: true,
      reason: `Module "${moduleName}" is tier "exec" (may execute operations)`,
      module,
    };
  }
  
  return { required: false, module };
}

/**
 * 获取确认提示信息
 */
export function getConfirmationPrompt(
  toolCall: ToolCall,
  module: CognitiveModule
): string {
  const lines: string[] = [];
  
  lines.push(`⚠️  Confirmation Required`);
  lines.push(``);
  lines.push(`Module: ${module.name}`);
  lines.push(`Tier: ${module.tier || 'unknown'}`);
  lines.push(`Responsibility: ${module.responsibility}`);
  
  if (module.excludes && module.excludes.length > 0) {
    lines.push(`Excludes: ${module.excludes.join(', ')}`);
  }
  
  // 显示参数
  try {
    const args = JSON.parse(toolCall.function.arguments);
    const argsPreview = JSON.stringify(args, null, 2);
    if (argsPreview.length > 200) {
      lines.push(`Arguments: ${argsPreview.slice(0, 200)}...`);
    } else {
      lines.push(`Arguments: ${argsPreview}`);
    }
  } catch {
    lines.push(`Arguments: ${toolCall.function.arguments}`);
  }
  
  return lines.join('\n');
}

// =============================================================================
// 工具执行
// =============================================================================

export interface ToolExecutionResult {
  success: boolean;
  result: unknown;
  error?: string;
}

/**
 * 执行 OpenAI 格式的工具调用
 */
export async function executeToolCall(
  toolCall: ToolCall,
  client: LLMClient,
  providerName: string,
): Promise<ToolExecutionResult> {
  // 提取模块名（移除 cognitive_ 前缀）
  const moduleName = extractModuleName(toolCall.function.name);
  const module = findModule(moduleName);
  
  if (!module) {
    return {
      success: false,
      result: null,
      error: `Module '${moduleName}' not found`,
    };
  }

  // 解析参数
  let args: unknown;
  try {
    args = JSON.parse(toolCall.function.arguments);
  } catch {
    return {
      success: false,
      result: null,
      error: `Invalid JSON arguments: ${toolCall.function.arguments}`,
    };
  }

  try {
    const result = await executeModule(module, client, providerName, {
      input: args,
      stream: false,
    });

    return {
      success: result.success,
      result: result.envelope,
      error: result.success ? undefined : (result.envelope as { error?: { message: string } }).error?.message,
    };
  } catch (error) {
    return {
      success: false,
      result: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 格式化工具结果供消息使用
 */
export function formatToolResult(result: ToolExecutionResult): string {
  if (!result.success) {
    return JSON.stringify({
      ok: false,
      error: result.error || 'Unknown error',
    });
  }

  return JSON.stringify(result.result, null, 2);
}

// =============================================================================
// 旧版兼容（prompt-based，可选保留）
// =============================================================================

/**
 * 构建系统提示词（旧版 prompt-based 方式，作为 fallback）
 */
export function buildSystemPromptWithTools(tools: CognitiveTool[]): string {
  if (tools.length === 0) {
    return '';
  }

  const toolDescriptions = tools.map((tool) => {
    const params = Object.entries(tool.parameters.properties)
      .map(([key, value]) => `    - ${key}: ${(value as { type: string }).type}`)
      .join('\n');
    
    return `
### ${tool.name}
${tool.description}
Parameters:
${params || '    (none)'}`;
  }).join('\n');

  return `
## Available Cognitive Modules

You have access to the following cognitive modules. When appropriate, you may use them to help answer the user's request.

${toolDescriptions}

Note: These modules are available as function calls. Use them when the user's request matches their responsibility.
`;
}

/**
 * 旧版：解析文本中的工具调用（prompt-based fallback）
 * @deprecated 使用原生 Function Calling 时不需要
 */
export function parseToolCallFromText(response: string): { name: string; arguments: unknown } | null {
  // 尝试匹配 JSON 代码块中的工具调用
  const jsonMatch = response.match(/```json\s*\n?([\s\S]*?)\n?```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.tool_call && parsed.tool_call.name) {
        return {
          name: parsed.tool_call.name,
          arguments: parsed.tool_call.arguments || {},
        };
      }
    } catch {
      // 不是有效的工具调用
    }
  }

  return null;
}
