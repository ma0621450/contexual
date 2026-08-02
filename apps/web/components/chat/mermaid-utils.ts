/**
 * Mermaid treats parentheses inside unquoted labels as shape syntax.
 * Quote labels that contain special characters: A[factorial(3)] → A["factorial(3)"]
 */
export function sanitizeMermaidSource(source: string): string {
  let next = source.replace(/\r\n/g, '\n').trim();

  const quoteIfNeeded = (label: string): string => {
    const trimmed = label.trim();
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      return trimmed;
    }
    if (!/[(){}[\]<>|"]/.test(trimmed)) {
      return trimmed;
    }
    return `"${trimmed.replace(/"/g, "'")}"`;
  };

  // Square labels: Node[label]
  next = next.replace(
    /(\b[\w.-]+)\s*\[\s*(?!")([^\]\n]*?)\s*\]/g,
    (_match, id: string, label: string) => `${id}[${quoteIfNeeded(label)}]`,
  );

  // Diamond labels: Node{label}
  next = next.replace(
    /(\b[\w.-]+)\s*\{\s*(?!")([^}\n]*?)\s*\}/g,
    (_match, id: string, label: string) => `${id}{${quoteIfNeeded(label)}}`,
  );

  // Stadium / rounded labels: Node(label) — only when label contains nested parens
  next = next.replace(
    /(\b[\w.-]+)\s*\(\s*(?!")([^)\n]*\([^)\n]*\)[^)\n]*)\s*\)/g,
    (_match, id: string, label: string) => `${id}(${quoteIfNeeded(label)})`,
  );

  return next;
}

export function isMermaidSourceReady(source: string): boolean {
  const trimmed = source.trim();
  if (trimmed.length < 8) return false;

  // Only gate clearly incomplete streaming fragments.
  if (/\[[^\]]*$/.test(trimmed)) return false;
  if (/\{[^}]*$/.test(trimmed)) return false;
  if (/(?:-->|---|==>|--)\s*$/.test(trimmed)) return false;

  const openSquares = (trimmed.match(/\[/g) ?? []).length;
  const closeSquares = (trimmed.match(/\]/g) ?? []).length;
  return openSquares === closeSquares;
}
