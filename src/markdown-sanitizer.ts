const MULTILINE_CODE_REGEX = '(?<=\\n|^)```.*\\n?((?:.|\\n)*?)(?:\\n```)'
const SINGLE_LINE_CODE_REGEX = '(`.*?`)'
const LINK_REGEX = '\\[(.*?)\\]\\((.*?)\\)'
const SPECIAL_SYMBOL_REGEX = '([_*\\[\\]()~`>#+\\-=|{}.!])'

/**
 * Sanitize markdown input for Telegram MarkdownV2
 * - Detect multiline code blocks and escape backticks inside
 * - Detect single line code blocks without escaping anything inside
 * - Detect links and escape special symbols inside them
 * - Detect all other special symbols and escape them
 *
 * @param input - markdown input (maybe invalid markdown)
 * @returns sanitized markdown (always valid markdown)
 */
export function sanitizeMarkdown(input: string): string {
  const regex = new RegExp(
    [
      MULTILINE_CODE_REGEX,
      SINGLE_LINE_CODE_REGEX,
      LINK_REGEX,
      SPECIAL_SYMBOL_REGEX,
    ].join('|'),
    'g',
  )

  return input.replace(
    regex,
    (
      match,
      multilineCodeContent: string | undefined,
      singleLineCode: string | undefined,
      linkLabel: string | undefined,
      linkUrl: string | undefined,
      specialSymbol: string | undefined,
    ) => {
      if (multilineCodeContent) {
        return match.replace(
          multilineCodeContent,
          multilineCodeContent.replace(/`/g, '\\`'),
        )
      }

      if (singleLineCode) return singleLineCode

      if (linkLabel && linkUrl) {
        return match.replace(
          linkLabel,
          linkLabel.replace(
            new RegExp(SPECIAL_SYMBOL_REGEX, 'g'),
            (symbol: string) => `\\${symbol}`,
          ),
        )
      }

      if (specialSymbol) return `\\${specialSymbol}`

      return match
    },
  )
}
