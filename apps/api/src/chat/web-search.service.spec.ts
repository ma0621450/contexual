import { WebSearchService } from './web-search.service';

describe('WebSearchService', () => {
  const service = new WebSearchService();

  it('extracts domains from natural language queries', () => {
    expect(
      service.extractTargets('search for boxingessential.com please'),
    ).toEqual(['https://boxingessential.com']);
  });

  it('fetches a preview for a named domain', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('boxingessential.com')) {
        return {
          ok: true,
          text: async () =>
            '<html><head><title>Boxing Essential</title><meta name="description" content="Premium boxing gear." /></head><body>Shop gloves and wraps.</body></html>',
        } as Response;
      }
      return { ok: true, json: async () => ({}), text: async () => '' } as Response;
    });

    const results = await service.search('boxingessential.com');

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.url).toContain('boxingessential.com');
    expect(results[0]?.title).toContain('Boxing Essential');
    fetchMock.mockRestore();
  });
});
