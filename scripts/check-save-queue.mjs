import assert from "node:assert/strict";
import {
  SerializedTaskQueue,
  withClosingState,
  withTimeout
} from "../src/notes/saveQueue.ts";

const queue = new SerializedTaskQueue();
const order = [];
const first = queue.enqueue(async () => {
  order.push("first-start");
  await Promise.resolve();
  order.push("first-end");
  return 1;
});
const second = queue.enqueue(async () => {
  order.push("second");
  return 2;
});

assert.equal(await first, 1);
assert.equal(await second, 2);
assert.deepEqual(order, ["first-start", "first-end", "second"]);

await assert.rejects(
  queue.enqueue(async () => {
    throw new Error("expected save failure");
  }),
  /expected save failure/
);
assert.equal(
  await queue.enqueue(async () => 3),
  3,
  "a failed save must not block the next queued save"
);

const closingStates = [];
await assert.rejects(
  withClosingState(
    (closing) => closingStates.push(closing),
    async () => {
      throw new Error("close save failed");
    }
  ),
  /close save failed/
);
assert.deepEqual(closingStates, [true, false], "a failed close must re-enable the close button");

await assert.rejects(
  withTimeout(new Promise(() => undefined), 10, "save timed out"),
  /save timed out/
);

console.log("Serialized save queue and close-state checks passed.");
