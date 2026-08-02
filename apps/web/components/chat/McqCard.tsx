'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2Icon, CircleHelpIcon, XCircleIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { McqData } from './parseMessageContent';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function McqCard({
  data,
  selectedIndex = null,
  onSelect,
}: {
  data: McqData;
  selectedIndex?: number | null;
  onSelect?: (index: number) => void;
}) {
  const [localSelected, setLocalSelected] = useState<number | null>(null);
  const controlled = onSelect !== undefined;
  const selected = controlled ? selectedIndex : localSelected;
  const revealed = selected !== null;
  const hasAnswer = data.answer !== undefined;

  function choose(index: number) {
    if (controlled) {
      onSelect(index);
      return;
    }
    setLocalSelected(index);
  }

  function clear() {
    if (controlled) {
      onSelect(-1);
      return;
    }
    setLocalSelected(null);
  }

  return (
    <div className="my-4 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-start gap-2.5 border-b border-border bg-muted/40 px-4 py-3">
        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <CircleHelpIcon className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            {hasAnswer ? 'Multiple choice' : 'Clarifying question'}
          </p>
          <p className="mt-0.5 text-sm font-medium leading-6 text-foreground">
            {data.question}
          </p>
        </div>
      </div>

      <div className="space-y-2 p-3">
        {data.options.map((option, index) => {
          const isSelected = selected === index;
          const isCorrect = data.answer === index;
          const showCorrect = revealed && hasAnswer && isCorrect;
          const showIncorrect =
            revealed && hasAnswer && isSelected && !isCorrect;

          return (
            <button
              key={`${index}-${option}`}
              type="button"
              disabled={revealed && hasAnswer}
              onClick={() => choose(index)}
              className={cn(
                'flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
                !revealed &&
                  'border-border hover:border-primary/40 hover:bg-accent/60',
                isSelected && !hasAnswer && 'border-primary bg-primary/5',
                showCorrect && 'border-success/50 bg-success/10',
                showIncorrect && 'border-destructive/40 bg-destructive/10',
                revealed &&
                  hasAnswer &&
                  !showCorrect &&
                  !showIncorrect &&
                  'opacity-70',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold',
                  showCorrect &&
                    'border-success bg-success text-success-foreground',
                  showIncorrect &&
                    'border-destructive bg-destructive text-destructive-foreground',
                  !showCorrect &&
                    !showIncorrect &&
                    'border-border bg-background text-muted-foreground',
                )}
              >
                {showCorrect ? (
                  <CheckCircle2Icon className="size-3.5" />
                ) : showIncorrect ? (
                  <XCircleIcon className="size-3.5" />
                ) : (
                  LETTERS[index] ?? index + 1
                )}
              </span>
              <span className="min-w-0 flex-1 leading-6">{option}</span>
            </button>
          );
        })}
      </div>

      {revealed && hasAnswer ? (
        <div className="border-t border-border px-4 py-3 text-sm">
          <p
            className={cn(
              'font-medium',
              selected === data.answer ? 'text-success' : 'text-destructive',
            )}
          >
            {selected === data.answer ? 'Correct' : 'Not quite'}
            {data.answer !== undefined
              ? ` · Answer is ${LETTERS[data.answer]}`
              : ''}
          </p>
          {data.explanation ? (
            <p className="mt-1 text-muted-foreground leading-6">
              {data.explanation}
            </p>
          ) : null}
        </div>
      ) : null}

      {revealed && !hasAnswer && !controlled ? (
        <div className="border-t border-border px-4 py-3 text-sm">
          <button
            type="button"
            onClick={clear}
            className="text-xs font-medium text-primary underline-offset-2 hover:underline"
          >
            Clear selection
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function ClarifyingQuestions({
  questions,
  disabled,
  onContinue,
}: {
  questions: McqData[];
  disabled?: boolean;
  onContinue?: (message: string) => void;
}) {
  const [selections, setSelections] = useState<Record<number, number>>({});

  const allAnswered = useMemo(
    () => questions.every((_, index) => selections[index] !== undefined),
    [questions, selections],
  );

  function continueChat() {
    if (!onContinue || !allAnswered) return;
    const lines = questions.map((question, index) => {
      const optionIndex = selections[index];
      const option = question.options[optionIndex] ?? '';
      const letter = LETTERS[optionIndex] ?? String(optionIndex + 1);
      return `- ${question.question}\n  Choice: ${letter}. ${option}`;
    });
    onContinue(
      [
        'Here are my answers to your clarifying questions. Please continue with the full response based on these choices:',
        '',
        ...lines,
      ].join('\n'),
    );
  }

  return (
    <div className="space-y-1">
      {questions.map((question, index) => (
        <McqCard
          key={`clarify-${index}-${question.question}`}
          data={question}
          selectedIndex={
            selections[index] === undefined ? null : selections[index]
          }
          onSelect={(optionIndex) => {
            setSelections((current) => {
              if (optionIndex < 0) {
                const next = { ...current };
                delete next[index];
                return next;
              }
              return { ...current, [index]: optionIndex };
            });
          }}
        />
      ))}

      {onContinue ? (
        <div className="my-3 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/30 px-3 py-3">
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">
            {allAnswered
              ? 'All set — continue and I’ll generate the answer.'
              : `Answer ${Object.keys(selections).length} of ${questions.length} to continue.`}
          </p>
          <Button
            type="button"
            size="sm"
            disabled={!allAnswered || disabled}
            onClick={continueChat}
          >
            Continue
          </Button>
        </div>
      ) : null}
    </div>
  );
}
