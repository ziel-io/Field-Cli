/**
 * Field CLI - Cognitive Module Types
 * Cognitive Modules v2.2 Specification (Complete)
 */

// ============ Basic Types ============

export type ModuleTier = 'exec' | 'decision' | 'exploration';
export type SchemaStrictness = 'strict' | 'medium' | 'relaxed';
export type RiskLevel = 'none' | 'low' | 'medium' | 'high';
export type RiskRule = 'max_changes_risk' | 'max_issues_risk' | 'explicit';
export type EnumStrategy = 'strict' | 'suggest' | 'free';
export type PolicyValue = 'allow' | 'deny';

// ============ Policy Types ============

/**
 * 操作策略 - 限制模块的行为边界
 */
export interface Policies {
  /** 网络访问 */
  network?: PolicyValue;
  /** 文件系统写入 */
  filesystem_write?: PolicyValue;
  /** 副作用（发邮件、调API等） */
  side_effects?: PolicyValue;
  /** 代码执行 */
  code_execution?: PolicyValue;
}

/**
 * Overflow 策略 - 处理超出 Schema 的额外信息
 */
export interface OverflowPolicy {
  /** 是否启用 overflow */
  enabled: boolean;
  /** 是否可恢复（保存到 extensions.insights） */
  recoverable: boolean;
  /** 最大 insights 数量 */
  max_items: number;
  /** 是否要求 suggested_mapping */
  require_suggested_mapping: boolean;
}

/**
 * Enum 策略 - 枚举值验证严格程度
 */
export interface EnumPolicy {
  /** strict: 必须匹配, suggest: 警告, free: 忽略 */
  strategy: EnumStrategy;
}

/**
 * 工具策略
 */
export interface ToolsPolicy {
  /** 允许使用的工具 */
  allowed?: string[];
  /** 禁止使用的工具 */
  denied?: string[];
}

// ============ Module Manifest ============

export interface ModuleManifest {
  name: string;
  version: string;
  responsibility: string;
  tier: ModuleTier;
  schema_strictness?: SchemaStrictness;
  excludes?: string[];
  
  // v2.2 策略
  overflow?: Partial<OverflowPolicy>;
  enums?: Partial<EnumPolicy>;
  policies?: Policies;
  tools?: ToolsPolicy;
  risk_rule?: RiskRule;
  
  // Subagent 配置
  subagent?: {
    max_depth?: number;
    allowed_modules?: string[];
    context?: 'main' | 'fork';  // 执行上下文模式
  };
}

export interface ModuleSchema {
  $schema?: string;
  input: JsonSchema;
  meta: JsonSchema;
  data: JsonSchema;
  error?: JsonSchema;
}

export interface JsonSchema {
  type: string;
  required?: string[];
  properties?: Record<string, JsonSchemaProperty>;
  items?: JsonSchemaProperty;
  additionalProperties?: boolean;
}

export interface JsonSchemaProperty {
  type: string;
  description?: string;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  minLength?: number;
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

export interface CognitiveModule {
  name: string;
  path: string;
  manifest: ModuleManifest;
  schema: ModuleSchema;
  prompt: string;
  format: 'v0' | 'v1' | 'v2.0' | 'v2.1' | 'v2.2';
  
  // 解析后的策略（带默认值）
  tier: ModuleTier | null;
  schemaStrictness: SchemaStrictness;
  overflow: OverflowPolicy;
  enums: EnumPolicy;
  policies: Policies;
  riskRule: RiskRule;
  excludes: string[];
  responsibility: string;
  inputSchema: JsonSchema;
  dataSchema: JsonSchema;
}

// ============ Envelope Response ============

export interface EnvelopeMeta {
  confidence: number;
  risk: RiskLevel;
  explain: string;
  [key: string]: unknown;
}

/**
 * Insight - 溢出的额外信息
 */
export interface Insight {
  /** 类型标识 */
  type: string;
  /** 内容 */
  content: unknown;
  /** 建议的 Schema 映射 */
  suggested_mapping?: string;
  /** 置信度 */
  confidence?: number;
}

/**
 * Extensions - 存放溢出信息
 */
export interface Extensions {
  insights?: Insight[];
}

export interface EnvelopeSuccess<T = unknown> {
  ok: true;
  meta: EnvelopeMeta;
  data: T;
  extensions?: Extensions;
}

export interface EnvelopeFailure {
  ok: false;
  meta: EnvelopeMeta;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  partial_data?: Record<string, unknown> | null;
}

export type Envelope<T = unknown> = EnvelopeSuccess<T> | EnvelopeFailure;

// v2.1 兼容类型
export interface EnvelopeSuccessV21<T = unknown> {
  ok: true;
  data: T;
}

export interface EnvelopeFailureV21 {
  ok: false;
  error: {
    code: string;
    message: string;
  };
  partial_data?: Record<string, unknown> | null;
}

export type EnvelopeV21<T = unknown> = EnvelopeSuccessV21<T> | EnvelopeFailureV21;

// 别名（兼容旧代码）
export type EnvelopeError = EnvelopeFailure;

// ============ Execution ============

export interface ExecutionOptions {
  input: unknown;
  maxRetries?: number;
  timeout?: number;
  stream?: boolean;
  onChunk?: (chunk: string, done: boolean) => void;
}

export interface ExecutionResult<T = unknown> {
  success: boolean;
  envelope: Envelope<T>;
  metrics: ExecutionMetrics;
  repaired: boolean;
}

export interface ExecutionMetrics {
  startTime: number;
  endTime: number;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  retryCount: number;
  repairAttempts: number;
}

// ============ Validation ============

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  path: string;
  message: string;
  value?: unknown;
}

// ============ Subagent ============

export interface SubagentCall {
  moduleName: string;
  args?: unknown;
  context: 'main' | 'fork';
  /** 原始匹配字符串（用于替换） */
  match?: string;
}

export interface SubagentResult {
  moduleName: string;
  success: boolean;
  result: Envelope;
  latencyMs: number;
}

/**
 * Subagent 执行上下文
 */
export interface SubagentContext {
  /** 父模块名称（root 为 null） */
  parentId: string | null;
  /** 当前调用深度 */
  depth: number;
  /** 最大允许深度 */
  maxDepth: number;
  /** 累积的调用结果 */
  results: Record<string, unknown>;
  /** 是否是隔离上下文 */
  isolated: boolean;
}

// ============ Metrics ============

export interface AggregateMetrics {
  totalExecutions: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  totalTokens: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  repairRate: number;
  byModule: Record<string, ModuleMetrics>;
  byProvider: Record<string, ProviderMetrics>;
}

export interface ModuleMetrics {
  name: string;
  executions: number;
  successRate: number;
  avgLatencyMs: number;
  totalTokens: number;
}

export interface ProviderMetrics {
  name: string;
  requests: number;
  totalTokens: number;
  avgLatencyMs: number;
}

// ============ Installation ============

export interface InstalledModule {
  name: string;
  version: string;
  source: string;
  installedAt: string;
  updatedAt: string;
  locked: boolean;
  path: string;
}

export interface InstallManifest {
  version: string;
  modules: Record<string, InstalledModule>;
}
