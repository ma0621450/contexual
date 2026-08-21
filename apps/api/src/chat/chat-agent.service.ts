import { Injectable } from '@nestjs/common';
import { AiProvider } from '@contexual/database';
import type { ChatStreamEvent } from './chat.types';
import { WebSearchService } from './web-search.service';
import { FilesService } from '../files/files.service';
import { AiProviderClient } from './ai-provider.client';
import { ProvidersService } from '../providers/providers.service';
import type { ChatCompletionMessage } from './openai.client';
import { toolsForTurn, type AgentToolName } from './chat-tools';
import { planAgentTools } from './chat-agent.plan';

export { planAgentTools } from './chat-agent.plan';

const MAX_TOOL_ROUNDS = 4;

@Injectable()
export class ChatAgentService {
  constructor(
    private readonly webSearch: WebSearchService,
    private readonly filesService: FilesService,
    private readonly aiProvider: AiProviderClient,
    private readonly providersService: ProvidersService,
  ) {}

  async collectContext(input: {
    query: string;
    organizationId: string;
    webSearch: boolean;
    folderFileIds?: string[];
    provider: AiProvider;
    apiKey: string;
    model: string;
    signal?: AbortSignal;
  }): Promise<{
    context: string;
    events: ChatStreamEvent[];
    webSearchActive: boolean;
    hadResults: boolean;
  }> {
    try {
      return await this.collectWithNativeTools(input);
    } catch {
      return this.collectHeuristicContext(input);
    }
  }

  private async collectWithNativeTools(input: {
    query: string;
    organizationId: string;
    webSearch: boolean;
    folderFileIds?: string[];
    provider: AiProvider;
    apiKey: string;
    model: string;
    signal?: AbortSignal;
  }) {
    const events: ChatStreamEvent[] = [];
    const parts: string[] = [];
    let hadResults = false;
    const tools = toolsForTurn(input.webSearch);
    const messages: ChatCompletionMessage[] = [
      {
        role: 'system',
        content: [
          'You can call tools before answering.',
          input.webSearch
            ? 'Use web_search and read_url for live or URL-specific facts. You may search again with a better query if the first results are weak.'
            : 'Do not claim to have searched the live web. You may search workspace files.',
          'Use search_files when the question may be answered by uploaded workspace documents.',
          'If no tool is needed, reply with a short OK and no tool calls so the main model can answer.',
        ].join(' '),
      },
      { role: 'user', content: input.query },
    ];

    const embeddingKey = await this.embeddingKey(
      input.organizationId,
      input.provider,
      input.apiKey,
    );

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      if (input.signal?.aborted) break;
      const decision = await this.aiProvider.completeWithTools(
        input.provider,
        input.apiKey,
        input.model,
        messages,
        tools,
        input.signal,
      );
      if (!decision.toolCalls.length) break;

      messages.push({
        role: 'assistant',
        content: decision.content || '(calling tools)',
      });

      const resultTexts: string[] = [];
      for (const call of decision.toolCalls) {
        const executed = await this.executeTool(
          call.name as AgentToolName,
          call.arguments,
          input,
          embeddingKey,
        );
        events.push(...executed.events);
        if (executed.text) {
          parts.push(executed.text);
          resultTexts.push(`${call.name}: ${executed.text}`);
          hadResults = executed.hadResults || hadResults;
        }
      }
      messages.push({
        role: 'user',
        content: `Tool results:\n${resultTexts.join('\n\n')}`,
      });
    }

    return {
      context: parts.join('\n\n'),
      events,
      webSearchActive: input.webSearch,
      hadResults,
    };
  }

  private async embeddingKey(
    organizationId: string,
    provider: AiProvider,
    apiKey: string,
  ) {
    if (provider === AiProvider.OPENAI) return apiKey;
    const openai = await this.providersService.getDecryptedKey(
      organizationId,
      AiProvider.OPENAI,
    );
    return openai?.apiKey;
  }

  private async executeTool(
    name: AgentToolName,
    args: Record<string, unknown>,
    input: {
      organizationId: string;
      folderFileIds?: string[];
    },
    embeddingKey?: string,
  ): Promise<{
    events: ChatStreamEvent[];
    text: string;
    hadResults: boolean;
  }> {
    if (name !== 'web_search' && name !== 'read_url' && name !== 'search_files') {
      return {
        events: [],
        text: `Unknown tool ${name}`,
        hadResults: false,
      };
    }

    if (name === 'web_search') {
      const query = String(args.query ?? '').trim();
      const events: ChatStreamEvent[] = [
        {
          type: 'tool',
          title: 'Searching the web',
          status: 'running',
          detail: query.slice(0, 120),
        },
      ];
      const results = query ? await this.webSearch.search(query) : [];
      events.push({
        type: 'tool',
        title: 'Searching the web',
        status: results.length ? 'done' : 'error',
        detail: results.length ? `${results.length} sources` : 'No sources found',
      });
      for (const result of results) {
        events.push({
          type: 'citation',
          id: result.id,
          title: result.title,
          url: result.url,
          snippet: result.snippet,
        });
      }
      const text = results.length
        ? [
            'Web search results:',
            ...results.map(
              (result, index) =>
                `${index + 1}. ${result.title} (${result.url})\n${result.snippet}`,
            ),
          ].join('\n')
        : 'Web search returned no usable sources.';
      return { events, text, hadResults: results.length > 0 };
    }

    if (name === 'read_url') {
      const url = String(args.url ?? '').trim();
      const events: ChatStreamEvent[] = [
        {
          type: 'tool',
          title: 'Reading page',
          status: 'running',
          detail: url.slice(0, 80),
        },
      ];
      try {
        const body = url ? await this.webSearch.readUrl(url) : null;
        events.push({
          type: 'tool',
          title: 'Reading page',
          status: body ? 'done' : 'error',
          detail: url.slice(0, 80),
        });
        return {
          events,
          text: body ? `Full page text from ${url}:\n${body}` : `Could not read ${url}`,
          hadResults: Boolean(body),
        };
      } catch {
        events.push({
          type: 'tool',
          title: 'Reading page',
          status: 'error',
          detail: url,
        });
        return { events, text: `Could not read ${url}`, hadResults: false };
      }
    }

    const query = String(args.query ?? '').trim();
    const events: ChatStreamEvent[] = [
      {
        type: 'tool',
        title: 'Searching workspace files',
        status: 'running',
        detail: query.slice(0, 80),
      },
    ];
    const fileHits = query
      ? await this.filesService.searchWorkspaceFiles(
          input.organizationId,
          query,
          5,
          input.folderFileIds?.length ? input.folderFileIds : undefined,
          embeddingKey,
        )
      : [];
    events.push({
      type: 'tool',
      title: 'Searching workspace files',
      status: 'done',
      detail: fileHits.length ? `${fileHits.length} matches` : 'No matches',
    });
    for (const hit of fileHits) {
      events.push({
        type: 'citation',
        id: `file-${hit.id}`,
        title: hit.filename,
        snippet: hit.snippet,
      });
    }
    const text = fileHits
      .map(
        (hit) =>
          `Workspace file "${hit.filename}" (matched your query):\n${hit.excerpt}`,
      )
      .join('\n\n');
    return { events, text, hadResults: fileHits.length > 0 };
  }

  private async collectHeuristicContext(input: {
    query: string;
    organizationId: string;
    webSearch: boolean;
    folderFileIds?: string[];
  }) {
    const events: ChatStreamEvent[] = [];
    const parts: string[] = [];
    let hadResults = false;
    const planned = planAgentTools(input.query, input.webSearch);

    for (const tool of planned) {
      const executed = await this.executeTool(
        tool.name,
        tool.name === 'read_url' ? { url: tool.url } : { query: tool.query },
        input,
      );
      events.push(...executed.events);
      if (executed.text) parts.push(executed.text);
      hadResults = executed.hadResults || hadResults;
    }

    return {
      context: parts.join('\n\n'),
      events,
      webSearchActive: input.webSearch,
      hadResults,
    };
  }
}
