export function reorderArray<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  const next = [...items];
  const [removed] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, removed);
  return next;
}
