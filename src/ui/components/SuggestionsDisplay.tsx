/**
 * Suggestions Display - 细线边框风格
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { SlashCommand } from '../commands/types.js';

const MAX_SUGGESTIONS = 6;

interface SuggestionsDisplayProps {
  suggestions: SlashCommand[];
  selectedIndex: number;
  visible: boolean;
}

export function SuggestionsDisplay({
  suggestions,
  selectedIndex,
  visible,
}: SuggestionsDisplayProps): React.ReactElement | null {
  if (!visible || suggestions.length === 0) return null;

  const scrollOffset = Math.max(0, Math.min(
    selectedIndex - Math.floor(MAX_SUGGESTIONS / 2),
    suggestions.length - MAX_SUGGESTIONS
  ));

  const visibleSuggestions = suggestions.slice(scrollOffset, scrollOffset + MAX_SUGGESTIONS);

  return (
    <Box flexDirection="column" marginTop={0} marginLeft={2}>
      {visibleSuggestions.map((cmd, index) => {
        const actualIndex = scrollOffset + index;
        const isSelected = actualIndex === selectedIndex;

        return (
          <Box key={`${cmd.name}-${actualIndex}`} paddingX={1}>
            <Text color={isSelected ? 'blue' : 'white'} bold={isSelected}>
              {isSelected ? '❯ ' : '  '}
              {cmd.name.padEnd(14)}
            </Text>
            <Text color="gray">{cmd.description}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
