import { main } from "./src/index";
import { logger } from "./src/logger";
import { errorMessage } from "./src/paths";

main().catch((error: unknown) => {
  // Startup failures are almost always a bad config or a missing key - show the message,
  // not a stack trace. `--debug` / LOG_LEVEL=debug still gets the full error.
  logger.error(errorMessage(error));
  logger.debug(String(error instanceof Error ? error.stack : error));
  process.exit(1);
});
