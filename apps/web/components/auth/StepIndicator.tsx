import { cn } from '@/lib/utils';

type StepIndicatorProps = {
  totalSteps: number;
  currentStep: number;
};

export function StepIndicator({ totalSteps, currentStep }: StepIndicatorProps) {
  return (
    <div className="mb-8 flex items-center justify-center gap-2">
      {Array.from({ length: totalSteps }, (_, index) => {
        const step = index + 1;
        const isActive = step === currentStep;
        const isComplete = step < currentStep;

        return (
          <div
            key={step}
            className={cn(
              'h-2 rounded-full transition-all',
              isActive
                ? 'w-8 bg-primary'
                : isComplete
                  ? 'w-2 bg-primary/50'
                  : 'w-2 bg-border',
            )}
            aria-label={`Step ${step} of ${totalSteps}`}
          />
        );
      })}
    </div>
  );
}
