import type { VitalsInput, TriageCategory } from './types';

export function evaluatePhysicalTriage(vitals: VitalsInput): { 
  category: TriageCategory; 
  reason: string; 
  urgencyScore: number 
} {
  // Apnea check: immediate fatal arrest
  if (!vitals.isBreathing) {
    return { 
      category: 'RED', 
      reason: 'Apneic: Immediate airway clearance and rescue ventilation required.',
      urgencyScore: 100 
    };
  }

  const reasons: string[] = [];

  // 1. Dynamic Respiratory Score (Curve based on deviation from optimal 16 bpm)
  // Normal resting rate: 12 - 20 bpm
  const targetRate = 16;
  const rr = Math.max(0, Math.min(80, vitals.respiratoryRate));
  let respScore: number;

  if (rr > 20) {
    // Scales dynamically: 21 bpm adds ~5 points, 30 bpm adds ~30 points, 50 bpm adds ~48 points
    respScore = Math.min(50, Math.round(Math.pow(rr - targetRate, 1.35) * 1.5));
    if (rr >= 30) {
      reasons.push(`Severe tachypnea (${rr} bpm)`);
    } else if (rr >= 24) {
      reasons.push(`Compensatory elevated respiration (${rr} bpm)`);
    }
  } else if (rr < 12) {
    // Depression / Bradypnea: 11 bpm adds ~10 points, 6 bpm adds ~40 points
    respScore = Math.min(50, Math.round(Math.pow(targetRate - rr, 1.4) * 2.2));
    if (rr < 10) {
      reasons.push(`Severe bradypnea (${rr} bpm)`);
    }
  } else {
    // Normal baseline variation between 12 and 20 bpm (gives 2 to 6 points)
    respScore = Math.abs(rr - targetRate) + 2;
  }

  // 2. Hemorrhage Dynamic Impact
  // Active bleeding adds severe base urgency + scales slightly with respiratory stress
  let bleedScore = 0;
  if (vitals.severeBleeding) {
    bleedScore = 42 + Math.min(10, Math.round(respScore * 0.2));
    reasons.push('Active uncontrolled arterial hemorrhage');
  }

  // 3. Circulatory Perfusion Shock
  let pulseScore = 0;
  if (!vitals.radialPulsePresent) {
    pulseScore = 28 + Math.min(8, Math.round(respScore * 0.15));
    reasons.push('Absent radial pulse (circulatory shock)');
  }

  // Base human baseline score is 4
  const rawScore = 4 + respScore + bleedScore + pulseScore;

  // Strict life-threat check: Any true red flag guarantees a minimum score of 72
  const isLifeThreat = 
    vitals.severeBleeding || 
    rr >= 30 || 
    rr < 10 || 
    !vitals.radialPulsePresent;

  let calculatedScore = rawScore;
  if (isLifeThreat && calculatedScore < 72) {
    calculatedScore = 72 + Math.round((calculatedScore % 10) * 1.8);
  }

  const finalScore = Math.max(1, Math.min(99, calculatedScore));

  // Triage category mapping based on clinical status
  let category: TriageCategory;
  if (isLifeThreat || finalScore >= 70) {
    category = 'RED';
  } else if (finalScore >= 35 || (rr >= 24 && rr <= 29)) {
    category = 'YELLOW';
  } else {
    category = 'GREEN';
  }

  return {
    category,
    reason: reasons.length > 0 ? reasons.join('; ') + '.' : 'Normal physiological parameters. Stable baseline.',
    urgencyScore: finalScore
  };
}

export function detectMentalRedFlags(text: string): boolean {
  const normalized = text.toLowerCase();
  const criticalPhrases = [
    'kill myself', 'suicide', 'end my life', 'want to die', 'dying',
    'overdose', 'cut my wrists', 'no reason to live', 'hang myself',
    'hearing voices', 'people are watching me', 'hurt someone', 'end it all',
    'cant go on', "can't go on", 'better off dead', 'take my life'
  ];
  return criticalPhrases.some(phrase => normalized.includes(phrase));
}