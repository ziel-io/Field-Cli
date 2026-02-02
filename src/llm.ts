/**
 * Field CLI - LLM Client
 * 统一的 OpenAI 兼容 API 客户端，支持 Function Calling
 */

import { Provider } from './providers.js';

// =============================================================================
// 基础消息类型
// =============================================================================

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;  // tool 角色消息需要
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  tools?: ToolDefinition[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
}

// =============================================================================
// Function Calling 类型
// =============================================================================

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;  // JSON string
  };
}

export interface ChatResponse {
  content: string;
  toolCalls?: ToolCall[];
  finishReason?: 'stop' | 'tool_calls' | 'length';
}

export class LLMClient {
  private provider: Provider;
  private apiKey: string;
  private model: string;

  constructor(provider: Provider, apiKey: string, model?: string) {
    this.provider = provider;
    this.apiKey = apiKey;
    this.model = model || provider.defaultModel;
  }

  /**
   * 流式聊天
   */
  async *chat(
    messages: Message[],
    options: ChatOptions = {}
  ): AsyncGenerator<string> {
    // Anthropic 使用独立的 API 格式
    if (this.provider.name === 'anthropic') {
      yield* this.chatAnthropic(messages, options);
      return;
    }

    const url = `${this.provider.baseUrl}/chat/completions`;
    const isMiniMax = this.provider.name === 'minimax';
    
    // 推理模型需要 temperature=1
    const isReasoningModel = this.isReasoningModel();
    
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: options.temperature ?? (isReasoningModel ? 1 : 0.7),
      max_tokens: options.maxTokens ?? 4096,
      stream: true,
    };

    // MiniMax 关键参数：分离思考内容到 reasoning_details 字段
    if (isMiniMax) {
      body.reasoning_split = true;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error (${response.status}): ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';
    
    // MiniMax 流式响应是累积模式，需要追踪上次的内容长度
    let lastContentLength = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          
          const data = line.slice(6).trim();
          if (data === '[DONE]' || !data) continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;
            if (!delta) continue;

            // MiniMax 使用 reasoning_split=true 后：
            // - 思考内容在 reasoning_details 字段（我们忽略）
            // - 正常内容在 content 字段
            
            // 跳过 reasoning_details（思考内容）
            // 只处理 content（正常回复）
            
            const content = delta.content;
            if (content === null || content === undefined) continue;

            if (isMiniMax) {
              // MiniMax 累积模式：每次 content 是完整的累积内容
              // 计算新增的部分
              const newContent = content.slice(lastContentLength);
              lastContentLength = content.length;
              
              if (newContent) {
                // 额外过滤可能残留的 <think> 标签
                const filtered = this.filterThinkTags(newContent);
                if (filtered) yield filtered;
              }
            } else {
              // 其他 Provider：标准增量模式
              const filtered = this.filterThinkTags(content);
              if (filtered) yield filtered;
            }
          } catch {
            // 忽略 JSON 解析错误
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * 检测是否是推理模型（需要 temperature=1）
   */
  private isReasoningModel(): boolean {
    const model = this.model.toLowerCase();
    // Kimi K2.5 系列
    if (model.includes('k2.5') || model.includes('kimi-k2')) return true;
    // DeepSeek Reasoner
    if (model.includes('reasoner')) return true;
    // OpenAI o1/o3 系列
    if (model.startsWith('o1') || model.startsWith('o3')) return true;
    // Gemini Thinking
    if (model.includes('thinking')) return true;
    return false;
  }

  /**
   * 过滤可能残留的思考标签
   */
  private filterThinkTags(text: string): string {
    // 移除完整的 <think>...</think>
    let result = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
    // 移除未闭合的 <think> 开始标签及其后续内容
    const idx = result.toLowerCase().indexOf('<think');
    if (idx !== -1) {
      result = result.slice(0, idx);
    }
    // 移除残留的 </think>
    result = result.replace(/<\/think>/gi, '');
    return result;
  }

  /**
   * Anthropic API 专用处理
   */
  private async *chatAnthropic(
    messages: Message[],
    options: ChatOptions = {}
  ): AsyncGenerator<string> {
    const url = `${this.provider.baseUrl}/messages`;
    
    // 分离 system 消息
    const systemMessages = messages.filter(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');
    
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: options.maxTokens ?? 4096,
      stream: true,
      messages: otherMessages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    };

    // Anthropic 的 system 是顶层参数
    if (systemMessages.length > 0) {
      body.system = systemMessages.map(m => m.content).join('\n\n');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': this.apiKey,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API Error (${response.status}): ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          
          const data = line.slice(6).trim();
          if (!data || data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            
            // Anthropic 的事件类型
            if (parsed.type === 'content_block_delta') {
              const text = parsed.delta?.text;
              if (text) {
                yield text;
              }
            }
          } catch {
            // 忽略 JSON 解析错误
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * 非流式聊天
   */
  async chatSync(messages: Message[], options: ChatOptions = {}): Promise<string> {
    let result = '';
    for await (const chunk of this.chat(messages, options)) {
      result += chunk;
    }
    return result;
  }

  /**
   * 带工具调用支持的非流式聊天
   * 返回完整响应，包括可能的 tool_calls
   */
  async chatWithTools(
    messages: Message[],
    options: ChatOptions = {}
  ): Promise<ChatResponse> {
    // Anthropic 使用独立的 API 格式
    if (this.provider.name === 'anthropic') {
      return this.chatWithToolsAnthropic(messages, options);
    }

    const url = `${this.provider.baseUrl}/chat/completions`;
    
    // 推理模型需要 temperature=1
    const isReasoningModel = this.isReasoningModel();
    
    const body: Record<string, unknown> = {
      model: this.model,
      messages: this.formatMessages(messages),
      temperature: options.temperature ?? (isReasoningModel ? 1 : 0.7),
      max_tokens: options.maxTokens ?? 4096,
      stream: false,
    };

    // 添加工具定义
    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools;
      body.tool_choice = options.tool_choice ?? 'auto';
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as {
      choices: Array<{
        message: {
          content?: string;
          tool_calls?: ToolCall[];
        };
        finish_reason: string;
      }>;
    };

    const choice = data.choices?.[0];
    if (!choice) {
      throw new Error('No response from API');
    }

    const result: ChatResponse = {
      content: choice.message.content || '',
      finishReason: choice.finish_reason as ChatResponse['finishReason'],
    };

    // 检查是否有工具调用
    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      result.toolCalls = choice.message.tool_calls;
    }

    return result;
  }

  /**
   * Anthropic 工具调用支持
   */
  private async chatWithToolsAnthropic(
    messages: Message[],
    options: ChatOptions = {}
  ): Promise<ChatResponse> {
    const url = `${this.provider.baseUrl}/messages`;
    
    // 分离 system 消息
    const systemMessages = messages.filter(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');
    
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: options.maxTokens ?? 4096,
      messages: this.formatAnthropicMessages(otherMessages),
    };

    // Anthropic 的 system 是顶层参数
    if (systemMessages.length > 0) {
      body.system = systemMessages.map(m => m.content).join('\n\n');
    }

    // Anthropic 工具格式
    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools.map(t => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      }));
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': this.apiKey,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API Error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as {
      content: Array<{
        type: string;
        text?: string;
        id?: string;
        name?: string;
        input?: unknown;
      }>;
      stop_reason: string;
    };

    // 解析 Anthropic 响应
    let content = '';
    const toolCalls: ToolCall[] = [];

    for (const block of data.content) {
      if (block.type === 'text') {
        content += block.text || '';
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id || `call_${Date.now()}`,
          type: 'function',
          function: {
            name: block.name || '',
            arguments: JSON.stringify(block.input),
          },
        });
      }
    }

    const result: ChatResponse = {
      content,
      finishReason: data.stop_reason === 'tool_use' ? 'tool_calls' : 'stop',
    };

    if (toolCalls.length > 0) {
      result.toolCalls = toolCalls;
    }

    return result;
  }

  /**
   * 格式化消息（处理 tool 角色）
   */
  private formatMessages(messages: Message[]): Array<Record<string, unknown>> {
    return messages.map(m => {
      const formatted: Record<string, unknown> = {
        role: m.role,
        content: m.content,
      };
      
      // assistant 消息可能包含 tool_calls
      if (m.role === 'assistant' && m.tool_calls) {
        formatted.tool_calls = m.tool_calls;
      }
      
      // tool 消息需要 tool_call_id
      if (m.role === 'tool' && m.tool_call_id) {
        formatted.tool_call_id = m.tool_call_id;
      }
      
      return formatted;
    });
  }

  /**
   * 格式化 Anthropic 消息
   */
  private formatAnthropicMessages(messages: Message[]): Array<Record<string, unknown>> {
    return messages.map(m => {
      if (m.role === 'tool') {
        // Anthropic tool 结果格式
        return {
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: m.tool_call_id,
            content: m.content,
          }],
        };
      }
      
      if (m.role === 'assistant' && m.tool_calls) {
        // Anthropic assistant 带工具调用
        const content: Array<Record<string, unknown>> = [];
        if (m.content) {
          content.push({ type: 'text', text: m.content });
        }
        for (const tc of m.tool_calls) {
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments),
          });
        }
        return { role: 'assistant', content };
      }
      
      return {
        role: m.role,
        content: m.content,
      };
    });
  }
}
