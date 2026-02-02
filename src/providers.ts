/**
 * Field CLI - LLM Provider Configuration
 * 支持 MiniMax, DeepSeek, Kimi, OpenAI, Claude, Qwen, Gemini, Custom 等
 */

export interface Provider {
  name: string;
  displayName: string;
  baseUrl: string;
  defaultModel: string;
  envKey: string;
  models: string[];
  isCustom?: boolean;
}

export const PROVIDERS: Record<string, Provider> = {
  minimax: {
    name: 'minimax',
    displayName: 'MiniMax',
    baseUrl: 'https://api.minimaxi.com/v1',
    defaultModel: 'MiniMax-M2.1',
    envKey: 'MINIMAX_API_KEY',
    models: ['MiniMax-M2.1', 'MiniMax-M2.1-lightning', 'MiniMax-M2'],
  },
  deepseek: {
    name: 'deepseek',
    displayName: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    envKey: 'DEEPSEEK_API_KEY',
    models: ['deepseek-chat', 'deepseek-reasoner'],  // V3.2 和 V3.2-Speciale
  },
  kimi: {
    name: 'kimi',
    displayName: 'Kimi (Moonshot)',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'kimi-k2.5',
    envKey: 'MOONSHOT_API_KEY',
    models: ['kimi-k2.5', 'kimi-k2.5-thinking', 'moonshot-v1-128k', 'moonshot-v1-32k'],
  },
  openai: {
    name: 'openai',
    displayName: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4.1',
    envKey: 'OPENAI_API_KEY',
    models: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini'],
  },
  anthropic: {
    name: 'anthropic',
    displayName: 'Claude (Anthropic)',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-5-20250929',
    envKey: 'ANTHROPIC_API_KEY',
    models: ['claude-sonnet-4-5-20250929', 'claude-opus-4-5-20251124', 'claude-3-5-sonnet-20241022'],
  },
  qwen: {
    name: 'qwen',
    displayName: 'Qwen (Alibaba)',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen3-235b-a22b',
    envKey: 'QWEN_API_KEY',
    models: ['qwen3-235b-a22b', 'qwen3-32b', 'qwen3-next-80b', 'qwen-max', 'qwen-plus'],
  },
  gemini: {
    name: 'gemini',
    displayName: 'Gemini (Google)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.5-flash',
    envKey: 'GEMINI_API_KEY',
    models: ['gemini-3-pro-preview', 'gemini-3-flash-preview', 'gemini-2.5-pro', 'gemini-2.5-flash'],
  },
  together: {
    name: 'together',
    displayName: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    envKey: 'TOGETHER_API_KEY',
    models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'Qwen/Qwen2.5-72B-Instruct-Turbo', 'deepseek-ai/DeepSeek-V3'],
  },
  openrouter: {
    name: 'openrouter',
    displayName: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'anthropic/claude-sonnet-4.5',
    envKey: 'OPENROUTER_API_KEY',
    models: ['anthropic/claude-sonnet-4.5', 'anthropic/claude-opus-4.5', 'openai/gpt-4.1', 'google/gemini-2.5-pro'],
  },
  custom: {
    name: 'custom',
    displayName: 'Custom Provider',
    baseUrl: process.env.FIELD_CUSTOM_BASE_URL || 'http://localhost:8000/v1',
    defaultModel: process.env.FIELD_MODEL || 'custom-model',
    envKey: 'CUSTOM_API_KEY',
    models: [process.env.FIELD_MODEL || 'custom-model'],
    isCustom: true,
  },
};

export function getProvider(name: string): Provider | undefined {
  return PROVIDERS[name.toLowerCase()];
}

export function listProviders(): Provider[] {
  return Object.values(PROVIDERS);
}
