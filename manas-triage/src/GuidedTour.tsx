import { HelpCircle, ChevronRight, Check } from 'lucide-react';

export interface TourStep {
  targetId: string;
  title: string;
  description: string;
  position?: 'bottom' | 'top' | 'right' | 'left';
}

interface GuidedTourProps {
  currentStepIndex: number;
  steps: TourStep[];
  onNext: () => void;
  onSkip: () => void;
}

export default function GuidedTour({
  currentStepIndex,
  steps,
  onNext,
  onSkip,
}: GuidedTourProps) {
  if (currentStepIndex >= steps.length) return null;

  const currentStep = steps[currentStepIndex];
  const isLast = currentStepIndex === steps.length - 1;

  return (
    <div className="fixed bottom-6 right-6 md:bottom-8 md:right-8 z-50 max-w-md w-[calc(100vw-3rem)] bg-slate-900/95 backdrop-blur-md border-2 border-emerald-500/80 rounded-2xl p-5 shadow-2xl animate-fade-in text-white">
      <div className="flex items-start gap-3">
        <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl">
          <HelpCircle className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
              Guide Step {currentStepIndex + 1} of {steps.length}
            </span>
            <button
              onClick={onSkip}
              className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
            >
              Skip Guide
            </button>
          </div>
          <h3 className="text-lg font-bold text-white mt-1">
            {currentStep.title}
          </h3>
          <p className="text-base text-slate-300 mt-1 leading-relaxed">
            {currentStep.description}
          </p>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-800 flex justify-end gap-3">
        <button
          onClick={onNext}
          className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-xl transition text-base cursor-pointer shadow-lg shadow-emerald-950"
        >
          {isLast ? (
            <>
              Got it, start using <Check className="w-5 h-5" />
            </>
          ) : (
            <>
              Next <ChevronRight className="w-5 h-5" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}