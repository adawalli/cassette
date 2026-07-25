import { z } from "zod";
import pkg from "../package.json";
import { initConfigFile, loadConfig, resolveConfigPath } from "./config";
import { createOpenAILlmClient } from "./llm";
import { logger } from "./logger";
import { isEnoent } from "./paths";
import { runBackfill, runService } from "./service";

const VERSION = pkg.version;

type CliCommand = "run" | "init" | "help" | "version";

type CliArgs = {
  command: CliCommand;
  configPath?: string;
  once: boolean;
  force: boolean;
  debug: boolean;
};

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { command: "run", once: false, force: false, debug: false };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--version" || value === "-V") {
      args.command = "version";
      continue;
    }
    if (value === "help" || value === "--help" || value === "-h") {
      args.command = "help";
      continue;
    }
    if (value === "init") {
      args.command = "init";
      continue;
    }
    if (value === "--once") {
      args.once = true;
      continue;
    }
    if (value === "--force") {
      args.force = true;
      continue;
    }
    if (value === "--debug") {
      args.debug = true;
      continue;
    }
    if (value === "--config") {
      args.configPath = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

export function helpText(): string {
  return [
    "Usage:",
    "  cassette [--config <path>] [--once]",
    "  cassette init [--config <path>] [--force]",
    "  cassette --help",
    "",
    "Commands:",
    "  init     Create a starter config file at the resolved config path.",
    "",
    "Options:",
    "  --config <path>  Override config file location.",
    "  --once           Process existing files and exit.",
    "  --debug          Enable verbose debug output.",
    "  --force          Overwrite config when used with init.",
    "  --version, -V    Show version.",
    "  --help, -h       Show this help.",
  ].join("\n");
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  if (args.command === "version") {
    console.log(`cassette v${VERSION}`);
    return;
  }
  if (args.command === "help") {
    console.log(helpText());
    return;
  }

  if (args.command === "init") {
    const configPath = args.configPath ?? resolveConfigPath(process.env);
    const result = await initConfigFile(configPath, { force: args.force });
    if (result === "exists") {
      console.log(`Config already exists at ${configPath}`);
      console.log("Use --force to overwrite.");
      return;
    }
    console.log(
      result === "created"
        ? `Created config at ${configPath}`
        : `Overwrote config at ${configPath}`,
    );
    return;
  }

  if (args.debug) {
    logger.setLevel("debug");
  }

  logger.info(`cassette v${VERSION}`);

  const resolvedConfigPath = args.configPath ?? resolveConfigPath(process.env);
  let config;
  try {
    config = await loadConfig(resolvedConfigPath);
  } catch (error) {
    if (isEnoent(error)) {
      throw new Error(
        `Config not found at ${resolvedConfigPath}. Run 'cassette init' to create one.`,
      );
    }
    if (error instanceof z.ZodError) {
      // A raw ZodError dump is unreadable; show which keys are wrong.
      throw new Error(`Invalid config at ${resolvedConfigPath}:\n${z.prettifyError(error)}`);
    }
    throw error;
  }

  const llmClient = createOpenAILlmClient(process.env);

  if (args.once) {
    await runBackfill(config, { llmClient });
    return;
  }

  const { stop, onIdle } = await runService(config, { llmClient });

  // Drain in-flight work so a signal cannot leave a half-written .md behind.
  // A second signal gives up and exits immediately.
  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) {
      process.exit(1);
    }
    shuttingDown = true;
    logger.info("shutting down, waiting for in-flight work...");
    stop();
    await onIdle();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}
