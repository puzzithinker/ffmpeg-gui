export function extractFileName(filePath: string): string {
  return filePath.split(/[/\\]/).pop() || '';
}
