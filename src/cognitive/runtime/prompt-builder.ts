/**
 * Field CLI - Prompt Builder
 * 构建发送给 LLM 的完整提示
 */

import type { CognitiveModule, JsonSchema } from '../types.js';

// =============================================================================
// Argument Substitution
// =============================================================================

/**
 * 替换 $ARGUMENTS 和 $N 占位符
 */
export function substituteArguments(
  text: string,
  input: Record<string, unknown>
): string {
  // 获取主参数值
  const argsValue = String(
    input['$ARGUMENTS'] ?? input['query'] ?? input['code'] ?? input['text'] ?? ''
  );

  // 替换 $ARGUMENTS
  let result = text.replace(/\$ARGUMENTS/g, argsValue);

  // 替换 $ARGUMENTS[N] 和 $N（索引访问）
  const argsList = argsValue.split(/\s+/);
  for (let i = 0; i < argsList.length; i++) {
    result = result.replace(new RegExp(`\\$ARGUMENTS\\[${i}\\]`, 'g'), argsList[i]);
    result = result.replace(new RegExp(`\\$${i}(?!\\d)`, 'g'), argsList[i]);
  }

  // 替换命名参数 ${name}
  for (const [key, value] of Object.entries(input)) {
    const placeholder = new RegExp(`\\$\\{${key}\\}`, 'g');
    result = result.replace(placeholder, String(value ?? ''));
  }

  return result;
}

// =============================================================================
// Constraints Formatting
// =============================================================================

/**
 * 格式化约束条件为 YAML 风格文本
 */
export function formatConstraints(module: CognitiveModule): string {
  const lines: string[] = [];

  // 操作约束（来自 policies）
  const policies = module.policies;
  if (policies && Object.keys(policies).length > 0) {
    lines.push('operational:');
    if (policies.network === 'deny') {
      lines.push('  no_external_network: true');
    }
    if (policies.filesystem_write === 'deny') {
      lines.push('  no_file_write: true');
    }
    if (policies.side_effects === 'deny') {
      lines.push('  no_side_effects: true');
    }
    if (policies.code_execution === 'deny') {
      lines.push('  no_code_execution: true');
    }
  }

  // 排除项
  if (module.excludes && module.excludes.length > 0) {
    lines.push('excludes:');
    for (const exclude of module.excludes) {
      lines.push(`  - ${exclude}`);
    }
  }

  return lines.join('\n');
}

// =============================================================================
// Schema Formatting
// =============================================================================

/**
 * 格式化 JSON Schema 用于 prompt
 */
export function formatSchema(
  schema: JsonSchema | Record<string, unknown>,
  label: string
): string {
  if (!schema || Object.keys(schema).length === 0) {
    return '';
  }

  return `### ${label} Schema\n\`\`\`json\n${JSON.stringify(schema, null, 2)}\n\`\`\``;
}

// =============================================================================
// Envelope Format Instructions
// =============================================================================

const ENVELOPE_V22_INSTRUCTIONS = `
## Response Format (Envelope v2.2)

You MUST wrap your response in the v2.2 envelope format with separate meta and data:

### Success Response
\`\`\`json
{
  "ok": true,
  "meta": {
    "confidence": 0.9,
    "risk": "low",
    "explain": "Short summary for control plane (≤280 chars)"
  },
  "data": {
    "...your output fields...",
    "rationale": "Detailed reasoning for audit (no limit)"
  }
}
\`\`\`

### Error Response
\`\`\`json
{
  "ok": false,
  "meta": {
    "confidence": 0.0,
    "risk": "high",
    "explain": "Error summary (≤280 chars)"
  },
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error description"
  }
}
\`\`\`

### Rules
- meta.explain MUST be ≤280 characters
- meta.risk MUST be one of: none, low, medium, high
- meta.confidence MUST be between 0 and 1
- data.rationale can be longer for detailed reasoning
- Return ONLY valid JSON
`;

const ENVELOPE_V21_INSTRUCTIONS = `
## Response Format (Envelope)

You MUST wrap your response in the envelope format:
- Success: { "ok": true, "data": { ...your output... } }
- Error: { "ok": false, "error": { "code": "ERROR_CODE", "message": "..." } }

Return ONLY valid JSON.
`;

const LEGACY_INSTRUCTIONS = `
## Instructions

Analyze the input and generate output matching the required schema.
Return ONLY valid JSON. Do not include any text before or after the JSON.
`;

// =============================================================================
// Main Prompt Builder
// =============================================================================

export interface BuildPromptOptions {
  /** 是否使用 Envelope 格式 */
  useEnvelope?: boolean;
  /** 是否使用 v2.2 格式 */
  useV22?: boolean;
  /** 是否包含 Schema */
  includeSchemas?: boolean;
}

/**
 * 构建完整的用户 Prompt
 */
export function buildPrompt(
  module: CognitiveModule,
  input: Record<string, unknown>,
  options: BuildPromptOptions = {}
): string {
  const { useEnvelope = true, useV22 = true, includeSchemas = true } = options;

  // 替换 $ARGUMENTS
  const prompt = substituteArguments(module.prompt, input);

  const parts: string[] = [];

  // 模块 prompt
  parts.push(prompt);

  // 职责和排除项
  if (module.responsibility) {
    parts.push(`\n## Responsibility\n${module.responsibility}`);
  }

  // 约束条件
  const constraints = formatConstraints(module);
  if (constraints) {
    parts.push(`\n## Constraints\n${constraints}`);
  }

  // 输入数据
  parts.push('\n## Input');
  parts.push('```json');
  parts.push(JSON.stringify(input, null, 2));
  parts.push('```');

  // Schemas（可选）
  if (includeSchemas) {
    const dataSchemaText = formatSchema(module.dataSchema, 'Output');
    
    if (dataSchemaText) {
      parts.push('\n## Schemas');
      parts.push(dataSchemaText);
    }
  }

  // 响应格式说明
  if (useEnvelope) {
    parts.push(useV22 ? ENVELOPE_V22_INSTRUCTIONS : ENVELOPE_V21_INSTRUCTIONS);
  } else {
    parts.push(LEGACY_INSTRUCTIONS);
  }

  return parts.join('\n');
}

// =============================================================================
// System Prompt Generation
// =============================================================================

/**
 * 生成系统 Prompt
 */
export function buildSystemPrompt(module: CognitiveModule): string {
  const parts: string[] = [];

  parts.push(`You are a specialized AI module: ${module.name}`);

  if (module.responsibility) {
    parts.push(`\nYour responsibility: ${module.responsibility}`);
  }

  if (module.excludes && module.excludes.length > 0) {
    parts.push('\nYou must NOT:');
    for (const exclude of module.excludes) {
      parts.push(`- ${exclude}`);
    }
  }

  // Tier 特定指令
  if (module.tier) {
    parts.push(`\nModule tier: ${module.tier}`);
    switch (module.tier) {
      case 'exec':
        parts.push('You must be precise and follow the schema strictly.');
        break;
      case 'decision':
        parts.push('You must provide clear reasoning and confidence scores.');
        break;
      case 'exploration':
        parts.push('You may explore freely but must structure your findings.');
        break;
    }
  }

  parts.push('\nAlways respond with valid JSON in the specified envelope format.');

  return parts.join('\n');
}

// =============================================================================
// Prompt Utilities
// =============================================================================

/**
 * 检测 prompt 中是否包含 $ARGUMENTS 占位符
 */
export function hasArgumentsPlaceholder(prompt: string): boolean {
  return /\$ARGUMENTS|\$\d+|\$\{[^}]+\}/.test(prompt);
}

/**
 * 提取 prompt 中的所有占位符
 */
export function extractPlaceholders(prompt: string): string[] {
  const placeholders: string[] = [];
  
  // $ARGUMENTS
  if (prompt.includes('$ARGUMENTS')) {
    placeholders.push('$ARGUMENTS');
  }
  
  // $N
  const indexMatches = prompt.match(/\$\d+/g);
  if (indexMatches) {
    placeholders.push(...new Set(indexMatches));
  }
  
  // ${name}
  const namedMatches = prompt.match(/\$\{[^}]+\}/g);
  if (namedMatches) {
    placeholders.push(...new Set(namedMatches));
  }
  
  return placeholders;
}

/**
 * 估算 prompt 的 token 数（简单估算）
 */
export function estimatePromptTokens(prompt: string): number {
  // 简单估算：约 4 字符 = 1 token
  return Math.ceil(prompt.length / 4);
}
