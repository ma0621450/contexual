'use client';

import { useMemo } from 'react';
import { Markdown } from './Markdown';
import { ArtifactCard } from './CanvasPanel';
import { ClarifyingQuestions, McqCard } from './McqCard';
import {
  AnalyzingIndicator,
  ThinkingBlock,
} from './ThinkingBlock';
import { CollapseBlock, FileTreeBlock } from './RichBlocks';
import {
  isPreviewableLanguage,
  parseMessageContent,
  type CanvasArtifact,
  type ContentSegment,
  type McqData,
} from './parseMessageContent';

function groupSegments(segments: ContentSegment[]): Array<
  | ContentSegment
  | { type: 'clarify-group'; questions: McqData[] }
> {
  const grouped: Array<
    ContentSegment | { type: 'clarify-group'; questions: McqData[] }
  > = [];

  for (const segment of segments) {
    if (segment.type === 'mcq' && segment.data.answer === undefined) {
      const last = grouped[grouped.length - 1];
      if (last && last.type === 'clarify-group') {
        last.questions.push(segment.data);
      } else {
        grouped.push({ type: 'clarify-group', questions: [segment.data] });
      }
      continue;
    }
    grouped.push(segment);
  }

  return grouped;
}

export function MessageContent({
  content,
  streaming = false,
  disabled,
  onOpenCanvas,
  onContinueClarifying,
}: {
  content: string;
  streaming?: boolean;
  disabled?: boolean;
  onOpenCanvas?: (artifact: CanvasArtifact) => void;
  onContinueClarifying?: (message: string) => void;
}) {
  const segments = useMemo(() => parseMessageContent(content), [content]);
  const grouped = useMemo(() => groupSegments(segments), [segments]);

  if (!content.trim()) {
    return streaming ? <AnalyzingIndicator /> : null;
  }

  return (
    <div className="space-y-1">
      {grouped.map((segment, index) => {
        if (segment.type === 'thinking') {
          return (
            <ThinkingBlock
              key={`thinking-${index}`}
              content={segment.content}
              streaming={Boolean(segment.streaming && streaming)}
              defaultOpen={Boolean(segment.streaming)}
            />
          );
        }

        if (segment.type === 'clarify-group') {
          return (
            <ClarifyingQuestions
              key={`clarify-group-${index}`}
              questions={segment.questions}
              disabled={disabled || streaming}
              onContinue={
                streaming || disabled ? undefined : onContinueClarifying
              }
            />
          );
        }

        if (segment.type === 'mcq') {
          return <McqCard key={`mcq-${index}`} data={segment.data} />;
        }

        if (segment.type === 'canvas') {
          return (
            <ArtifactCard
              key={segment.artifact.id}
              artifact={segment.artifact}
              onOpen={(artifact) => onOpenCanvas?.(artifact)}
            />
          );
        }

        if (segment.type === 'collapse') {
          return (
            <CollapseBlock
              key={`collapse-${index}`}
              title={segment.title}
              content={segment.content}
            />
          );
        }

        if (segment.type === 'filetree') {
          return (
            <FileTreeBlock key={`tree-${index}`} content={segment.content} />
          );
        }

        return (
          <Markdown
            key={`md-${index}`}
            content={segment.content}
            onOpenCanvas={
              onOpenCanvas
                ? (language, code) => {
                    if (!isPreviewableLanguage(language)) return;
                    onOpenCanvas({
                      id: `inline-${index}-${language}-${code.length}`,
                      title: `${language.toUpperCase()} preview`,
                      language,
                      content: code,
                    });
                  }
                : undefined
            }
          />
        );
      })}
      {streaming ? (
        <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-foreground align-text-bottom" />
      ) : null}
    </div>
  );
}
