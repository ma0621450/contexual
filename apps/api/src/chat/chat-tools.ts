export type AgentToolName = 'web_search' | 'read_url' | 'search_files';

export type AgentToolDefinition = {
  name: AgentToolName;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
};

export const AGENT_TOOLS: AgentToolDefinition[] = [
  {
    name: 'web_search',
    description:
      'Search the live web for current information. Use when the user needs facts that may have changed, a URL, or a company/product page.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query or URL/domain to look up',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'read_url',
    description: 'Fetch and read the text of a specific http(s) page.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Absolute URL to fetch' },
      },
      required: ['url'],
    },
  },
  {
    name: 'search_files',
    description:
      'Search this workspace file library for relevant document excerpts.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Keywords or question to match against files',
        },
      },
      required: ['query'],
    },
  },
];

export function toolsForTurn(webSearch: boolean): AgentToolDefinition[] {
  return webSearch
    ? AGENT_TOOLS
    : AGENT_TOOLS.filter((tool) => tool.name === 'search_files');
}

export function toOpenAiTools(tools: AgentToolDefinition[]) {
  return tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

export function toAnthropicTools(tools: AgentToolDefinition[]) {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  }));
}

export function toGeminiTools(tools: AgentToolDefinition[]) {
  return [
    {
      functionDeclarations: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      })),
    },
  ];
}

export function parseToolArguments(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
