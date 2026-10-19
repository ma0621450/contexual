import { Injectable, Logger } from '@nestjs/common';

export type WebSearchResult = {
  id: string;
  title: string;
  url: string;
  snippet: string;
};

const PAGE_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

@Injectable()
export class WebSearchService {
  private readonly logger = new Logger(WebSearchService.name);

  async search(query: string, limit = 5): Promise<WebSearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const results: WebSearchResult[] = [];
    const seen = new Set<string>();

    const push = (item: WebSearchResult) => {
      const key = item.url.toLowerCase();
      if (!item.url || seen.has(key) || results.length >= limit) return;
      seen.add(key);
      results.push({ ...item, id: `web-${results.length + 1}` });
    };

    for (const target of this.extractTargets(trimmed)) {
      try {
        const preview = await this.fetchPagePreview(target);
        if (preview) push(preview);
      } catch (error) {
        this.logger.warn(
          `Page preview failed for ${target}: ${error instanceof Error ? error.message : 'unknown'}`,
        );
      }
    }

    const tavilyKey = process.env.TAVILY_API_KEY?.trim();
    if (tavilyKey && results.length < limit) {
      try {
        for (const item of await this.searchTavily(trimmed, tavilyKey, limit)) {
          push(item);
        }
      } catch (error) {
        this.logger.warn(
          `Tavily search failed: ${error instanceof Error ? error.message : 'unknown'}`,
        );
      }
    }

    if (results.length < limit) {
      try {
        for (const item of await this.searchDuckDuckGo(trimmed, limit)) {
          push(item);
        }
      } catch (error) {
        this.logger.warn(
          `DuckDuckGo search failed: ${error instanceof Error ? error.message : 'unknown'}`,
        );
      }
    }

    return results.slice(0, limit);
  }

  async readUrl(url: string, maxChars = 8000): Promise<string | null> {
    const tavilyKey = process.env.TAVILY_API_KEY?.trim();
    if (tavilyKey) {
      try {
        const extracted = await this.extractTavily([url], tavilyKey);
        const body = extracted.get(this.normalizeTarget(url)) ?? [...extracted.values()][0];
        if (body?.trim()) return body.slice(0, maxChars);
      } catch (error) {
        this.logger.warn(
          `Tavily extract failed for ${url}: ${error instanceof Error ? error.message : 'unknown'}`,
        );
      }
    }

    const preview = await this.fetchPagePreview(url);
    if (!preview?.snippet) return null;
    return preview.snippet.slice(0, maxChars);
  }

  extractTargets(query: string): string[] {
    const targets = new Set<string>();

    for (const match of query.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
      targets.add(this.normalizeTarget(match[0]));
    }

    for (const match of query.matchAll(
      /\b((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|org|net|io|co|app|dev|ai|uk|us|ca|de|fr|au|in|info|biz|shop|store))\b/gi,
    )) {
      targets.add(this.normalizeTarget(match[0]));
    }

    return [...targets];
  }

  private normalizeTarget(value: string): string {
    const trimmed = value.trim().replace(/[),.;!?]+$/g, '');
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  }

  private async fetchPagePreview(url: string): Promise<WebSearchResult | null> {
    const response = await fetch(url, {
      headers: {
        'user-agent': PAGE_USER_AGENT,
        accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const title =
      this.matchMeta(html, 'property="og:title"') ??
      this.matchTag(html, 'title') ??
      new URL(url).hostname;
    const description =
      this.matchMeta(html, 'name="description"') ??
      this.matchMeta(html, 'property="og:description"') ??
      '';
    const bodyText = this.stripTags(
      html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' '),
    )
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 2000);

    return {
      id: 'page',
      title,
      url,
      snippet: [description, bodyText].filter(Boolean).join('\n').slice(0, 1800),
    };
  }

  private matchTag(html: string, tag: string): string | undefined {
    const match = html.match(
      new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'),
    );
    return match?.[1] ? this.stripTags(match[1]) : undefined;
  }

  private matchMeta(html: string, attr: string): string | undefined {
    const match = html.match(
      new RegExp(`<meta[^>]*${attr}[^>]*content=["']([^"']+)`, 'i'),
    );
    return match?.[1]?.trim();
  }

  private async searchTavily(
    query: string,
    apiKey: string,
    limit: number,
  ): Promise<WebSearchResult[]> {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: limit,
        search_depth: 'advanced',
        include_answer: false,
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) {
      throw new Error(`Tavily HTTP ${response.status}`);
    }
    const body = (await response.json()) as {
      results?: { title?: string; url?: string; content?: string }[];
    };
    return (body.results ?? [])
      .filter((item) => item.title && item.url)
      .slice(0, limit)
      .map((item, index) => ({
        id: `tavily-${index + 1}`,
        title: item.title ?? 'Result',
        url: item.url ?? '',
        snippet: (item.content ?? '').slice(0, 1200),
      }));
  }

  private async extractTavily(
    urls: string[],
    apiKey: string,
  ): Promise<Map<string, string>> {
    const response = await fetch('https://api.tavily.com/extract', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        urls,
        extract_depth: 'advanced',
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      throw new Error(`Tavily extract HTTP ${response.status}`);
    }
    const body = (await response.json()) as {
      results?: { url?: string; raw_content?: string }[];
    };
    const map = new Map<string, string>();
    for (const item of body.results ?? []) {
      if (!item.url || !item.raw_content) continue;
      map.set(this.normalizeTarget(item.url), item.raw_content);
    }
    return map;
  }

  private async searchDuckDuckGo(
    query: string,
    limit: number,
  ): Promise<WebSearchResult[]> {
    const instant = await this.searchDuckDuckGoInstant(query);
    if (instant.length) return instant.slice(0, limit);

    const response = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        headers: { 'user-agent': PAGE_USER_AGENT },
        signal: AbortSignal.timeout(12_000),
      },
    );
    if (!response.ok) {
      throw new Error(`DuckDuckGo HTTP ${response.status}`);
    }
    const html = await response.text();
    const results: WebSearchResult[] = [];
    const linkRe =
      /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippetRe = /class="result__snippet"[^>]*>([\s\S]*?)<\/span>/gi;
    const snippets: string[] = [];
    let snippetMatch: RegExpExecArray | null;
    while ((snippetMatch = snippetRe.exec(html)) !== null) {
      snippets.push(this.stripTags(snippetMatch[1] ?? ''));
    }

    let match: RegExpExecArray | null;
    while ((match = linkRe.exec(html)) !== null && results.length < limit) {
      const rawHref = match[1] ?? '';
      const url = this.unwrapDuckDuckGoUrl(rawHref);
      if (!url) continue;
      results.push({
        id: `ddg-${results.length + 1}`,
        title: this.stripTags(match[2] ?? 'Result') || 'Result',
        url,
        snippet: snippets[results.length] ?? '',
      });
    }
    return results;
  }

  private async searchDuckDuckGoInstant(
    query: string,
  ): Promise<WebSearchResult[]> {
    const response = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!response.ok) return [];
    const body = (await response.json()) as {
      Heading?: string;
      AbstractText?: string;
      AbstractURL?: string;
      RelatedTopics?: Array<
        | { Text?: string; FirstURL?: string }
        | { Topics?: { Text?: string; FirstURL?: string }[] }
      >;
    };

    const results: WebSearchResult[] = [];
    if (body.AbstractURL && body.AbstractText) {
      results.push({
        id: 'ddg-abstract',
        title: body.Heading || body.AbstractURL,
        url: body.AbstractURL,
        snippet: body.AbstractText,
      });
    }

    for (const topic of body.RelatedTopics ?? []) {
      const nestedTopics =
        'Topics' in topic && Array.isArray(topic.Topics) ? topic.Topics : [topic];
      for (const nested of nestedTopics) {
        if (!('FirstURL' in nested) || !nested.FirstURL || !nested.Text) continue;
        results.push({
          id: `ddg-${results.length + 1}`,
          title: nested.Text.split(' - ')[0] ?? nested.Text,
          url: nested.FirstURL,
          snippet: nested.Text,
        });
      }
    }

    return results;
  }

  private unwrapDuckDuckGoUrl(href: string): string {
    try {
      const parsed = new URL(href, 'https://duckduckgo.com');
      const uddg = parsed.searchParams.get('uddg');
      if (uddg) return uddg;
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.toString();
      }
    } catch {
      return '';
    }
    return '';
  }

  private stripTags(value: string) {
    return value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  }
}
