/**
 * Field CLI - Policy Utils
 * 策略工具函数
 */

/**
 * 转义正则表达式特殊字符
 */
export function escapeRegex(text: string): string {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s"]/g, '\\$&');
}

/**
 * 构建参数匹配模式
 * 
 * @param argsPattern 原始正则字符串
 * @param commandPrefix 命令前缀
 * @param commandRegex 命令正则
 * @returns 模式字符串数组
 */
export function buildArgsPatterns(
  argsPattern?: string,
  commandPrefix?: string | string[],
  commandRegex?: string,
): Array<string | undefined> {
  if (commandPrefix) {
    const prefixes = Array.isArray(commandPrefix)
      ? commandPrefix
      : [commandPrefix];

    // 展开命令前缀为多个模式
    // 添加 [\s"] 确保匹配整个单词（如 "git" 而不是 "github"）
    return prefixes.map((prefix) => {
      const jsonPrefix = JSON.stringify(prefix).slice(1, -1);
      return `"command":"${escapeRegex(jsonPrefix)}(?:[\\s"]|\\\\")`;
    });
  }

  if (commandRegex) {
    return [`"command":"${commandRegex}`];
  }

  return [argsPattern];
}
