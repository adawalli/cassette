import { TranscriptUnitSchema, type TranscriptUnit } from "./schemas";

const TIMESTAMP_RE = /^\d{2}:\d{2}:\d{2}\.\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}\.\d{3}/;
const SPEAKER_TAG_RE = /^<v\s+([^>]+)>/;
const ALL_TAGS_RE = /<[^>]+>/g;

interface ParsedCue {
  speaker: string | undefined;
  text: string;
}

function parseCueBlock(block: string): ParsedCue | null {
  const lines = block
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const tsIndex = lines.findIndex((l) => TIMESTAMP_RE.test(l));
  if (tsIndex === -1) return null;

  const payloadLines = lines.slice(tsIndex + 1);
  if (payloadLines.length === 0) return null;

  const payload = payloadLines.join(" ");
  const speakerMatch = payload.match(SPEAKER_TAG_RE);
  const speaker = speakerMatch ? speakerMatch[1].trim() : undefined;
  const text = payload.replace(ALL_TAGS_RE, "").replace(/\s+/g, " ").trim();
  if (!text) return null;

  return { speaker, text };
}

export function extractVttTranscriptUnits(raw: string): TranscriptUnit[] {
  const content = raw.replace(/^\uFEFF/, "");

  if (!content.trim().startsWith("WEBVTT")) {
    throw new Error("Invalid VTT: missing WEBVTT header");
  }

  const blocks = content.split(/\n\s*\n/);
  const cueBlocks = blocks.slice(1);

  const cues: ParsedCue[] = [];
  for (const block of cueBlocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("NOTE")) continue;

    const cue = parseCueBlock(trimmed);
    if (cue) cues.push(cue);
  }

  if (cues.length === 0) {
    throw new Error("No cues found in VTT content");
  }

  const merged: TranscriptUnit[] = [];
  let current: { speaker: string | undefined; text: string } | null = null;

  for (const cue of cues) {
    if (current && current.speaker === cue.speaker) {
      current.text += " " + cue.text;
    } else {
      if (current) {
        merged.push(
          TranscriptUnitSchema.parse({
            speaker: current.speaker,
            text: current.text,
            index: merged.length,
          }),
        );
      }
      current = { speaker: cue.speaker, text: cue.text };
    }
  }

  if (current) {
    merged.push(
      TranscriptUnitSchema.parse({
        speaker: current.speaker,
        text: current.text,
        index: merged.length,
      }),
    );
  }

  return merged;
}
