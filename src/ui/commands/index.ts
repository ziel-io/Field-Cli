/**
 * Slash Commands Registry
 */

import type { SlashCommand } from './types.js';

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: '/help',
    description: 'Show help and available commands',
    aliases: ['/h', '/?'],
  },
  {
    name: '/model',
    description: 'Switch LLM provider and model',
    aliases: ['/m'],
  },
  {
    name: '/api',
    description: 'Change API key for current provider',
  },
  {
    name: '/cog',
    description: 'Cognitive module commands',
    subcommands: [
      { name: '/cog list', description: 'List all available modules' },
      { name: '/cog info', description: 'Show module details' },
      { name: '/cog install', description: 'Install module from GitHub' },
      { name: '/cog remove', description: 'Remove a module' },
      { name: '/cog validate', description: 'Validate module schema' },
    ],
  },
  {
    name: '/tokens',
    description: 'Show token usage statistics',
    aliases: ['/t'],
  },
  {
    name: '/stats',
    description: 'Show session statistics',
    aliases: ['/s'],
  },
  {
    name: '/history',
    description: 'Show conversation history',
  },
  {
    name: '/clear',
    description: 'Clear conversation history',
    aliases: ['/c'],
  },
  {
    name: '/fie',
    description: 'Advanced Field CLI commands',
    subcommands: [
      { name: '/fie auto', description: 'Toggle auto-invoke modules' },
      { name: '/fie auto on', description: 'Enable auto-invoke' },
      { name: '/fie auto off', description: 'Disable auto-invoke' },
      { name: '/fie tokens', description: 'Token management' },
      { name: '/fie tokens limit', description: 'Set token limit' },
      { name: '/fie tokens reset', description: 'Reset token counter' },
    ],
  },
  {
    name: '/quit',
    description: 'Exit Field CLI',
    aliases: ['/q', '/exit'],
  },
];

/**
 * 获取所有命令（展开子命令）
 */
export function getAllCommands(): SlashCommand[] {
  const result: SlashCommand[] = [];
  
  for (const cmd of SLASH_COMMANDS) {
    result.push(cmd);
    if (cmd.subcommands) {
      result.push(...cmd.subcommands);
    }
  }
  
  return result;
}

export { type SlashCommand, type CommandContext } from './types.js';
