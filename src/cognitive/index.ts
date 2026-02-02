/**
 * Field CLI - Cognitive Module System
 * 导出所有 Cognitive 功能（完整版）
 */

// Types
export * from './types.js';

// Loader
export { 
  loadModule, 
  discoverModules, 
  findModule, 
  getModulePaths,
  isValidModule,
} from './loader/index.js';

// Validators
export { 
  validateSchema, 
  validateInput, 
  validateOutput, 
  validateMeta,
} from './validator/schema.js';

export { 
  isEnvelope, 
  validateEnvelope, 
  parseEnvelope,
  aggregateRisk as aggregateRiskLevels,  // 旧版兼容
} from './validator/envelope.js';

// Overflow Validator
export {
  validateOverflow,
  canAddInsight,
  truncateInsights,
  createInsight,
} from './validator/overflow.js';

// Enum Strategy Validator
export {
  validateEnumStrategy,
  validateModuleEnums,
  validateWithEnumStrategy,
  mergeValidationResults,
  type EnumValidationResult,
} from './validator/enum-validator.js';

// Runtime - Executor
export { executeModule } from './runtime/executor.js';
export { repairEnvelope, buildEnvelopeFromText } from './runtime/repair.js';
export { metricsCollector } from './runtime/metrics.js';

// Runtime - Envelope
export {
  wrapV21ToV22,
  convertLegacyToEnvelope,
  createSuccessEnvelope,
  createFailureEnvelope,
  createParseError,
  createInvalidInputError,
  createModuleNotFoundError,
  createSchemaValidationError,
  createInternalError,
  createMaxDepthError,
  createCircularCallError,
  isV22Envelope,
  isV21Envelope,
  ensureV22Envelope,
} from './runtime/envelope.js';

// Runtime - Risk Aggregator
export {
  aggregateRisk,
  aggregateRiskFromList,
  aggregateRiskForModule,
  compareRisk,
  maxRisk,
  minRisk,
  requiresReview,
  requiresConfirmation,
  moduleRequiresConfirmation,
  shouldEscalate,
  isValidRisk,
  parseRisk,
  getRiskValue,
  getRiskDescription,
} from './runtime/risk-aggregator.js';

// Runtime - Prompt Builder
export {
  substituteArguments,
  formatConstraints,
  formatSchema,
  buildPrompt,
  buildSystemPrompt,
  hasArgumentsPlaceholder,
  extractPlaceholders,
  estimatePromptTokens,
} from './runtime/prompt-builder.js';

// Subagent
export {
  parseSubagentCalls,
  analyzeDependencies,
  topologicalSort,
  executeSubagentCalls,
  detectCircularDependency,
  createContext,
  forkContext,
  extendContext,
  substituteCallResults,
  hasNoDependencies,
  hasSubagentCalls,
  listSubagentCalls,
} from './runtime/subagent.js';

// Installer
export {
  installModule as installModuleFromGitHub,
  removeModule,
  updateModule,
  lockModule,
  unlockModule,
  listInstalledModules,
  listVersions,
  loadManifest,
  isLocked,
} from './installer.js';

// Smart Selection
export {
  selectProvider,
  SmartSelect,
  type TaskType,
  type Strategy,
} from './smart-select.js';

// Tool Registry (AI Auto-Invocation with Function Calling)
export {
  getAvailableTools,
  toOpenAITools,
  executeToolCall,
  formatToolResult,
  extractModuleName,
  buildSystemPromptWithTools,
  parseToolCallFromText,
  toolCallRequiresConfirmation,
  toolCallRequiresConfirmationSync,
  getConfirmationPrompt,
  // Policy Engine
  initPolicyEngine,
  getPolicyEngine,
  setApprovalMode,
  checkToolCallPolicy,
  addDynamicAllowRule,
  type CognitiveTool,
  type ToolExecutionResult,
} from './tool-registry.js';

// Policy System (完整策略引擎)
export {
  PolicyEngine,
  PolicyDecision,
  ApprovalMode,
  POLICY_TIERS,
  createPolicyEngineConfig,
  saveDynamicPolicy,
  getUserPoliciesDir,
  getSystemPoliciesDir,
  formatPolicyError,
  loadPoliciesFromToml,
  stableStringify,
  type PolicyRule,
  type PolicySettings,
  type CheckResult,
  type PolicyEngineConfig,
  type PolicyFileError,
} from '../policy/index.js';

// Commands
export { handleCogCommand } from './commands.js';
