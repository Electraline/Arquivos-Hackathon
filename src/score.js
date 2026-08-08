/**
 * score.js
 * --------
 * Turns the raw check results into a single 0-100 "Agent Readiness Score".
 *
 * Weighting logic (intentionally simple + explainable for a hackathon judge):
 *   - Static checks (llms.txt, robots.txt, structured data, landmarks): 45 pts
 *   - axe-core scan, weighted toward agent-blocking violations:          30 pts
 *   - Live agent task completion (did the simulated agent finish?):      25 pts
 * Total: 100
 */

function scoreStaticChecks(staticResults) {
  // resultados com applicable === false (ex: product-schema quando o agente
  // não chegou numa PDP) não entram nem no numerador nem no denominador
  const applicable = staticResults.filter((r) => r.applicable !== false);
  const maxPoints = applicable.reduce((sum, r) => sum + r.weight, 0);
  const earned = applicable.reduce((sum, r) => sum + (r.passed ? r.weight : 0), 0);
  return { earned, maxPoints };
}

function scoreAxe(axeResult) {
  const maxPoints = axeResult.weight; // 30
  if (axeResult.violations.length === 0) return { earned: maxPoints, maxPoints };

  const blocking = axeResult.violations.filter((v) => v.blocksAgent).length;
  const nonBlocking = axeResult.violations.length - blocking;

  // Blocking violations hurt a lot more (they break agent navigation),
  // non-blocking (e.g. color-contrast) hurt a little (still WCAG debt).
  const penalty = Math.min(maxPoints, blocking * 6 + nonBlocking * 1.5);
  return { earned: Math.max(0, maxPoints - penalty), maxPoints };
}

function scoreAgentTask(taskResult) {
  const maxPoints = 25;
  if (!taskResult) return { earned: 0, maxPoints, note: 'Tarefa de agente não executada' };
  const ratio = taskResult.stepsAttempted === 0 ? 0 : taskResult.log.filter((s) => s.success).length / taskResult.totalSteps;
  return { earned: Math.round(ratio * maxPoints), maxPoints };
}

function computeScore({ staticResults, axeResult, taskResult }) {
  const staticScore = scoreStaticChecks(staticResults);
  const axeScore = scoreAxe(axeResult);
  const taskScore = scoreAgentTask(taskResult);

  const earned = staticScore.earned + axeScore.earned + taskScore.earned;
  const max = staticScore.maxPoints + axeScore.maxPoints + taskScore.maxPoints;
  const total = Math.round((earned / max) * 100);

  return {
    total,
    breakdown: {
      static: staticScore,
      axe: axeScore,
      agentTask: taskScore,
    },
    grade: total >= 85 ? 'A' : total >= 70 ? 'B' : total >= 50 ? 'C' : total >= 30 ? 'D' : 'F',
  };
}

module.exports = { computeScore };