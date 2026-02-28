import { logger } from "./logger";

export class SerialQueue {
  private chain: Promise<void> = Promise.resolve();

  enqueue(task: () => Promise<void>): void {
    this.chain = this.chain.then(task).catch((error) => {
      logger.error(
        `[queue] task failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  async onIdle(): Promise<void> {
    await this.chain;
  }
}
