import { describe, expect, test } from "bun:test";
import { extractTranscriptUnits, renderTranscript } from "../src/extract";

describe("extractTranscriptUnits", () => {
  test("extracts mapped object transcript units", () => {
    const input = {
      meeting: {
        segments: [
          { speaker: "Alice", text: "Hello there" },
          { speaker: "Bob", text: "Sounds good" },
        ],
      },
    };
    const units = extractTranscriptUnits(input, {
      path: "$.meeting.segments[*]",
      speaker_field: "speaker",
      text_field: "text",
    });
    expect(units.length).toBe(2);
    expect(units[0]?.speaker).toBe("Alice");
    expect(units[1]?.text).toBe("Sounds good");
  });

  test("extracts plain string transcript units", () => {
    const input = { lines: ["first line", "second line"] };
    const units = extractTranscriptUnits(input, {
      path: "$.lines[*]",
      text_field: "text",
    });
    expect(units[0]?.text).toBe("first line");
    expect(units[0]?.speaker).toBeUndefined();
  });

  test("throws if JSONPath does not match", () => {
    expect(() =>
      extractTranscriptUnits(
        { items: [] },
        {
          path: "$.missing[*]",
          text_field: "text",
        },
      ),
    ).toThrow();
  });
});

describe("renderTranscript", () => {
  test("renders with speaker prefix when present", () => {
    const rendered = renderTranscript([
      { index: 0, speaker: "Alice", text: "Hello" },
      { index: 1, text: "No speaker" },
    ]);
    expect(rendered).toBe("Alice: Hello\nNo speaker");
  });
});
