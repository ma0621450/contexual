export type AgentPlanTool =
  | { name: 'web_search'; query: string }
  | { name: 'read_url'; url: string }
  | { name: 'search_files'; query: string };

export function planAgentTools(
  query: string,
  webSearch: boolean,
): AgentPlanTool[] {
  const tools: AgentPlanTool[] = [];
  const urls = new Set<string>();

  for (const match of query.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    urls.add(match[0].replace(/[),.;!?]+$/g, ''));
  }

  const searchQuery = query
    .replace(/https?:\/\/[^\s<>"']+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (webSearch) {
    tools.push({
      name: 'web_search',
      query: (searchQuery || query).slice(0, 200),
    });
  }

  for (const url of [...urls].slice(0, 3)) {
    tools.push({ name: 'read_url', url });
  }

  if (query.trim().length >= 4) {
    tools.push({
      name: 'search_files',
      query: (searchQuery || query).slice(0, 200),
    });
  }

  return tools;
}
