/**
 * Field CLI - Subagent Orchestrator
 * 模块间调用编排，支持依赖分析和并行执行（完整版）
 */

import {
  CognitiveModule,
  Envelope,
  SubagentCall,
  SubagentResult,
  SubagentContext,
  ExecutionOptions,
} from '../types.js';
import { findModule } from '../loader/index.js';
import { executeModule } from './executor.js';
import { LLMClient } from '../../llm.js';

const MAX_DEPTH = 5;

interface CallNode {
  call: SubagentCall;
  dependencies: string[]; // 依赖的其他调用的 moduleName
}

// =============================================================================
// Context Management
// =============================================================================

/**
 * 创建新的根上下文
 */
export function createContext(maxDepth: number = MAX_DEPTH): SubagentContext {
  return {
    parentId: null,
    depth: 0,
    maxDepth,
    results: {},
    isolated: false,
  };
}

/**
 * Fork 上下文（隔离 - 不继承结果）
 */
export function forkContext(
  ctx: SubagentContext,
  moduleName: string
): SubagentContext {
  return {
    parentId: moduleName,
    depth: ctx.depth + 1,
    maxDepth: ctx.maxDepth,
    results: {},  // 不继承结果
    isolated: true,
  };
}

/**
 * Extend 上下文（共享 - 继承结果）
 */
export function extendContext(
  ctx: SubagentContext,
  moduleName: string
): SubagentContext {
  return {
    parentId: moduleName,
    depth: ctx.depth + 1,
    maxDepth: ctx.maxDepth,
    results: { ...ctx.results },  // 继承结果
    isolated: false,
  };
}

// =============================================================================
// Result Substitution
// =============================================================================

/**
 * 将 @call 指令替换为其结果
 */
export function substituteCallResults(
  text: string,
  callResults: Record<string, unknown>
): string {
  let result = text;

  for (const [callStr, callResult] of Object.entries(callResults)) {
    const resultStr =
      typeof callResult === 'object'
        ? JSON.stringify(callResult, null, 2)
        : String(callResult);

    result = result.replace(callStr, `[Result from ${callStr}]:\n${resultStr}`);
  }

  return result;
}

/**
 * 检查调用是否没有依赖（可以完全并行）
 */
export function hasNoDependencies(calls: SubagentCall[], fullText: string): boolean {
  if (calls.length <= 1) return true;
  
  const nodes = analyzeDependencies(fullText, calls);
  const batches = topologicalSort(nodes);
  // 如果所有调用在一个批次中，它们是独立的
  return batches.length === 1;
}

/**
 * 解析 prompt 中的 @call 指令
 */
export function parseSubagentCalls(prompt: string): SubagentCall[] {
  const calls: SubagentCall[] = [];
  
  // 匹配 @call:module-name 或 @call:module-name(args)
  const callRegex = /@call:([a-zA-Z0-9_-]+)(?:\(([^)]*)\))?/g;
  let match: RegExpExecArray | null;

  while ((match = callRegex.exec(prompt)) !== null) {
    const moduleName = match[1];
    const argsStr = match[2];
    const matchStr = match[0];  // 完整匹配字符串

    let args: unknown = undefined;
    if (argsStr) {
      try {
        // 尝试解析为 JSON
        args = JSON.parse(argsStr);
      } catch {
        // 作为字符串参数
        args = argsStr;
      }
    }

    calls.push({
      moduleName,
      args,
      context: 'main', // 默认共享上下文
      match: matchStr,  // 保存原始匹配字符串
    });
  }

  // 检查 context: fork 标记
  const forkRegex = /@call:([a-zA-Z0-9_-]+).*?context:\s*fork/g;
  let forkMatch: RegExpExecArray | null;
  while ((forkMatch = forkRegex.exec(prompt)) !== null) {
    const call = calls.find((c) => c.moduleName === forkMatch![1]);
    if (call) {
      call.context = 'fork';
    }
  }

  return calls;
}

/**
 * 检查 prompt 是否包含 @call 指令
 */
export function hasSubagentCalls(prompt: string): boolean {
  return /@call:[a-zA-Z0-9_-]+/.test(prompt);
}

/**
 * 列出 prompt 中调用的所有模块（不执行）
 */
export function listSubagentCalls(prompt: string): string[] {
  const calls = parseSubagentCalls(prompt);
  return [...new Set(calls.map((c) => c.moduleName))];
}

/**
 * 分析调用间的依赖关系
 */
export function analyzeDependencies(prompt: string, calls: SubagentCall[]): CallNode[] {
  const nodes: CallNode[] = calls.map((call) => ({
    call,
    dependencies: [],
  }));

  // 查找显式依赖: @call:B(${@call:A})
  for (const node of nodes) {
    const depRegex = new RegExp(
      `@call:${node.call.moduleName}\\([^)]*\\$\\{@call:([a-zA-Z0-9_-]+)`,
      'g'
    );
    let match;
    while ((match = depRegex.exec(prompt)) !== null) {
      if (!node.dependencies.includes(match[1])) {
        node.dependencies.push(match[1]);
      }
    }
  }

  // 查找隐式依赖: "then", "after", "based on" 等关键词
  const sequenceKeywords = ['then', 'after', 'based on', 'using result', 'with output'];
  const lines = prompt.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    
    // 查找当前行的调用
    const currentCall = nodes.find((n) =>
      line.includes(`@call:${n.call.moduleName}`)
    );
    if (!currentCall) continue;

    // 检查是否有顺序关键词
    for (const keyword of sequenceKeywords) {
      if (line.includes(keyword)) {
        // 查找之前几行的调用
        for (let j = Math.max(0, i - 3); j < i; j++) {
          const prevLine = lines[j].toLowerCase();
          const prevCall = nodes.find(
            (n) =>
              prevLine.includes(`@call:${n.call.moduleName}`) &&
              n.call.moduleName !== currentCall.call.moduleName
          );
          if (prevCall && !currentCall.dependencies.includes(prevCall.call.moduleName)) {
            currentCall.dependencies.push(prevCall.call.moduleName);
          }
        }
      }
    }
  }

  return nodes;
}

/**
 * 拓扑排序，返回可并行执行的批次
 */
export function topologicalSort(nodes: CallNode[]): SubagentCall[][] {
  const batches: SubagentCall[][] = [];
  const completed = new Set<string>();
  const remaining = new Set(nodes.map((n) => n.call.moduleName));

  while (remaining.size > 0) {
    const batch: SubagentCall[] = [];

    for (const node of nodes) {
      if (!remaining.has(node.call.moduleName)) continue;

      // 检查所有依赖是否已完成
      const depsCompleted = node.dependencies.every((dep) => completed.has(dep));
      if (depsCompleted) {
        batch.push(node.call);
      }
    }

    if (batch.length === 0) {
      // 循环依赖，强制执行剩余的
      console.warn('Circular dependency detected, forcing execution');
      for (const moduleName of remaining) {
        const node = nodes.find((n) => n.call.moduleName === moduleName);
        if (node) batch.push(node.call);
      }
    }

    batches.push(batch);

    for (const call of batch) {
      completed.add(call.moduleName);
      remaining.delete(call.moduleName);
    }
  }

  return batches;
}

/**
 * 执行 Subagent 调用
 */
export async function executeSubagentCalls(
  parentModule: CognitiveModule,
  client: LLMClient,
  provider: string,
  input: unknown,
  depth: number = 0
): Promise<Map<string, SubagentResult>> {
  const results = new Map<string, SubagentResult>();

  if (depth >= MAX_DEPTH) {
    console.warn(`Max subagent depth (${MAX_DEPTH}) reached`);
    return results;
  }

  // 解析调用
  const calls = parseSubagentCalls(parentModule.prompt);
  if (calls.length === 0) return results;

  // 分析依赖
  const nodes = analyzeDependencies(parentModule.prompt, calls);

  // 拓扑排序
  const batches = topologicalSort(nodes);

  // 按批次执行
  for (const batch of batches) {
    // 并行执行同一批次的调用
    const promises = batch.map(async (call) => {
      const module = findModule(call.moduleName);
      if (!module) {
        return {
          moduleName: call.moduleName,
          success: false,
          result: {
            ok: false,
            meta: { confidence: 0, risk: 'high' as const, explain: 'Module not found' },
            error: { code: 'MODULE_NOT_FOUND', message: `Module ${call.moduleName} not found` },
          },
          latencyMs: 0,
        } as SubagentResult;
      }

      const startTime = Date.now();
      const callInput = call.args ?? input;

      // 递归执行
      const execResult = await executeModule(module, client, provider, {
        input: callInput,
        maxRetries: 2,
      });

      // 如果子模块也有 subagent 调用，递归处理
      if (module.prompt.includes('@call:')) {
        const childResults = await executeSubagentCalls(
          module,
          client,
          provider,
          execResult.envelope.ok ? execResult.envelope.data : callInput,
          depth + 1
        );
        // 合并子结果
        for (const [name, result] of childResults) {
          results.set(name, result);
        }
      }

      return {
        moduleName: call.moduleName,
        success: execResult.success,
        result: execResult.envelope,
        latencyMs: Date.now() - startTime,
      } as SubagentResult;
    });

    const batchResults = await Promise.all(promises);
    for (const result of batchResults) {
      results.set(result.moduleName, result);
    }
  }

  return results;
}

/**
 * 检测循环依赖
 */
export function detectCircularDependency(nodes: CallNode[]): string[] | null {
  const visited = new Set<string>();
  const stack = new Set<string>();
  const path: string[] = [];

  function dfs(moduleName: string): boolean {
    if (stack.has(moduleName)) {
      // 找到循环
      const cycleStart = path.indexOf(moduleName);
      return true;
    }
    if (visited.has(moduleName)) return false;

    visited.add(moduleName);
    stack.add(moduleName);
    path.push(moduleName);

    const node = nodes.find((n) => n.call.moduleName === moduleName);
    if (node) {
      for (const dep of node.dependencies) {
        if (dfs(dep)) {
          return true;
        }
      }
    }

    stack.delete(moduleName);
    path.pop();
    return false;
  }

  for (const node of nodes) {
    if (dfs(node.call.moduleName)) {
      return path;
    }
  }

  return null;
}
