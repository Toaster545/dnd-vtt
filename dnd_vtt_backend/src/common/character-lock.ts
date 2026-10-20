// Runtime resource operations for a character and its companions share one queue.
const locks = new Map<string, Promise<void>>();
export async function withCharacterLock<T>(
  id: string,
  work: () => Promise<T>,
): Promise<T> {
  const previous = locks.get(id) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => current);
  locks.set(id, tail);
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (locks.get(id) === tail) locks.delete(id);
  }
}
