import { useState, useEffect, useRef } from 'react';
import type { FormEvent } from 'react';
import { db } from './db';
import type { VitalsInput, TriageCategory, TriageRecord } from './types';
import { evaluatePhysicalTriage, detectMentalRedFlags } from './triageRules';
import GuidedTour, { type TourStep } from './GuidedTour';
import {
  ShieldAlert,
  Activity,
  HeartHandshake,
  Database,
  Cpu,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

const TOUR_STEPS: TourStep[] = [
  {
    targetId: 'tour-tabs',
    title: '1. Select Triage Category',
    description:
      'Choose between Physical Trauma (accidents, wounds, bleeding) or Mental Crisis assessment.',
  },
  {
    targetId: 'tour-inputs',
    title: '2. Fill Observed Signs',
    description:
      'Tap simple checkboxes and enter counts. Large touch buttons are designed for fast emergency checks.',
  },
  {
    targetId: 'tour-submit',
    title: '3. Tap to Evaluate Urgency',
    description:
      'Instantly computes international priority colors (RED, YELLOW, GREEN) and a numeric urgency score.',
  },
  {
    targetId: 'tour-output',
    title: '4. View Priority Action',
    description:
      'Clear, bold medical directives tell the responder or helper exactly what immediate aid is required.',
  },
  {
    targetId: 'tour-reset',
    title: '5. Emergency Exit & Wipe',
    description:
      'Leaves the app, erases all saved medical history from this device, and restarts fresh.',
  },
];

export default function App() {
  const [tab, setTab] = useState<'PHYSICAL' | 'MENTAL'>('PHYSICAL');
  const [aiStatus, setAiStatus] = useState<string>('Ready (Local)');
  const [aiReady, setAiReady] = useState<boolean>(false);
  const [recentRecords, setRecentRecords] = useState<TriageRecord[]>([]);

  const [tourIndex, setTourIndex] = useState<number>(() => {
    return localStorage.getItem('manas_tour_completed') ? 999 : 0;
  });

  const [vitals, setVitals] = useState<VitalsInput>({
    isBreathing: true,
    respiratoryRate: 18,
    radialPulsePresent: true,
    mentalStatusFollowsCommands: true,
    severeBleeding: false,
  });

  const [mentalText, setMentalText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [lastResult, setLastResult] = useState<{
    category: TriageCategory;
    details: string;
    urgencyScore: number;
  } | null>(null);

  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    workerRef.current = new Worker(
      new URL('./triageWorker.ts', import.meta.url),
      { type: 'module' }
    );

    workerRef.current.onmessage = async (e: MessageEvent) => {
      const data = e.data;
      if (data.status === 'LOADING') setAiStatus(data.message);
      if (data.status === 'READY') {
        setAiStatus('Ready (Offline AI)');
        setAiReady(true);
      }
      if (data.status === 'COMPLETE') {
        setAnalyzing(false);
        const { isDistressed, confidence } = data.result;

        const lower = mentalText.toLowerCase();
        const highCrisisWords = [
          'can\'t breathe',
          'cant breathe',
          'panic',
          'terrified',
          'trapped',
          'crushed',
          'uncontrollably',
          'overwhelmed',
        ];
        const hasHighCrisis = highCrisisWords.some((w) => lower.includes(w));

        let calculatedScore = 15;
        if (isDistressed) {
          if (hasHighCrisis) {
            calculatedScore = Math.min(98, 75 + Math.round(confidence * 0.23));
          } else {
            calculatedScore = Math.min(65, 35 + Math.round(confidence * 0.3));
          }
        }

        const category: TriageCategory =
          calculatedScore >= 80
            ? 'RED'
            : calculatedScore >= 40
            ? 'YELLOW'
            : 'GREEN';

        const action =
          category === 'RED'
            ? `High Acute Distress Score (${calculatedScore}%). Initiate grounding protocol and escalate.`
            : category === 'YELLOW'
            ? `Moderate Situational Stress (${calculatedScore}%). Provide calming guidance and monitor.`
            : `Mild/Normal Range (${calculatedScore}%). Baseline stable.`;

        setLastResult({ category, details: action, urgencyScore: calculatedScore });

        await db.triageRecords.add({
          timestamp: new Date().toLocaleTimeString(),
          patientType: 'MENTAL',
          reportedSymptoms: mentalText,
          severity: category,
          urgencyScore: calculatedScore,
          summaryAction: action,
        });
        loadRecords();
      }
      if (data.status === 'ERROR') {
        setAiStatus(`AI Offline`);
        setAnalyzing(false);
      }
    };

    workerRef.current.postMessage({ type: 'INIT' });
    loadRecords();

    return () => {
      workerRef.current?.terminate();
    };
  }, [mentalText]);

  const loadRecords = async () => {
    const list = await db.triageRecords.reverse().limit(5).toArray();
    setRecentRecords(list);
  };

  const handleExitAndWipeData = async () => {
    const confirmWipe = window.confirm(
      'Are you sure you want to EXIT?\n\nThis will completely erase all stored patient records from this device and restart the app from the beginning.'
    );
    if (!confirmWipe) return;

    await db.triageRecords.clear();
    localStorage.removeItem('manas_tour_completed');
    setRecentRecords([]);
    setLastResult(null);
    setMentalText('');
    setVitals({
      isBreathing: true,
      respiratoryRate: 18,
      radialPulsePresent: true,
      mentalStatusFollowsCommands: true,
      severeBleeding: false,
    });
    setTourIndex(0);
  };

  const handlePhysicalSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const result = evaluatePhysicalTriage(vitals);

    setLastResult({
      category: result.category,
      details: result.reason,
      urgencyScore: result.urgencyScore,
    });

    await db.triageRecords.add({
      timestamp: new Date().toLocaleTimeString(),
      patientType: 'PHYSICAL',
      reportedSymptoms: `Resp: ${vitals.respiratoryRate} bpm | Bleed: ${vitals.severeBleeding}`,
      severity: result.category,
      urgencyScore: result.urgencyScore,
      summaryAction: result.reason,
    });
    loadRecords();
  };

  const handleMentalSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!mentalText.trim()) return;

    if (detectMentalRedFlags(mentalText)) {
      const emergencyAction =
        'CRITICAL RED-FLAG: Active crisis indicators detected. Deploy immediate offline SOS guidance.';
      setLastResult({
        category: 'RED' as const,
        details: emergencyAction,
        urgencyScore: 100,
      });
      await db.triageRecords.add({
        timestamp: new Date().toLocaleTimeString(),
        patientType: 'MENTAL',
        reportedSymptoms: mentalText,
        severity: 'RED',
        urgencyScore: 100,
        summaryAction: emergencyAction,
      });
      loadRecords();
      return;
    }

    setAnalyzing(true);
    workerRef.current?.postMessage({ type: 'CLASSIFY', text: mentalText });
  };

  const getBadgeColor = (cat: TriageCategory) => {
    switch (cat) {
      case 'RED':
        return 'bg-red-600 text-white border-2 border-red-400';
      case 'YELLOW':
        return 'bg-amber-400 text-slate-950 border-2 border-amber-300';
      case 'GREEN':
        return 'bg-emerald-500 text-slate-950 border-2 border-emerald-300';
      case 'BLACK':
        return 'bg-neutral-900 text-white border-2 border-neutral-600';
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 antialiased p-4 md:p-8 selection:bg-emerald-500 selection:text-slate-950">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6 border-b-2 border-slate-800">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-red-600/20 border-2 border-red-500 rounded-2xl">
                <ShieldAlert className="text-red-500 w-8 h-8 md:w-10 md:h-10" />
              </div>
              <div>
                <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white">
                  MANAS TRIAGE
                </h1>
                <p className="text-sm md:text-base font-medium text-emerald-400">
                  Offline Field Emergency Assessment
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 rounded-xl text-xs font-mono border border-slate-800 text-slate-300">
              <Cpu className={`w-4 h-4 ${aiReady ? 'text-emerald-400' : 'text-amber-400 animate-spin'}`} />
              <span>{aiStatus}</span>
            </div>

            <button
              onClick={() => setTourIndex(0)}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 text-sm md:text-base font-bold rounded-xl border border-slate-700 transition cursor-pointer"
            >
              <Sparkles className="w-5 h-5" /> How to Use
            </button>

            <button
              id="tour-reset"
              onClick={handleExitAndWipeData}
              className="flex items-center gap-2 px-4 py-2.5 bg-red-950/60 hover:bg-red-900/80 text-red-300 hover:text-white text-sm md:text-base font-bold rounded-xl border border-red-700 transition cursor-pointer"
            >
              <RotateCcw className="w-5 h-5" /> Exit & Erase Data
            </button>
          </div>
        </header>

        <div id="tour-tabs" className="grid grid-cols-2 gap-3 md:gap-4">
          <button
            onClick={() => setTab('PHYSICAL')}
            className={`flex items-center justify-center gap-3 py-4 px-4 rounded-2xl font-bold text-lg md:text-xl transition cursor-pointer border-2 shadow-lg ${
              tab === 'PHYSICAL'
                ? 'bg-blue-600 border-blue-400 text-white shadow-blue-950'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800 hover:border-slate-700'
            }`}
          >
            <Activity className="w-6 h-6 md:w-7 md:h-7 text-white" /> Physical Trauma
          </button>
          <button
            onClick={() => setTab('MENTAL')}
            className={`flex items-center justify-center gap-3 py-4 px-4 rounded-2xl font-bold text-lg md:text-xl transition cursor-pointer border-2 shadow-lg ${
              tab === 'MENTAL'
                ? 'bg-indigo-600 border-indigo-400 text-white shadow-indigo-950'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800 hover:border-slate-700'
            }`}
          >
            <HeartHandshake className="w-6 h-6 md:w-7 md:h-7 text-white" /> Mental Distress
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div
            id="tour-inputs"
            className="lg:col-span-7 bg-slate-900 p-6 md:p-8 rounded-3xl border-2 border-slate-800 shadow-xl space-y-6"
          >
            {tab === 'PHYSICAL' ? (
              <form onSubmit={handlePhysicalSubmit} className="space-y-6">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <h2 className="text-xl md:text-2xl font-bold text-white">
                    Physical Signs Check
                  </h2>
                  <span className="text-xs uppercase tracking-wider font-bold px-3 py-1 bg-slate-800 text-slate-300 rounded-full">
                    START Protocol
                  </span>
                </div>

                <label className="flex items-center gap-4 p-4 md:p-5 bg-red-950/40 hover:bg-red-900/40 border-2 border-red-700/60 rounded-2xl cursor-pointer transition">
                  <input
                    type="checkbox"
                    checked={vitals.severeBleeding}
                    onChange={(e) =>
                      setVitals({ ...vitals, severeBleeding: e.target.checked })
                    }
                    className="w-7 h-7 accent-red-600 rounded-lg cursor-pointer"
                  />
                  <div>
                    <span className="text-lg md:text-xl font-bold text-red-300 block">
                      Severe Uncontrolled Bleeding
                    </span>
                    <span className="text-xs md:text-sm text-red-200/80">
                      Gushing or arterial blood flow needing pressure/tourniquet
                    </span>
                  </div>
                </label>

                <label className="flex items-center gap-4 p-4 md:p-5 bg-slate-800/80 hover:bg-slate-800 border-2 border-slate-700 rounded-2xl cursor-pointer transition">
                  <input
                    type="checkbox"
                    checked={vitals.isBreathing}
                    onChange={(e) =>
                      setVitals({ ...vitals, isBreathing: e.target.checked })
                    }
                    className="w-7 h-7 accent-blue-500 rounded-lg cursor-pointer"
                  />
                  <div>
                    <span className="text-lg md:text-xl font-bold text-white block">
                      Patient is Breathing
                    </span>
                    <span className="text-xs md:text-sm text-slate-400">
                      Chest rises and falls
                    </span>
                  </div>
                </label>

                <div className="p-4 md:p-5 bg-slate-800/80 border-2 border-slate-700 rounded-2xl space-y-2">
                  <label className="block text-base md:text-lg font-bold text-slate-200">
                    Respiratory Rate (Breaths per minute)
                  </label>
                  <p className="text-xs md:text-sm text-slate-400">
                    Normal resting rate is 12–20. Over 30 is critical tachypnea.
                  </p>
                  <input
                    type="number"
                    min={0}
                    max={80}
                    value={vitals.respiratoryRate}
                    onChange={(e) =>
                      setVitals({
                        ...vitals,
                        respiratoryRate: Number(e.target.value),
                      })
                    }
                    className="w-full bg-slate-950 border-2 border-slate-700 rounded-xl p-3 md:p-4 text-2xl md:text-3xl font-mono font-bold text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <label className="flex items-center gap-4 p-4 md:p-5 bg-slate-800/80 hover:bg-slate-800 border-2 border-slate-700 rounded-2xl cursor-pointer transition">
                  <input
                    type="checkbox"
                    checked={vitals.radialPulsePresent}
                    onChange={(e) =>
                      setVitals({
                        ...vitals,
                        radialPulsePresent: e.target.checked,
                      })
                    }
                    className="w-7 h-7 accent-blue-500 rounded-lg cursor-pointer"
                  />
                  <div>
                    <span className="text-lg md:text-xl font-bold text-white block">
                      Radial Pulse Present (Wrist Pulse OK)
                    </span>
                    <span className="text-xs md:text-sm text-slate-400">
                      Indicates blood is circulating to extremities
                    </span>
                  </div>
                </label>

                <button
                  id="tour-submit"
                  type="submit"
                  className="w-full bg-red-600 hover:bg-red-500 text-white font-extrabold text-xl md:text-2xl py-4 rounded-2xl transition cursor-pointer shadow-lg shadow-red-950 border-2 border-red-400"
                >
                  Evaluate Urgency
                </button>
              </form>
            ) : (
              <form onSubmit={handleMentalSubmit} className="space-y-6">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <h2 className="text-xl md:text-2xl font-bold text-white">
                    Mental Crisis Assessment
                  </h2>
                  <span className="text-xs uppercase tracking-wider font-bold px-3 py-1 bg-indigo-950 text-indigo-300 border border-indigo-700 rounded-full">
                    Local On-Device AI
                  </span>
                </div>

                <div className="space-y-2">
                  <label className="block text-base md:text-lg font-bold text-slate-200">
                    What does the person say or show?
                  </label>
                  <p className="text-xs md:text-sm text-slate-400">
                    Type feelings, behavioral statements, or immediate fears. Runs 100% offline.
                  </p>
                  <textarea
                    rows={4}
                    value={mentalText}
                    onChange={(e) => setMentalText(e.target.value)}
                    placeholder="e.g., I cannot breathe, my heart is pounding, I feel trapped..."
                    className="w-full bg-slate-950 border-2 border-slate-700 rounded-xl p-4 text-lg text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <button
                  id="tour-submit"
                  type="submit"
                  disabled={analyzing}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-extrabold text-xl md:text-2xl py-4 rounded-2xl transition cursor-pointer shadow-lg shadow-indigo-950 border-2 border-indigo-400"
                >
                  {analyzing ? 'Analyzing Offline...' : 'Analyze Mental Severity'}
                </button>
              </form>
            )}
          </div>

          <div className="lg:col-span-5 space-y-6">
            <div
              id="tour-output"
              className="bg-slate-900 p-6 md:p-7 rounded-3xl border-2 border-slate-800 shadow-xl space-y-4"
            >
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                Assessment Output
              </span>

              {lastResult ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className={`px-4 py-2 text-base md:text-lg font-black rounded-xl ${getBadgeColor(
                        lastResult.category
                      )}`}
                    >
                      PRIORITY: {lastResult.category}
                    </span>
                    <span className="text-sm md:text-base font-bold px-3.5 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-200">
                      Urgency:{' '}
                      <span className="text-amber-400 font-mono text-lg font-extrabold">
                        {lastResult.urgencyScore}/100
                      </span>
                    </span>
                  </div>
                  <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl">
                    <p className="text-base md:text-lg text-slate-200 font-medium leading-relaxed">
                      {lastResult.details}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-6 bg-slate-950/50 border border-dashed border-slate-800 rounded-2xl text-center">
                  <p className="text-slate-500 text-base font-medium">
                    No active evaluation. Fill the inputs and click the button to see immediate triage instructions.
                  </p>
                </div>
              )}
            </div>

            <div className="bg-slate-900 p-6 md:p-7 rounded-3xl border-2 border-slate-800 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-400" /> Saved Local Log
                </span>
                <span className="text-xs font-bold text-slate-500">
                  {recentRecords.length} Saved
                </span>
              </div>

              <div className="space-y-3">
                {recentRecords.map((r) => (
                  <div
                    key={r.id}
                    className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800 flex justify-between items-center gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-300">
                          [{r.patientType}]
                        </span>
                        <span className="text-xs text-slate-500 font-mono">
                          {r.timestamp}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 truncate max-w-44 sm:max-w-xs mt-0.5">
                        {r.reportedSymptoms}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-amber-400">
                        {r.urgencyScore}
                      </span>
                      <span
                        className={`text-xs px-2.5 py-1 rounded-lg font-extrabold ${getBadgeColor(
                          r.severity
                        )}`}
                      >
                        {r.severity}
                      </span>
                    </div>
                  </div>
                ))}

                {recentRecords.length === 0 && (
                  <p className="text-sm text-slate-500 text-center py-4">
                    No recent evaluations saved on this device yet.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <GuidedTour
        currentStepIndex={tourIndex}
        steps={TOUR_STEPS}
        onNext={() => {
          if (tourIndex < TOUR_STEPS.length - 1) {
            setTourIndex(tourIndex + 1);
          } else {
            localStorage.setItem('manas_tour_completed', 'true');
            setTourIndex(999);
          }
        }}
        onSkip={() => {
          localStorage.setItem('manas_tour_completed', 'true');
          setTourIndex(999);
        }}
      />
    </div>
  );
}