/**
 * Field CLI - Metrics Collector
 * Token 和性能统计
 */

import {
  ExecutionMetrics,
  AggregateMetrics,
  ModuleMetrics,
  ProviderMetrics,
} from '../types.js';

interface MetricEntry {
  timestamp: number;
  moduleName: string;
  provider: string;
  success: boolean;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  repaired: boolean;
  retryCount: number;
}

type MetricListener = (entry: MetricEntry) => void;

class MetricsCollector {
  private entries: MetricEntry[] = [];
  private listeners: MetricListener[] = [];
  private tokenLimit: number | null = null;
  private tokenWarningThreshold: number = 0.8;

  /**
   * 记录一次执行
   */
  record(
    moduleName: string,
    provider: string,
    metrics: ExecutionMetrics,
    success: boolean,
    repaired: boolean
  ): void {
    const entry: MetricEntry = {
      timestamp: Date.now(),
      moduleName,
      provider,
      success,
      latencyMs: metrics.latencyMs,
      promptTokens: metrics.promptTokens,
      completionTokens: metrics.completionTokens,
      totalTokens: metrics.totalTokens,
      repaired,
      retryCount: metrics.retryCount,
    };

    this.entries.push(entry);

    // 通知监听器
    for (const listener of this.listeners) {
      listener(entry);
    }

    // 检查 token 限制
    this.checkTokenLimit();
  }

  /**
   * 设置 token 限制
   */
  setLimit(limit: number, warningThreshold: number = 0.8): void {
    this.tokenLimit = limit;
    this.tokenWarningThreshold = warningThreshold;
  }

  /**
   * 清除 token 限制
   */
  clearLimit(): void {
    this.tokenLimit = null;
  }

  /**
   * 检查 token 限制
   */
  private checkTokenLimit(): void {
    if (!this.tokenLimit) return;

    const total = this.getTotalTokens();
    const ratio = total / this.tokenLimit;

    if (ratio >= 1) {
      console.warn(`⚠️  Token limit exceeded: ${this.formatTokens(total)} / ${this.formatTokens(this.tokenLimit)}`);
    } else if (ratio >= this.tokenWarningThreshold) {
      console.warn(`⚠️  Approaching token limit: ${this.formatTokens(total)} / ${this.formatTokens(this.tokenLimit)} (${Math.round(ratio * 100)}%)`);
    }
  }

  /**
   * 获取总 token 数
   */
  getTotalTokens(): number {
    return this.entries.reduce((sum, e) => sum + e.totalTokens, 0);
  }

  /**
   * 格式化 token 数
   */
  formatTokens(tokens: number): string {
    if (tokens >= 1000000) {
      return `${(tokens / 1000000).toFixed(1)}M`;
    }
    if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}K`;
    }
    return tokens.toString();
  }

  /**
   * 获取聚合统计
   */
  getAggregate(): AggregateMetrics {
    const total = this.entries.length;
    if (total === 0) {
      return this.emptyMetrics();
    }

    const successes = this.entries.filter((e) => e.success);
    const latencies = this.entries.map((e) => e.latencyMs).sort((a, b) => a - b);
    const repairs = this.entries.filter((e) => e.repaired);

    // 按模块分组
    const byModule: Record<string, ModuleMetrics> = {};
    for (const entry of this.entries) {
      if (!byModule[entry.moduleName]) {
        byModule[entry.moduleName] = {
          name: entry.moduleName,
          executions: 0,
          successRate: 0,
          avgLatencyMs: 0,
          totalTokens: 0,
        };
      }
      const m = byModule[entry.moduleName];
      m.executions++;
      m.totalTokens += entry.totalTokens;
    }

    // 计算模块成功率和平均延迟
    for (const name of Object.keys(byModule)) {
      const moduleEntries = this.entries.filter((e) => e.moduleName === name);
      const moduleSuccesses = moduleEntries.filter((e) => e.success);
      byModule[name].successRate = moduleSuccesses.length / moduleEntries.length;
      byModule[name].avgLatencyMs =
        moduleEntries.reduce((sum, e) => sum + e.latencyMs, 0) / moduleEntries.length;
    }

    // 按 Provider 分组
    const byProvider: Record<string, ProviderMetrics> = {};
    for (const entry of this.entries) {
      if (!byProvider[entry.provider]) {
        byProvider[entry.provider] = {
          name: entry.provider,
          requests: 0,
          totalTokens: 0,
          avgLatencyMs: 0,
        };
      }
      const p = byProvider[entry.provider];
      p.requests++;
      p.totalTokens += entry.totalTokens;
    }

    // 计算 Provider 平均延迟
    for (const name of Object.keys(byProvider)) {
      const providerEntries = this.entries.filter((e) => e.provider === name);
      byProvider[name].avgLatencyMs =
        providerEntries.reduce((sum, e) => sum + e.latencyMs, 0) / providerEntries.length;
    }

    return {
      totalExecutions: total,
      successCount: successes.length,
      failureCount: total - successes.length,
      successRate: successes.length / total,
      avgLatencyMs: latencies.reduce((a, b) => a + b, 0) / total,
      p50LatencyMs: this.percentile(latencies, 0.5),
      p95LatencyMs: this.percentile(latencies, 0.95),
      p99LatencyMs: this.percentile(latencies, 0.99),
      totalTokens: this.entries.reduce((sum, e) => sum + e.totalTokens, 0),
      totalPromptTokens: this.entries.reduce((sum, e) => sum + e.promptTokens, 0),
      totalCompletionTokens: this.entries.reduce((sum, e) => sum + e.completionTokens, 0),
      repairRate: repairs.length / total,
      byModule,
      byProvider,
    };
  }

  /**
   * 计算百分位数
   */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil(p * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * 空统计
   */
  private emptyMetrics(): AggregateMetrics {
    return {
      totalExecutions: 0,
      successCount: 0,
      failureCount: 0,
      successRate: 0,
      avgLatencyMs: 0,
      p50LatencyMs: 0,
      p95LatencyMs: 0,
      p99LatencyMs: 0,
      totalTokens: 0,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      repairRate: 0,
      byModule: {},
      byProvider: {},
    };
  }

  /**
   * 添加监听器
   */
  addListener(listener: MetricListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * 重置统计
   */
  reset(): void {
    this.entries = [];
  }

  /**
   * 获取 token 使用状态
   */
  getTokenStatus(): {
    used: number;
    limit: number | null;
    remaining: number | null;
    percentage: number | null;
    warning: boolean;
    exceeded: boolean;
  } {
    const used = this.getTotalTokens();
    const limit = this.tokenLimit;

    if (!limit) {
      return {
        used,
        limit: null,
        remaining: null,
        percentage: null,
        warning: false,
        exceeded: false,
      };
    }

    const remaining = Math.max(0, limit - used);
    const percentage = (used / limit) * 100;

    return {
      used,
      limit,
      remaining,
      percentage,
      warning: percentage >= this.tokenWarningThreshold * 100,
      exceeded: used >= limit,
    };
  }
}

// 单例
export const metricsCollector = new MetricsCollector();
