/**
 * Field CLI - Stable JSON Stringify
 * 稳定的 JSON 序列化（键排序 + 循环引用处理）
 */

/**
 * 生成稳定的、确定性的 JSON 字符串表示
 * 
 * 关键行为：
 * 1. 排序键：对象属性始终按字母顺序序列化
 * 2. 循环引用保护：检测并用 "[Circular]" 替换
 * 3. 符合 JSON 规范：undefined 和函数按规范处理
 * 4. 尊重 toJSON 方法
 * 
 * @param obj 要序列化的对象
 * @returns 确定性的 JSON 字符串
 */
export function stableStringify(obj: unknown): string {
  const stringify = (currentObj: unknown, ancestors: Set<unknown>): string => {
    // 处理原始类型和 null
    if (currentObj === undefined) {
      return 'null';
    }
    if (currentObj === null) {
      return 'null';
    }
    if (typeof currentObj === 'function') {
      return 'null';
    }
    if (typeof currentObj !== 'object') {
      return JSON.stringify(currentObj);
    }

    // 检查循环引用
    if (ancestors.has(currentObj)) {
      return '"[Circular]"';
    }

    ancestors.add(currentObj);

    try {
      // 检查并调用 toJSON 方法
      const objWithToJSON = currentObj as { toJSON?: () => unknown };
      if (typeof objWithToJSON.toJSON === 'function') {
        try {
          const jsonValue = objWithToJSON.toJSON();
          if (jsonValue === null) {
            return 'null';
          }
          return stringify(jsonValue, ancestors);
        } catch {
          // toJSON 抛出错误时，当作普通对象处理
        }
      }

      if (Array.isArray(currentObj)) {
        const items = currentObj.map((item) => {
          if (item === undefined || typeof item === 'function') {
            return 'null';
          }
          return stringify(item, ancestors);
        });
        return '[' + items.join(',') + ']';
      }

      // 处理对象 - 排序键并过滤 undefined/function 值
      const sortedKeys = Object.keys(currentObj).sort();
      const pairs: string[] = [];

      for (const key of sortedKeys) {
        const value = (currentObj as Record<string, unknown>)[key];
        if (value !== undefined && typeof value !== 'function') {
          pairs.push(JSON.stringify(key) + ':' + stringify(value, ancestors));
        }
      }

      return '{' + pairs.join(',') + '}';
    } finally {
      ancestors.delete(currentObj);
    }
  };

  return stringify(obj, new Set());
}
