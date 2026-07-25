import { JSONPath } from "jsonpath-plus";
import type { TranscriptConfig, TranscriptUnit } from "./schemas";

function toTranscriptUnit(
  value: unknown,
  index: number,
  transcriptConfig: TranscriptConfig,
): TranscriptUnit {
  if (typeof value === "string") {
    const text = value.trim();
    if (text.length === 0) {
      throw new Error(`Transcript text is empty at index ${index}`);
    }
    return { text, index };
  }

  if (typeof value !== "object" || value === null) {
    throw new Error(`Unsupported transcript item type at index ${index}`);
  }

  const { text_field: textField, speaker_field: speakerField } = transcriptConfig;
  const obj = value as Record<string, unknown>;
  const textValue = obj[textField];

  if (typeof textValue !== "string" || textValue.trim().length === 0) {
    throw new Error(`Transcript text field '${textField}' missing or invalid at index ${index}`);
  }

  const speakerValue = obj[speakerField];
  return {
    speaker: typeof speakerValue === "string" ? speakerValue.trim() || undefined : undefined,
    text: textValue.trim(),
    index,
  };
}

export function extractTranscriptUnits(
  json: unknown,
  transcriptConfig: TranscriptConfig,
): TranscriptUnit[] {
  const matches: unknown[] = JSONPath({
    path: transcriptConfig.path,
    json: json as object,
    wrap: true,
  });

  if (matches.length === 0) {
    throw new Error(`No transcript entries matched JSONPath '${transcriptConfig.path}'`);
  }

  return matches.map((item, index) => toTranscriptUnit(item, index, transcriptConfig));
}

export function renderTranscript(units: TranscriptUnit[]): string {
  return units
    .map((unit) => (unit.speaker ? `${unit.speaker}: ${unit.text}` : unit.text))
    .join("\n");
}
