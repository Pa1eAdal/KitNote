export class SerializedTaskQueue {
  private tail: Promise<void> = Promise.resolve();

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task);
    this.tail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
}

export function withTimeout<T>(operation: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => reject(new Error(message)), timeoutMs);
    operation.then(
      (value) => {
        globalThis.clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        globalThis.clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

export async function withClosingState<T>(
  setClosing: (closing: boolean) => void,
  operation: () => Promise<T>
): Promise<T> {
  setClosing(true);
  try {
    return await operation();
  } finally {
    setClosing(false);
  }
}
