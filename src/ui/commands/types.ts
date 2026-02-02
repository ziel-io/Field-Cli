/**
 * Slash Command Types
 * 参考 gemini-cli-cognitive 的命令系统
 */

export interface SlashCommand {
  name: string;
  description: string;
  aliases?: string[];
  subcommands?: SlashCommand[];
  execute?: (args: string[]) => Promise<void> | void;
}

export interface CommandContext {
  addMessage: (role: string, content: string) => void;
  setView: (view: string) => void;
  exit: () => void;
  clearHistory: () => void;
  currentProvider: { displayName: string } | null;
}
