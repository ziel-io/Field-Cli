/**
 * Field CLI - TOML Policy Loader
 * 从 TOML 文件加载策略
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  type PolicyRule,
  type PolicyLoadResult,
  type PolicyFileError,
  PolicyDecision,
  ApprovalMode,
} from './types.js';
import { buildArgsPatterns } from './utils.js';

/**
 * 获取层级名称
 */
function getTierName(tier: number): 'default' | 'user' | 'admin' {
  if (tier === 1) return 'default';
  if (tier === 2) return 'user';
  if (tier === 3) return 'admin';
  return 'default';
}

/**
 * 转换优先级（基于层级）
 * 公式: tier + priority/1000
 */
function transformPriority(priority: number, tier: number): number {
  return tier + priority / 1000;
}

/**
 * 验证 shell 命令便捷语法
 */
function validateShellCommandSyntax(
  rule: Record<string, unknown>,
  ruleIndex: number,
): string | null {
  const hasCommandPrefix = rule.commandPrefix !== undefined;
  const hasCommandRegex = rule.commandRegex !== undefined;
  const hasArgsPattern = rule.argsPattern !== undefined;

  if (hasCommandPrefix || hasCommandRegex) {
    if (rule.toolName !== 'run_shell_command' || Array.isArray(rule.toolName)) {
      return (
        `Rule #${ruleIndex + 1}: commandPrefix 和 commandRegex 只能与 toolName = "run_shell_command" 一起使用\n` +
        `  Found: toolName = ${JSON.stringify(rule.toolName)}`
      );
    }

    if (hasArgsPattern) {
      return (
        `Rule #${ruleIndex + 1}: 不能同时使用 commandPrefix/commandRegex 和 argsPattern`
      );
    }

    if (hasCommandPrefix && hasCommandRegex) {
      return (
        `Rule #${ruleIndex + 1}: 不能同时使用 commandPrefix 和 commandRegex`
      );
    }
  }

  return null;
}

/**
 * 简单的 TOML 解析器（支持基本语法）
 */
function parseToml(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = content.split('\n');
  let currentArray: Record<string, unknown>[] | null = null;
  let currentArrayName: string | null = null;
  let currentObject: Record<string, unknown> | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // 跳过空行和注释
    if (!line || line.startsWith('#')) continue;

    // 数组表头 [[rule]]
    const arrayMatch = line.match(/^\[\[(\w+)\]\]$/);
    if (arrayMatch) {
      const name = arrayMatch[1];
      if (!result[name]) {
        result[name] = [];
      }
      currentArrayName = name;
      currentArray = result[name] as Record<string, unknown>[];
      currentObject = {};
      currentArray.push(currentObject);
      continue;
    }

    // 普通表头 [section]
    const sectionMatch = line.match(/^\[(\w+)\]$/);
    if (sectionMatch) {
      const name = sectionMatch[1];
      result[name] = {};
      currentObject = result[name] as Record<string, unknown>;
      currentArrayName = null;
      currentArray = null;
      continue;
    }

    // 键值对
    const kvMatch = line.match(/^(\w+)\s*=\s*(.+)$/);
    if (kvMatch && currentObject) {
      const [, key, rawValue] = kvMatch;
      let value: unknown = rawValue;

      // 解析值
      if (rawValue === 'true') {
        value = true;
      } else if (rawValue === 'false') {
        value = false;
      } else if (/^-?\d+$/.test(rawValue)) {
        value = parseInt(rawValue, 10);
      } else if (/^-?\d+\.\d+$/.test(rawValue)) {
        value = parseFloat(rawValue);
      } else if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
        value = rawValue.slice(1, -1).replace(/\\"/g, '"');
      } else if (rawValue.startsWith("'") && rawValue.endsWith("'")) {
        value = rawValue.slice(1, -1);
      } else if (rawValue.startsWith('[')) {
        // 简单数组解析
        try {
          value = JSON.parse(rawValue.replace(/'/g, '"'));
        } catch {
          value = rawValue;
        }
      }

      currentObject[key] = value;
    }
  }

  return result;
}

/**
 * 从 TOML 文件加载策略
 */
export async function loadPoliciesFromToml(
  policyDirs: string[],
  getPolicyTier: (dir: string) => number,
): Promise<PolicyLoadResult> {
  const rules: PolicyRule[] = [];
  const errors: PolicyFileError[] = [];

  for (const dir of policyDirs) {
    const tier = getPolicyTier(dir);
    const tierName = getTierName(tier);

    // 扫描目录中的 .toml 文件
    let filesToLoad: string[];
    try {
      const dirEntries = await fs.readdir(dir, { withFileTypes: true });
      filesToLoad = dirEntries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.toml'))
        .map((entry) => entry.name);
    } catch (e) {
      const error = e as NodeJS.ErrnoException;
      if (error.code === 'ENOENT') {
        // 目录不存在，跳过
        continue;
      }
      errors.push({
        filePath: dir,
        fileName: path.basename(dir),
        tier: tierName,
        errorType: 'file_read',
        message: '无法读取策略目录',
        details: error.message,
      });
      continue;
    }

    for (const file of filesToLoad) {
      const filePath = path.join(dir, file);

      try {
        const fileContent = await fs.readFile(filePath, 'utf-8');

        // 解析 TOML
        let parsed: Record<string, unknown>;
        try {
          parsed = parseToml(fileContent);
        } catch (e) {
          const error = e as Error;
          errors.push({
            filePath,
            fileName: file,
            tier: tierName,
            errorType: 'toml_parse',
            message: 'TOML 解析失败',
            details: error.message,
          });
          continue;
        }

        // 处理规则
        const tomlRules = (parsed.rule as Record<string, unknown>[]) || [];

        for (let i = 0; i < tomlRules.length; i++) {
          const rule = tomlRules[i];

          // 验证 shell 命令语法
          const validationError = validateShellCommandSyntax(rule, i);
          if (validationError) {
            errors.push({
              filePath,
              fileName: file,
              tier: tierName,
              ruleIndex: i,
              errorType: 'rule_validation',
              message: '无效的 shell 命令语法',
              details: validationError,
            });
            continue;
          }

          // 验证必需字段
          if (!rule.decision || rule.priority === undefined) {
            errors.push({
              filePath,
              fileName: file,
              tier: tierName,
              ruleIndex: i,
              errorType: 'schema_validation',
              message: '缺少必需字段',
              details: 'decision 和 priority 是必需的',
            });
            continue;
          }

          // 验证 decision 值
          const decision = rule.decision as string;
          if (!['allow', 'deny', 'ask_user'].includes(decision)) {
            errors.push({
              filePath,
              fileName: file,
              tier: tierName,
              ruleIndex: i,
              errorType: 'schema_validation',
              message: '无效的 decision 值',
              details: `decision 必须是 allow, deny 或 ask_user，得到: ${decision}`,
            });
            continue;
          }

          // 构建参数模式
          const argsPatterns = buildArgsPatterns(
            rule.argsPattern as string | undefined,
            rule.commandPrefix as string | string[] | undefined,
            rule.commandRegex as string | undefined,
          );

          // 展开 toolName 数组
          for (const argsPattern of argsPatterns) {
            const toolNames: Array<string | undefined> = rule.toolName
              ? Array.isArray(rule.toolName)
                ? rule.toolName as string[]
                : [rule.toolName as string]
              : [undefined];

            for (const toolName of toolNames) {
              const policyRule: PolicyRule = {
                toolName,
                decision: decision as PolicyDecision,
                priority: transformPriority(rule.priority as number, tier),
                modes: rule.modes as ApprovalMode[] | undefined,
                allowRedirection: rule.allow_redirection as boolean | undefined,
                source: `${tierName.charAt(0).toUpperCase() + tierName.slice(1)}: ${file}`,
                denyMessage: rule.deny_message as string | undefined,
              };

              // 编译正则模式
              if (argsPattern) {
                try {
                  policyRule.argsPattern = new RegExp(argsPattern);
                } catch (e) {
                  const error = e as Error;
                  errors.push({
                    filePath,
                    fileName: file,
                    tier: tierName,
                    ruleIndex: i,
                    errorType: 'regex_compilation',
                    message: '无效的正则表达式',
                    details: `Pattern: ${argsPattern}\nError: ${error.message}`,
                  });
                  continue;
                }
              }

              rules.push(policyRule);
            }
          }
        }
      } catch (e) {
        const error = e as NodeJS.ErrnoException;
        if (error.code !== 'ENOENT') {
          errors.push({
            filePath,
            fileName: file,
            tier: tierName,
            errorType: 'file_read',
            message: '无法读取策略文件',
            details: error.message,
          });
        }
      }
    }
  }

  return { rules, errors };
}
