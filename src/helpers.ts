export const time = async <T>(
  fn: () => Promise<T>
): Promise<[result: T, time: number]> => {
  const start = Date.now();
  const result = await fn();
  const time = Date.now() - start;
  return [result, time];
};
