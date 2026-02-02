/**
 * Field CLI - Policy Config
 * 策略配置管理
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  type PolicyEngineConfig,
  type PolicyRule,
  type PolicySettings,
  type PolicyFileError,
  PolicyDecision,
  ApprovalMode,
  POLICY_TIERS,
} from './types.js';
import { loadPoliciesFromToml } from './toml-loader.js';
import { buildArgsPatterns } from './utils.js';

/**
 * 获取 Field CLI 配置目录
 */
export function getFieldCliDir(): string {
  return path.join(os.homedir(), '.field-cli');
}

/**
 * 获取用户策略目录
 */
export function getUserPoliciesDir(): string {
  return path.join(getFieldCliDir(), 'policies');
}

/**
 * 获取系统策略目录
 */
export function getSystemPoliciesDir(): string {
  if (process.platform === 'win32') {
    return path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'field-cli', 'policies');
  }
  return '/etc/field-cli/policies';
}

/**
 * 获取默认策略目录（内置策略）
 */
export function getDefaultPoliciesDir(): string {
  // 默认策略在包内
  return path.join(path.dirname(new URL(import.meta.url).pathname), 'policies');
}

/**
 * 获取策略目录列表（按优先级从低到高）
 */
export function getPolicyDirectories(defaultPoliciesDir?: string): string[] {
  const dirs = [];

  if (defaultPoliciesDir) {
    dirs.push(defaultPoliciesDir);
  } else {
    dirs.push(getDefaultPoliciesDir());
  }

  dirs.push(getUserPoliciesDir());
  dirs.push(getSystemPoliciesDir());

  // 反转以便按优先级从高到低加载
  return dirs.reverse();
}

/**
 * 确定目录的策略层级
 */
export function getPolicyTier(
  dir: string,
  defaultPoliciesDir?: string,
): number {
  const normalizedDir = path.resolve(dir);
  const normalizedUser = path.resolve(getUserPoliciesDir());
  const normalizedAdmin = path.resolve(getSystemPoliciesDir());

  if (
    defaultPoliciesDir &&
    normalizedDir === path.resolve(defaultPoliciesDir)
  ) {
    return POLICY_TIERS.DEFAULT;
  }
  if (normalizedDir === path.resolve(getDefaultPoliciesDir())) {
    return POLICY_TIERS.DEFAULT;
  }
  if (normalizedDir === normalizedUser) {
    return POLICY_TIERS.USER;
  }
  if (normalizedDir === normalizedAdmin) {
    return POLICY_TIERS.ADMIN;
  }

  return POLICY_TIERS.DEFAULT;
}

/**
 * 格式化策略文件错误
 */
export function formatPolicyError(error: PolicyFileError): string {
  const tierLabel = error.tier.toUpperCase();
  let message = `[${tierLabel}] 策略文件错误 ${error.fileName}:\n`;
  message += `  ${error.message}`;
  if (error.details) {
    message += `\n${error.details}`;
  }
  if (error.suggestion) {
    message += `\n  建议: ${error.suggestion}`;
  }
  return message;
}

/**
 * 创建策略引擎配置
 */
export async function createPolicyEngineConfig(
  settings: PolicySettings,
  approvalMode: ApprovalMode,
  defaultPoliciesDir?: string,
): Promise<{ config: PolicyEngineConfig; errors: PolicyFileError[] }> {
  const policyDirs = getPolicyDirectories(defaultPoliciesDir);

  // 从 TOML 文件加载策略
  const { rules: tomlRules, errors } = await loadPoliciesFromToml(
    policyDirs,
    (dir) => getPolicyTier(dir, defaultPoliciesDir),
  );

  const rules: PolicyRule[] = [...tomlRules];

  // 优先级系统:
  // - 默认策略 (TOML): 1 + priority/1000
  // - 用户策略 (TOML): 2 + priority/1000
  // - 管理策略 (TOML): 3 + priority/1000
  //
  // 设置规则优先级 (用户层级 2.x):
  //   2.95: 用户在交互 UI 中选择的 "始终允许"
  //   2.9:  认知模块排除列表
  //   2.4:  命令行 --exclude-tools
  //   2.3:  命令行 --allowed-tools
  //   2.2:  信任的认知模块
  //   2.1:  允许的认知模块

  // 排除的工具
  if (settings.tools?.exclude) {
    for (const tool of settings.tools.exclude) {
      rules.push({
        toolName: tool,
        decision: PolicyDecision.DENY,
        priority: 2.4,
        source: 'Settings (Tools Excluded)',
      });
    }
  }

  // 允许的工具
  if (settings.tools?.allowed) {
    for (const tool of settings.tools.allowed) {
      const match = tool.match(/^([a-zA-Z0-9_-]+)\((.*)\)$/);
      if (match) {
        const [, toolName, args] = match;
        const patterns = buildArgsPatterns(undefined, args);
        for (const pattern of patterns) {
          if (pattern) {
            rules.push({
              toolName,
              decision: PolicyDecision.ALLOW,
              priority: 2.3,
              argsPattern: new RegExp(pattern),
              source: 'Settings (Tools Allowed)',
            });
          }
        }
      } else {
        rules.push({
          toolName: tool,
          decision: PolicyDecision.ALLOW,
          priority: 2.3,
          source: 'Settings (Tools Allowed)',
        });
      }
    }
  }

  // 排除的认知模块
  if (settings.cognitive?.excluded) {
    for (const moduleName of settings.cognitive.excluded) {
      rules.push({
        toolName: `cognitive_${moduleName}`,
        decision: PolicyDecision.DENY,
        priority: 2.9,
        source: 'Settings (Cognitive Excluded)',
      });
    }
  }

  // 允许的认知模块
  if (settings.cognitive?.allowed) {
    for (const moduleName of settings.cognitive.allowed) {
      rules.push({
        toolName: `cognitive_${moduleName}`,
        decision: PolicyDecision.ALLOW,
        priority: 2.1,
        source: 'Settings (Cognitive Allowed)',
      });
    }
  }

  return {
    config: {
      rules,
      defaultDecision: PolicyDecision.ASK_USER,
      approvalMode,
    },
    errors,
  };
}

/**
 * 保存动态策略到用户目录
 */
export async function saveDynamicPolicy(
  toolName: string,
  decision: PolicyDecision,
  options?: {
    argsPattern?: string;
    commandPrefix?: string | string[];
  },
): Promise<void> {
  const userPoliciesDir = getUserPoliciesDir();
  await fs.mkdir(userPoliciesDir, { recursive: true });

  const policyFile = path.join(userPoliciesDir, 'auto-saved.toml');

  // 读取现有文件
  let content = '';
  try {
    content = await fs.readFile(policyFile, 'utf-8');
  } catch (e) {
    const error = e as NodeJS.ErrnoException;
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  // 添加新规则
  const newRule: string[] = ['[[rule]]'];
  newRule.push(`toolName = "${toolName}"`);
  newRule.push(`decision = "${decision}"`);
  newRule.push(`priority = 100`);

  if (options?.argsPattern) {
    newRule.push(`argsPattern = "${options.argsPattern}"`);
  }
  if (options?.commandPrefix) {
    if (Array.isArray(options.commandPrefix)) {
      newRule.push(`commandPrefix = ${JSON.stringify(options.commandPrefix)}`);
    } else {
      newRule.push(`commandPrefix = "${options.commandPrefix}"`);
    }
  }

  content += '\n' + newRule.join('\n') + '\n';

  // 原子写入
  const tmpFile = `${policyFile}.tmp`;
  await fs.writeFile(tmpFile, content, 'utf-8');
  await fs.rename(tmpFile, policyFile);
}
