import { JSONPath } from "jsonpath-plus";
import { TranscriptUnitSchema, type TranscriptConfig, type TranscriptUnit } from "./schemas";

function toTranscriptUnit(
  value: unknown,
  index: number,
  transcriptConfig: TranscriptConfig,
): TranscriptUnit {
  if (typeof value === "string") {
    return TranscriptUnitSchema.parse({ text: value.trim(), index });
  }

  if (typeof value !== "object" || value === null) {
    throw new Error(`Unsupported transcript item type at index ${index}`);
  }

  const textField = transcriptConfig.text_field ?? "text";
  const speakerField = transcriptConfig.speaker_field ?? "speaker";
  const obj = value as Record<string, unknown>;
  const textValue = obj[textField];

  if (typeof textValue !== "string" || textValue.trim().length === 0) {
    throw new Error(`Transcript text field '${textField}' missing or invalid at index ${index}`);
  }

  const speakerValue = obj[speakerField];
  return TranscriptUnitSchema.parse({
    speaker:
      typeof speakerValue === "string" && speakerValue.trim().length > 0
        ? speakerValue.trim()
        : undefined,
    text: textValue.trim(),
    index,
  });
}

export function extractTranscriptUnits(
  json: unknown,
  transcriptConfig: TranscriptConfig,
): TranscriptUnit[] {
  const matches = JSONPath({
    path: transcriptConfig.path,
    json,
    wrap: true,
  }) as unknown[];

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
