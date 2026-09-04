import type { VitalsInput, TriageCategory } from './types';

export function evaluatePhysicalTriage(vitals: VitalsInput): { 
  category: TriageCategory; 
  reason: string; 
  urgencyScore: number 
} {
  // Apnea check
  if (!vitals.isBreathing) {
    return { 
      category: 'BLACK', 
      reason: 'Apneic. Reposition airway. If still unresponsive, prioritize viable casualties.',
      urgencyScore: 100 
    };
  }

  let score = 5; // Baseline ambulatory score
  const reasons: string[] = [];

  // 1. Hemorrhage Assessment (+45)
  if (vitals.severeBleeding) {
    score += 45;
    reasons.push('Active arterial/uncontrolled hemorrhage');
  }

  // 2. Respiration Severity Gradient
  if (vitals.respiratoryRate > 35 || vitals.respiratoryRate < 8) {
    score += 35;
    reasons.push(`Critical respiratory failure (${vitals.respiratoryRate} bpm)`);
  } else if (vitals.respiratoryRate > 30 || vitals.respiratoryRate < 10) {
    score += 25;
    reasons.push(`Elevated respiration (${vitals.respiratoryRate} bpm)`);
  } else if (vitals.respiratoryRate > 24) {
    score += 10;
    reasons.push(`Compensatory elevated respiration (${vitals.respiratoryRate} bpm)`);
  }

  // 3. Circulatory Perfusion (+30)
  if (!vitals.radialPulsePresent) {
    score += 30;
    reasons.push('Absent radial pulse indicating shock/circulatory collapse');
  }

  // 4. Neurological Deficit (+15)
  if (!vitals.mentalStatusFollowsCommands) {
    score += 15;
    reasons.push('Altered consciousness/neurological deficit');
  }

  const finalScore = Math.min(score, 100);

  // Category strictly mapped to the 0-100 score brackets
  let category: TriageCategory = 'GREEN';
  if (finalScore >= 70) {
    category = 'RED';
  } else if (finalScore >= 35) {
    category = 'YELLOW';
  } else {
    category = 'GREEN';
  }

  return {
    category,
    reason: reasons.length > 0 ? reasons.join('; ') + '.' : 'Stable baseline parameters.',
    urgencyScore: finalScore
  };
}

export function detectMentalRedFlags(text: string): boolean {
  const normalized = text.toLowerCase();
  const criticalPhrases = [
    'kill myself', 'suicide', 'end my life', 'want to die', 
    'overdose', 'cut my wrists', 'no reason to live'
  ];
  return criticalPhrases.some(phrase => normalized.includes(phrase));
}