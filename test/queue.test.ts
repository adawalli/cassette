import { describe, expect, test } from "bun:test";
import { SerialQueue } from "../src/queue";

describe("SerialQueue", () => {
  test("tasks execute serially", async () => {
    const order: number[] = [];
    const queue = new SerialQueue();

    queue.enqueue(async () => {
      await Bun.sleep(30);
      order.push(1);
    });
    queue.enqueue(async () => {
      order.push(2);
    });
    queue.enqueue(async () => {
      await Bun.sleep(10);
      order.push(3);
    });

    await queue.onIdle();
    expect(order).toEqual([1, 2, 3]);
  });

  test("error in one task does not prevent subsequent tasks", async () => {
    const order: number[] = [];
    const queue = new SerialQueue();

    queue.enqueue(async () => {
      order.push(1);
    });
    queue.enqueue(async () => {
      throw new Error("boom");
    });
    queue.enqueue(async () => {
      order.push(3);
    });

    await queue.onIdle();
    expect(order).toEqual([1, 3]);
  });

  test("onIdle resolves after all queued tasks complete", async () => {
    let finished = false;
    const queue = new SerialQueue();

    queue.enqueue(async () => {
      await Bun.sleep(50);
      finished = true;
    });

    await queue.onIdle();
    expect(finished).toBe(true);
  });

  test("onIdle on empty queue resolves immediately", async () => {
    const queue = new SerialQueue();
    await queue.onIdle();
    // if we get here without hanging, the test passes
    expect(true).toBe(true);
  });
});
