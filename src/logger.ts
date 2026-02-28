type Level = "debug" | "info" | "warn" | "error" | "silent";
const ORDER: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 };

function parseLevel(value: string | undefined): Level {
  return value && value in ORDER ? (value as Level) : "info";
}

let currentLevel: Level = parseLevel(process.env.LOG_LEVEL);

function log(level: Level, message: string): void {
  if (ORDER[level] < ORDER[currentLevel]) return;
  const line = `${new Date().toISOString()}  ${level.toUpperCase().padEnd(5)}  ${message}`;
  (level === "warn" || level === "error" ? console.error : console.log)(line);
}

export const logger = {
  setLevel(level: Level): void {
    currentLevel = level;
  },
  debug: (msg: string) => log("debug", msg),
  info: (msg: string) => log("info", msg),
  warn: (msg: string) => log("warn", msg),
  error: (msg: string) => log("error", msg),
};
