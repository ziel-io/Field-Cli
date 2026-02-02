/**
 * Slash Command Completion Hook
 * 参考 gemini-cli-cognitive 的 useSlashCompletion.ts
 */

import { useMemo } from 'react';
import type { SlashCommand } from '../commands/types.js';

export interface CompletionState {
  isActive: boolean;
  query: string;
  suggestions: SlashCommand[];
  selectedIndex: number;
}

export interface UseSlashCompletionOptions {
  commands: SlashCommand[];
  text: string;
  cursorRow: number;
}

export interface UseSlashCompletionResult {
  isSlashCommand: boolean;
  query: string;
  suggestions: SlashCommand[];
  matchingCommands: SlashCommand[];
}

/**
 * 检测是否是 slash 命令
 */
export function isSlashCommandText(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith('/');
}

/**
 * 获取匹配的命令
 */
export function getMatchingCommands(
  commands: SlashCommand[],
  query: string
): SlashCommand[] {
  const trimmedQuery = query.trim().toLowerCase();
  
  if (!trimmedQuery.startsWith('/')) {
    return [];
  }
  
  // 精确匹配 '/' 返回所有命令
  if (trimmedQuery === '/') {
    return commands;
  }
  
  // 过滤匹配的命令
  return commands.filter(cmd => {
    const cmdName = cmd.name.toLowerCase();
    return cmdName.startsWith(trimmedQuery) || 
           cmdName.includes(trimmedQuery.slice(1));
  });
}

/**
 * Slash 命令补全 Hook
 */
export function useSlashCompletion(options: UseSlashCompletionOptions): UseSlashCompletionResult {
  const { commands, text, cursorRow } = options;
  
  return useMemo(() => {
    const lines = text.split('\n');
    const currentLine = lines[cursorRow] || '';
    const isSlashCommand = cursorRow === 0 && isSlashCommandText(currentLine);
    
    if (!isSlashCommand) {
      return {
        isSlashCommand: false,
        query: '',
        suggestions: [],
        matchingCommands: [],
      };
    }
    
    const query = currentLine.trim();
    const matchingCommands = getMatchingCommands(commands, query);
    
    return {
      isSlashCommand: true,
      query,
      suggestions: matchingCommands,
      matchingCommands,
    };
  }, [commands, text, cursorRow]);
}
