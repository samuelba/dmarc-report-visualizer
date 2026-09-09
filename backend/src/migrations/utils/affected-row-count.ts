export function affectedRowCount(result: unknown): number {
  if (result && typeof result === 'object') {
    const record = result as Record<string, unknown>;
    if (typeof record.rowCount === 'number') {
      return record.rowCount;
    }
    if (typeof record.affected === 'number') {
      return record.affected;
    }
  }
  if (
    Array.isArray(result) &&
    result.length > 1 &&
    typeof result[1] === 'number'
  ) {
    return result[1];
  }
  return 0;
}
