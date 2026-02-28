import { describe, expect, test } from "bun:test";
import { extractVttTranscriptUnits } from "../src/vtt-extract";

const basicVtt = `WEBVTT

1
00:00:01.000 --> 00:00:03.000
<v Alice>Hello everyone, welcome to the meeting.</v>

2
00:00:03.500 --> 00:00:06.000
<v Bob>Thanks Alice, glad to be here.</v>
`;

describe("extractVttTranscriptUnits", () => {
  test("parses basic VTT with speaker tags into TranscriptUnit[]", () => {
    const units = extractVttTranscriptUnits(basicVtt);
    expect(units).toHaveLength(2);
    expect(units[0]).toEqual({
      speaker: "Alice",
      text: "Hello everyone, welcome to the meeting.",
      index: 0,
    });
    expect(units[1]).toEqual({ speaker: "Bob", text: "Thanks Alice, glad to be here.", index: 1 });
  });

  test("merges consecutive same-speaker cues", () => {
    const vtt = `WEBVTT

1
00:00:01.000 --> 00:00:03.000
<v Alice>First part of what I'm saying,</v>

2
00:00:03.000 --> 00:00:06.000
<v Alice>and here is the second part.</v>

3
00:00:06.500 --> 00:00:08.000
<v Bob>Got it.</v>
`;
    const units = extractVttTranscriptUnits(vtt);
    expect(units).toHaveLength(2);
    expect(units[0]).toEqual({
      speaker: "Alice",
      text: "First part of what I'm saying, and here is the second part.",
      index: 0,
    });
    expect(units[1]).toEqual({ speaker: "Bob", text: "Got it.", index: 1 });
  });

  test("handles cues without <v> tags (no speaker)", () => {
    const vtt = `WEBVTT

1
00:00:01.000 --> 00:00:02.000
Go.

2
00:00:03.000 --> 00:00:05.000
<v Alice>OK let's start.</v>
`;
    const units = extractVttTranscriptUnits(vtt);
    expect(units).toHaveLength(2);
    expect(units[0]).toEqual({ speaker: undefined, text: "Go.", index: 0 });
    expect(units[1]).toEqual({ speaker: "Alice", text: "OK let's start.", index: 1 });
  });

  test("strips VTT markup tags from text", () => {
    const vtt = `WEBVTT

1
00:00:01.000 --> 00:00:03.000
<v Alice><b>Bold text</b> and <i>italic</i> words.</v>
`;
    const units = extractVttTranscriptUnits(vtt);
    expect(units).toHaveLength(1);
    expect(units[0]?.text).toBe("Bold text and italic words.");
  });

  test("handles multi-line cue text (joins with space)", () => {
    const vtt = `WEBVTT

1
00:00:01.000 --> 00:00:05.000
<v Alice>This is a long sentence that
wraps across multiple lines in
the VTT file.</v>
`;
    const units = extractVttTranscriptUnits(vtt);
    expect(units).toHaveLength(1);
    expect(units[0]?.text).toBe(
      "This is a long sentence that wraps across multiple lines in the VTT file.",
    );
  });

  test("throws on empty input", () => {
    expect(() => extractVttTranscriptUnits("")).toThrow();
  });

  test("throws on invalid input (no WEBVTT header)", () => {
    expect(() => extractVttTranscriptUnits("not a vtt file\nsome text")).toThrow();
  });

  test("skips NOTE comment blocks", () => {
    const vtt = `WEBVTT

NOTE This is a comment
that spans multiple lines

1
00:00:01.000 --> 00:00:03.000
<v Alice>Hello.</v>
`;
    const units = extractVttTranscriptUnits(vtt);
    expect(units).toHaveLength(1);
    expect(units[0]).toEqual({ speaker: "Alice", text: "Hello.", index: 0 });
  });

  test("handles BOM prefix", () => {
    const vtt = `\uFEFFWEBVTT

1
00:00:01.000 --> 00:00:03.000
<v Alice>With BOM.</v>
`;
    const units = extractVttTranscriptUnits(vtt);
    expect(units).toHaveLength(1);
    expect(units[0]?.text).toBe("With BOM.");
  });

  test("handles UUID cue IDs, multi-cue merging, and speaker-less cues", () => {
    const vtt = `WEBVTT

aabbccdd-1111-2222-3333-444444444444/1-0
00:00:01.000 --> 00:00:03.000
<v Alice>First part</v>

aabbccdd-1111-2222-3333-444444444444/1-1
00:00:03.000 --> 00:00:05.000
<v Alice>and second part.</v>

aabbccdd-1111-2222-3333-444444444444/2-0
00:00:06.000 --> 00:00:07.000
<v Bob>Got it.</v>

aabbccdd-1111-2222-3333-444444444444/3-0
00:00:08.000 --> 00:00:09.000
OK.
`;
    const units = extractVttTranscriptUnits(vtt);
    expect(units).toHaveLength(3);
    expect(units[0]).toEqual({ speaker: "Alice", text: "First part and second part.", index: 0 });
    expect(units[1]).toEqual({ speaker: "Bob", text: "Got it.", index: 1 });
    expect(units[2]).toEqual({ speaker: undefined, text: "OK.", index: 2 });
  });
});
