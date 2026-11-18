import type { FaultSeverity, MissionDebrief } from './mission-contract';

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

export function exerciseTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

export function severityLabel(severity: FaultSeverity): string {
  return { normal: 'Normal', moderate: 'Moderate', severe: 'Severe', failed: 'Breakdown' }[severity];
}

export function missionDebriefTitle(report: MissionDebrief): string {
  if (report.outcome === 'failed' && report.failureReason === 'dismount-outside-zone') return 'Squad unloaded outside the dismount zone.';
  return { complete: 'Dismount point reached.', failed: 'Vehicle lost to contact damage.', recovery: 'Recovery requested.', breakdown: 'Vehicle breakdown.' }[report.outcome];
}

export function missionDebriefMarkup(report: MissionDebrief): string {
  const title = missionDebriefTitle(report);
  const status = { 'requires-inspection': 'Post-mission inspection', 'repair-required': 'Repair required', 'major-repair': 'Major repair required', immobilized: 'Vehicle immobilized' }[report.vehicleStatus];
  const decisions = { continue: 'Continued mission with fault unresolved', diagnose: 'Inspected fault; no repair performed', 'reduce-pace': 'Reduced pace to limit further damage', recovery: 'Called in-game recovery; vehicle stopped' };
  const findingLabel = (fault: MissionDebrief['findings'][number]) => fault.severity === 'normal'
    ? { charging: 'Charging system', cooling: 'Cooling system', 'wheel-end': 'Wheel end' }[fault.id] : fault.label;
  const timeline = [
    ...report.findings.flatMap(fault => fault.firstWarningAt === null ? [] : [{ time: fault.firstWarningAt, text: `${fault.label}: first warning` }]),
    ...report.findings.flatMap(fault => fault.severeAt === null ? [] : [{ time: fault.severeAt, text: `${fault.label}: severe warning` }]),
    ...report.decisions.map(decision => ({ time: decision.time, text: `${decisions[decision.action]}${decision.faultId ? ` · ${report.findings.find(fault => fault.id === decision.faultId)?.label ?? decision.faultId}` : ''}` })),
    { time: report.endedAt, text: title },
  ].sort((a, b) => a.time - b.time);
  return `<div class="health-hardware"><span>MFoCS / AFTER-ACTION RECORD</span><img class="health-corner-logo debrief-corner-logo" src="/branding/shift5-logo.svg" alt="Shift5"></div>
    <div class="mission-debrief-content"><header class="mission-debrief-heading"><div><span class="eyebrow">MISSION DEBRIEF</span><h2 id="mission-debrief-title">${title}</h2></div><button class="health-close" data-action="close-debrief" aria-label="Close mission debrief">Close &times;</button></header>
    <p class="mission-debrief-summary">${escapeHtml(report.summary)}</p>
    <div class="debrief-metrics"><div><span>ELAPSED</span><strong>${exerciseTime(report.endedAt)}</strong></div><div><span>DISTANCE</span><strong>${Math.round(report.distanceTravelled)} <small>game units</small></strong></div><div><span>CONTACTS CLEARED</span><strong>${report.contactsCleared} / ${report.contactsTotal}</strong></div></div>
    <section class="debrief-repair"><span class="eyebrow">VEHICLE CONDITION</span><h3>${status}</h3>${report.outcome === 'complete' && report.vehicleStatus === 'major-repair' ? '<p>The mission was completed, but continued driving left major repair work.</p>' : ''}<div class="debrief-findings">${report.findings.map(fault => `<article data-severity="${fault.severity}"><div><h4>${escapeHtml(findingLabel(fault))}</h4><span class="fault-severity">${severityLabel(fault.severity)}</span></div><p>${escapeHtml(fault.consequence)}</p><p class="repair-work"><b>After this run:</b> ${escapeHtml(fault.repair)}</p><small>${fault.firstWarningAt === null ? 'No warning recorded' : `First warning ${exerciseTime(fault.firstWarningAt)}`} · ${fault.diagnosed ? 'Inspected by crew' : 'Not inspected by crew'}</small></article>`).join('')}</div></section>
    ${report.optionalVisitedLabels?.length ? `<section class="debrief-exploration"><span class="eyebrow">OPTIONAL STOPS VISITED</span><p>${report.optionalVisitedLabels.map(escapeHtml).join(' &middot; ')}</p></section>` : ''}
    <section class="debrief-timeline"><span class="eyebrow">WARNINGS &amp; CREW DECISIONS</span><ol>${timeline.map(entry => `<li><time>${exerciseTime(entry.time)}</time><span>${escapeHtml(entry.text)}</span></li>`).join('')}</ol></section>
    <p class="health-disclaimer">Training data · illustrative vehicle behavior and repair consequences. No real diagnosis, repair estimate or outbound recovery message.</p></div>
    <footer class="mission-debrief-actions"><button class="primary-button" data-action="restart">Restart mission <span aria-hidden="true">↗</span></button><button class="secondary-button" data-action="menu">Main menu</button><button class="secondary-button" data-action="close-debrief">Return to vehicle</button></footer>`;
}
