import { Test, TestingModule } from '@nestjs/testing';
import { AiProvider } from '@contexual/database';
import { ChatAgentService } from './chat-agent.service';
import { planAgentTools } from './chat-agent.plan';
import { WebSearchService } from './web-search.service';
import { FilesService } from '../files/files.service';
import { AiProviderClient } from './ai-provider.client';
import { ProvidersService } from '../providers/providers.service';

describe('planAgentTools', () => {
  it('plans search, url read, and file search', () => {
    const tools = planAgentTools(
      'Summarize https://example.com pricing',
      true,
    );
    expect(tools.some((tool) => tool.name === 'web_search')).toBe(true);
    expect(
      tools.some(
        (tool) =>
          tool.name === 'read_url' && tool.url === 'https://example.com',
      ),
    ).toBe(true);
    expect(tools.some((tool) => tool.name === 'search_files')).toBe(true);
  });

  it('skips web search when disabled', () => {
    const tools = planAgentTools('billing policy', false);
    expect(tools.some((tool) => tool.name === 'web_search')).toBe(false);
    expect(tools.some((tool) => tool.name === 'search_files')).toBe(true);
  });
});

describe('ChatAgentService', () => {
  let service: ChatAgentService;
  const webSearch = {
    search: jest.fn(),
    readUrl: jest.fn(),
  };
  const filesService = {
    searchWorkspaceFiles: jest.fn(),
  };
  const aiProvider = {
    completeWithTools: jest.fn(),
  };
  const providersService = {
    getDecryptedKey: jest.fn().mockResolvedValue(null),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatAgentService,
        { provide: WebSearchService, useValue: webSearch },
        { provide: FilesService, useValue: filesService },
        { provide: AiProviderClient, useValue: aiProvider },
        { provide: ProvidersService, useValue: providersService },
      ],
    }).compile();

    service = module.get(ChatAgentService);
  });

  const baseInput = {
    organizationId: 'org-1',
    provider: AiProvider.OPENAI,
    apiKey: 'key',
    model: 'gpt-5.6-luna',
  };

  it('lets the model call web_search then read_url', async () => {
    aiProvider.completeWithTools
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          { id: '1', name: 'web_search', arguments: { query: 'example.com' } },
        ],
        promptTokens: 1,
        completionTokens: 1,
      })
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          {
            id: '2',
            name: 'read_url',
            arguments: { url: 'https://example.com' },
          },
        ],
        promptTokens: 1,
        completionTokens: 1,
      })
      .mockResolvedValueOnce({
        content: 'OK',
        toolCalls: [],
        promptTokens: 1,
        completionTokens: 1,
      });
    webSearch.search.mockResolvedValue([
      {
        id: 'web-1',
        title: 'Example',
        url: 'https://example.com',
        snippet: 'Snippet',
      },
    ]);
    webSearch.readUrl.mockResolvedValue('Full page body');
    filesService.searchWorkspaceFiles.mockResolvedValue([]);

    const result = await service.collectContext({
      ...baseInput,
      query: 'What does example.com sell?',
      webSearch: true,
    });

    expect(webSearch.search).toHaveBeenCalledWith('example.com');
    expect(webSearch.readUrl).toHaveBeenCalledWith('https://example.com');
    expect(result.context).toContain('Full page text');
    expect(result.hadResults).toBe(true);
  });

  it('falls back to heuristics when tool calling fails', async () => {
    aiProvider.completeWithTools.mockRejectedValue(new Error('no tools'));
    filesService.searchWorkspaceFiles.mockResolvedValue([
      {
        id: 'file-1',
        filename: 'notes.txt',
        snippet: 'billing policy',
        excerpt: 'Our billing policy is monthly.',
      },
    ]);

    const result = await service.collectContext({
      ...baseInput,
      query: 'billing policy',
      webSearch: false,
    });

    expect(filesService.searchWorkspaceFiles).toHaveBeenCalled();
    expect(result.context).toContain('notes.txt');
  });
});
