import { describe, expect, it } from "vitest";
import { sanitizeMarkdown } from "../markdown-sanitizer";

describe("sanitizeMarkdown", () => {
  it("escapes special symbols", () => {
    const input = "Hello! How are you?";
    const result = sanitizeMarkdown(input);
    expect(result).toBe("Hello\\! How are you?");
  });

  it("preserves single-line code blocks", () => {
    const input = "Use `console.log()` to debug";
    const result = sanitizeMarkdown(input);
    expect(result).toBe("Use `console.log()` to debug");
  });

  it("escapes backticks inside multiline code blocks", () => {
    const input = "```\ncode with `backticks`\n```";
    const result = sanitizeMarkdown(input);
    expect(result).toContain("\\`backticks\\`");
  });

  it("escapes special symbols in link labels", () => {
    const input = "Check [this link!](https://example.com)";
    const result = sanitizeMarkdown(input);
    expect(result).toContain("[this link\\!");
  });

  it("handles complex text with multiple special characters", () => {
    const input = "Price: $10.99 (50% off!)";
    const result = sanitizeMarkdown(input);
    // The sanitizer escapes: _*[]()~`>#+-=|{}.!
    expect(result).toMatch(/\\!/);
    expect(result).toMatch(/\\\(/);
    expect(result).toMatch(/\\\)/);
    expect(result).toMatch(/\\./);
    // $ and % are not in the special symbol regex
    expect(result).toContain("$");
    expect(result).toContain("%");
  });
});
