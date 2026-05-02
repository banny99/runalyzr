import type { AnalysisResults, FindingItem } from './types';

type FindingTemplate = { red: string; amber: string };

const FINDING_TEMPLATES: Partial<Record<keyof AnalysisResults, FindingTemplate>> = {
  kneeFlexionAtContact: {
    red: 'Knee is nearly fully extended at initial contact ({value}°), indicating significant heel striking. Consider increasing cadence and landing with greater knee flexion.',
    amber: 'Knee flexion at initial contact ({value}°) is slightly below optimal. Minor adjustment to footstrike pattern may be beneficial.',
  },
  pelvicDrop: {
    red: 'Contralateral pelvic drop of {value}° during stance phase exceeds normal range, suggesting hip abductor weakness. Hip strengthening exercises recommended.',
    amber: 'Mild contralateral pelvic drop of {value}° detected. Worth monitoring.',
  },
  hipAdduction: {
    red: 'Hip adduction of {value}° during stance is excessive. Combined with pelvic drop this may indicate iliotibial band stress.',
    amber: 'Hip adduction of {value}° is slightly elevated during stance phase.',
  },
  trunkLateralLean: {
    red: 'Trunk lateral lean of {value}° is excessive, indicating possible hip weakness or compensatory movement. Core stability work recommended.',
    amber: 'Mild trunk lateral lean of {value}° noted. May indicate fatigue or minor hip weakness.',
  },
  ankleDorsiflexion: {
    red: 'Ankle dorsiflexion at contact is reduced ({value}°), suggesting limited ankle mobility. Gastrocnemius/soleus stretching and ankle mobility work indicated.',
    amber: 'Ankle dorsiflexion at contact ({value}°) is slightly below optimal.',
  },
  cadence: {
    red: 'Cadence of {value} spm is below optimal range. Low cadence is associated with increased impact loading. Aim to increase by 5–10%.',
    amber: 'Cadence of {value} spm is slightly low. A minor increase may reduce injury risk.',
  },
  verticalOscillation: {
    red: 'Vertical oscillation of {value} cm is excessive, representing wasted energy. Focus on running along the ground with reduced up-and-down movement.',
    amber: 'Vertical oscillation of {value} cm is slightly above optimal.',
  },
  overstriding: {
    red: 'Significant overstriding detected ({value} cm ahead of centre of mass at contact). This increases braking forces and injury risk. Land closer to your centre of mass.',
    amber: 'Mild overstriding detected ({value} cm). Landing slightly closer to centre of mass is advised.',
  },
  strideSymmetry: {
    red: 'Stride asymmetry of {value}% is significant, suggesting a compensation pattern or underlying injury. Asymmetries above 10% warrant clinical investigation.',
    amber: 'Mild stride asymmetry of {value}% detected. Monitoring recommended.',
  },
  groundContactTime: {
    red: 'Ground contact time of {value} ms is excessive, suggesting inefficient push-off mechanics. Focus on quick ground contact and strong toe-off.',
    amber: 'Ground contact time of {value} ms is slightly above optimal.',
  },
};

export function generateFindings(results: AnalysisResults): FindingItem[] {
  const findings: FindingItem[] = [];

  for (const [key, result] of Object.entries(results) as [keyof AnalysisResults, typeof results[keyof AnalysisResults]][]) {
    if (!result || result.status === 'green' || result.status === 'unknown') continue;
    const template = FINDING_TEMPLATES[key];
    if (!template) continue;

    const text = template[result.status as 'red' | 'amber'].replace(
      '{value}',
      result.value.toFixed(1),
    );
    findings.push({ metric: key, status: result.status as 'red' | 'amber', text });
  }

  return findings.sort((a, b) =>
    (a.status === 'red' ? 0 : 1) - (b.status === 'red' ? 0 : 1)
  );
}
