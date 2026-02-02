/**
 * Field CLI - Policy Engine Types
 * 策略引擎类型定义 - 与 gemini-cli-cognitive 完全一致
 */

/**
 * 策略决定
 */
export enum PolicyDecision {
  ALLOW = 'allow',
  DENY = 'deny',
  ASK_USER = 'ask_user',
}

/**
 * 审批模式
 */
export enum ApprovalMode {
  DEFAULT = 'default',
  AUTO_EDIT = 'autoEdit',
  YOLO = 'yolo',
  PLAN = 'plan',
}

/**
 * 策略规则
 */
export interface PolicyRule {
  /**
   * 规则名称（用于调试）
   */
  name?: string;

  /**
   * 工具名称（如果未定义，则适用于所有工具）
   */
  toolName?: string;

  /**
   * 参数匹配模式
   */
  argsPattern?: RegExp;

  /**
   * 匹配时的决定
   */
  decision: PolicyDecision;

  /**
   * 优先级（数字越大优先级越高）
   */
  priority?: number;

  /**
   * 适用的审批模式
   */
  modes?: ApprovalMode[];

  /**
   * 是否允许重定向（仅用于 shell 命令）
   */
  allowRedirection?: boolean;

  /**
   * 规则来源（如 "my-policies.toml"）
   */
  source?: string;

  /**
   * 拒绝时显示的消息
   */
  denyMessage?: string;
}

/**
 * 策略检查结果
 */
export interface CheckResult {
  decision: PolicyDecision;
  rule?: PolicyRule;
}

/**
 * 策略引擎配置
 */
export interface PolicyEngineConfig {
  /**
   * 策略规则列表
   */
  rules?: PolicyRule[];

  /**
   * 无规则匹配时的默认决定
   */
  defaultDecision?: PolicyDecision;

  /**
   * 非交互模式（ASK_USER 变为 DENY）
   */
  nonInteractive?: boolean;

  /**
   * 当前审批模式
   */
  approvalMode?: ApprovalMode;
}

/**
 * 策略设置
 */
export interface PolicySettings {
  tools?: {
    exclude?: string[];
    allowed?: string[];
  };
  cognitive?: {
    excluded?: string[];
    allowed?: string[];
  };
}

/**
 * 工具调用接口
 */
export interface ToolCall {
  name: string;
  args?: Record<string, unknown>;
}

/**
 * TOML 策略规则（转换前）
 */
export interface TomlPolicyRule {
  toolName?: string | string[];
  argsPattern?: string;
  commandPrefix?: string | string[];
  commandRegex?: string;
  decision: PolicyDecision;
  priority: number;
  modes?: ApprovalMode[];
  allow_redirection?: boolean;
  deny_message?: string;
}

/**
 * 策略文件错误类型
 */
export type PolicyFileErrorType =
  | 'file_read'
  | 'toml_parse'
  | 'schema_validation'
  | 'rule_validation'
  | 'regex_compilation';

/**
 * 策略文件错误
 */
export interface PolicyFileError {
  filePath: string;
  fileName: string;
  tier: 'default' | 'user' | 'admin';
  ruleIndex?: number;
  errorType: PolicyFileErrorType;
  message: string;
  details?: string;
  suggestion?: string;
}

/**
 * 策略加载结果
 */
export interface PolicyLoadResult {
  rules: PolicyRule[];
  errors: PolicyFileError[];
}

/**
 * 策略层级常量
 */
export const POLICY_TIERS = {
  DEFAULT: 1,
  USER: 2,
  ADMIN: 3,
} as const;
