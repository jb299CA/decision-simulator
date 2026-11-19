import './style.css';
import { TouchStick, withTouchStick } from './touch-stick';
import { OutcomeReveal } from './outcome-reveal';
import { MissionBriefing, practicePrompt } from './mission-briefing';
import { MissionStaging, MISSION_STAGING_CAPTION } from './mission-staging';
import { Simulation } from './simulation';
import { GuidedExercise, GUIDED_STEPS } from './guided-exercise';
import type { Phase } from './simulation';
import { VehicleScene } from './scene';
import { SimulationAudio, captionForPhase, recoveryCaption } from './audio';
import { DrivingRange } from './range';
import { executeRampCommand, rampCommandAvailability } from './ramp-command';
import type { RampCommandContext } from './ramp-command';
import type { RangeView } from './range';
import { RANGE_VIEWS } from './mission-contract';
import type { FaultId, VehicleFault, MissionDebrief } from './mission-contract';
import { CabinDisplayState } from './cabin-display';
import { VehicleInspector } from './vehicle-inspector';
import { escapeHtml, exerciseTime, missionDebriefMarkup, missionDebriefTitle, severityLabel } from './debrief-view';
import { WORLD_BOUNDS, MISSION_ROUTE, MISSION_START, DEPARTURE_Z, POINTS_OF_INTEREST, SIDE_ROADS } from './world-config';
import { contactVisibility, mapHeading, mapPoint, mapWorldPoint, objectivePointer, PLAYER_MARKER_PATH } from './mission-map';
import { clientMapPoint, MapNavigation } from './map-navigation';
import { drivingInput, gameKeyCode, permitsGameKeys, rangeViewForKey, routeDrivingKeyDown, RangeInspection, RangeKeyboard } from './input';
import { GameFocusOwnership, nextTrappedFocus } from './ui-focus';
import { PageLifecycle } from './page-lifecycle';
import { PlaybackFocus } from './playback-focus';
import { loadGamePreferences, saveGamePreferences } from './game-preferences';
import { faultInstrumentData, systemsHealthMarkup } from './fault-display';

const sim = new Simulation();
const guidedExercise = new GuidedExercise();
let guidedRoadmapOpen = false;
const audio = new SimulationAudio();
let lastMusicPreparing = false;
let lastSoundState: SimulationAudio['soundState'] | undefined;
const range = new DrivingRange(Math.random);
type Mode = 'home' | 'briefing' | 'mission' | 'range';
const missionBriefing = new MissionBriefing();
const missionStaging = new MissionStaging();
let mode: Mode = 'home';
let rangeView: RangeView = 'chase';
const cabinDisplay = new CabinDisplayState();
const keyboard = new RangeKeyboard();
const gameFocus = new GameFocusOwnership();
const touchStick = new TouchStick();
const rangeDrawerInspection = new RangeInspection();
let drawerReturnFocus: HTMLElement | null = null;
const drawerBackground = new Map<HTMLElement, boolean>();
const healthInspection = new RangeInspection();
let healthReturnFocus: HTMLElement | null = null;
let lastHealthAlertSerial = 0;
const mapInspection = new RangeInspection();
const mapNavigation = new MapNavigation();
let mapReturnFocus: HTMLElement | null = null;
let lastMissionStatus = '';
let selectedFault: FaultId = 'charging';
let healthInspector: VehicleInspector | null = null;
let guidedInspector: VehicleInspector | null = null;
let guidedLayoutObserver: ResizeObserver | null = null;
let guidedWarningAt: number | null = null;
let guidedSevereAt: number | null = null;
let shownDebrief: MissionDebrief | null = null;
const outcomeReveal = new OutcomeReveal();
let debriefReturnFocus: HTMLElement | null = null;
const heldPointers = new Map<number, string>();
let aimInput = 0;
let aimPointer: number | undefined;
let cruise = false;
let rangeControlsExpanded = false;
const compactRangeControls = window.matchMedia('(max-width: 760px), (pointer: coarse) and (max-height: 540px)');
let lastRangeShots = 0;
let lastRangeHits = 0;
const observedBrokenBoards = new Set<string>();
let rangeEventFeedback = '';
let rangeEventFeedbackUntil = 0;
let rangeFeedback = '';
let rangeFeedbackUntil = 0;
let rampCommandFeedback = '';
let rampCommandFeedbackUntil = 0;
let rangeUiClock = 0;
let graphicsAvailable = true;
const preferences = loadGamePreferences();
let muted = preferences.muted;
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
let reducedMotion = preferences.reducedMotion ?? motionPreference.matches;
audio.setMuted(muted);
audio.setMusicEnabled(preferences.musicEnabled);
document.body.classList.toggle('reduced-motion', reducedMotion);
let insideView = true;
let evidenceOpen = false;
let displayExpanded = false;
let lastCaption = '';
let lastPhase: Phase | undefined;
let lastAlert = false;
let lastSampleCount = -1;
let lastSampleTime = -1;
let previousFrame = performance.now();
const playbackFocus = new PlaybackFocus({
  clearInputs: () => { cancelMapGesture(); clearRangeInputs(); },
  resetFrame: () => { previousFrame = performance.now(); },
  syncAudio: () => { audio.setPaused(audioPaused(), inspectionAudioContinues()); syncSoundControls(); },
});

const arrow = '<span aria-hidden="true">↗</span>';
const chapters = ['Approach', 'Observe', 'Understand', 'Decide', 'Protect', 'Debrief'];
const phaseChapter: Record<Phase, number> = { title: 0, exterior: 0, cabin: 1, feed: 1, manifold: 2, turbine: 2, insight: 3, halted: 4, secured: 4, service: 4, debrief: 5 };
const phaseIndex: Record<Phase, number> = { title: 0, exterior: 1, cabin: 2, feed: 3, manifold: 4, turbine: 5, insight: 6, halted: 7, secured: 8, service: 9, debrief: 10 };

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div id="scene" aria-hidden="true"></div><div class="scene-shade" aria-hidden="true"></div>
  <div class="app-shell">
    <header class="masthead"><a class="brand" href="#" data-action="menu" aria-label="Shift5 simulator home"><img src="/branding/shift5-logo.svg" alt="Shift5"><span>STRYKER<br><b>MISSION SIMULATOR</b></span></a>
      <div class="edition"><span class="edition-separator">/</span><span>EXPLORE. OBSERVE. DECIDE.</span></div>
      <div class="controls" aria-label="Simulation controls">
        <button class="icon-control music-control" data-action="music" aria-pressed="true" title="Toggle background music"><span class="control-icon" aria-hidden="true">&#9835;</span><span class="control-name" id="music-label">Music on</span></button>
        <button class="icon-control" data-action="mute" aria-pressed="false" title="Mute sound (M)"><span class="control-icon" id="sound-icon">◖))</span><span class="control-name" id="sound-label">Sound on</span></button>
        <button class="icon-control" data-action="pause" aria-pressed="false" title="Pause (P)"><span class="control-icon" id="pause-icon">Ⅱ</span><span class="control-name" id="pause-label">Pause</span></button>
        <button class="icon-control" data-action="motion" aria-pressed="${reducedMotion}" title="Reduce camera and scene motion"><span class="control-icon">≈</span><span class="control-name">Motion</span></button>
        <button class="icon-control fullscreen-control" data-action="fullscreen" aria-pressed="false" title="Toggle fullscreen"><span class="control-icon" aria-hidden="true">⛶</span><span class="control-name">Fullscreen</span></button>
        <button class="icon-control restart-control" data-action="restart" title="Restart exercise"><span class="control-icon">↺</span><span class="control-name">Restart</span></button>
        <button class="icon-control menu-control" data-action="menu" aria-label="Return to home menu" title="Return to home menu"><span class="control-icon" aria-hidden="true">⌂</span><span class="control-name">Home</span></button>
        <button class="icon-control range-menu-toggle" data-action="range-drawer" aria-expanded="false" aria-controls="range-drawer" aria-label="Mission details and settings" title="Mission details and settings"><span class="range-menu-label">Menu</span><span class="range-menu-desktop-label">Mission instructions</span></button>
      </div>
    </header>
    <nav class="chapter-rail" aria-label="Exercise progress">${chapters.map((name, i) => `<span class="chapter" data-chapter="${i}"><i>${String(i + 1).padStart(2, '0')}</i><span>${name}</span></span>`).join('')}</nav>
    <main id="stage" tabindex="-1"></main>
    <dialog class="pause-menu" id="pause-banner" aria-labelledby="pause-title" aria-describedby="pause-description"><img src="/branding/shift5-logo.svg" alt="Shift5"><span class="eyebrow">MISSION SIMULATOR</span><h2 id="pause-title">Paused</h2><p id="pause-description">Scene, telemetry and sound are held.</p><button class="pause-resume" data-action="pause" autofocus><span aria-hidden="true">&#9654;</span> Resume</button><small>Press <kbd>P</kbd> to resume</small></dialog>
    <footer class="bottom-bar"><div class="caption"><span class="caption-label">CREW / SYSTEM</span><span id="caption" role="status" aria-live="polite"></span></div><div class="exercise-label"><span class="tiny-cross">+</span> TRAINING RUN <span id="elapsed">00:00</span></div></footer>
  </div>
  <dialog id="evidence-dialog" aria-labelledby="evidence-title"><div class="dialog-header"><div><span class="eyebrow">Vehicle readings</span><h2 id="evidence-title">Charging-system readings</h2></div><button data-action="close-evidence" class="close-button" aria-label="Close evidence">×</button></div><p>These readings are generated for this exercise. Compare output with electrical load, engine state and the time of each reading. Output alone does not confirm a failed alternator.</p><div class="evidence-chart" id="detail-chart"></div><div class="evidence-facts"><div><span>Readings from</span><b>Existing vehicle / MFoCS access</b></div><div><span>Prepared by</span><b>Manifold &rarr; Turbine</b></div><div><span>Assessment</span><b>Suspected charging-system fault</b></div></div><div class="sample-table-wrap"><table><caption>Latest training readings &middot; illustrative values</caption><thead><tr><th>Exercise time</th><th>Voltage¹</th><th>Load</th><th>Engine</th><th>Reading status</th></tr></thead><tbody id="sample-table"></tbody></table></div><p class="fine-print">¹ Illustrative volts. This is an explanatory product demonstration, with no live vehicle connection or verified integration. No maintenance or wiring procedure is provided.</p><div class="dialog-transport"><p id="dialog-caption" role="status" aria-live="polite"></p><div class="dialog-controls" aria-label="Simulation controls"><button data-action="mute" aria-pressed="false">Sound</button><button data-action="pause" aria-pressed="false">Pause / resume</button><button data-action="motion" aria-pressed="false">Reduced motion</button><button data-action="restart">Restart</button></div></div><button class="primary-button" data-action="close-evidence">Return to exercise ${arrow}</button></dialog>
`;

const stage = document.querySelector<HTMLElement>('#stage')!;
const pauseBanner = document.querySelector<HTMLDialogElement>('#pause-banner')!;
let scene: Pick<VehicleScene, 'update' | 'updateRange' | 'resize' | 'dispose' | 'setViewMode' | 'setGunnerDisplay'> & { createInspectionModel(): import('three').Group | null };
try {
  scene = new VehicleScene(document.querySelector<HTMLElement>('#scene')!);
} catch (error) {
  graphicsAvailable = false;
  // Preserve the full decision exercise if this browser cannot create a WebGL context.
  const container = document.querySelector<HTMLElement>('#scene')!;
  container.innerHTML = '<div class="scene-fallback"><svg viewBox="0 0 1200 700" role="presentation"><path fill="#798878" d="M0 390 180 180 260 270 420 100 620 310 750 210 950 390 1200 260V700H0Z"/><path fill="#aaa082" d="M0 470Q400 340 1200 470V700H0Z"/><g fill="#596546" stroke="#313c2a" stroke-width="7"><path d="m380 450 38-69 300-4 70 66-8 73H380Z"/><path d="m440 382 45-42h157l51 40Z"/><path d="m529 339 4-29h62l16 29Z"/><path d="M564 311v-43"/><g fill="#272d24"><circle cx="435" cy="514" r="39"/><circle cx="529" cy="514" r="39"/><circle cx="624" cy="514" r="39"/><circle cx="718" cy="514" r="39"/></g><g fill="#687454"><circle cx="435" cy="514" r="17"/><circle cx="529" cy="514" r="17"/><circle cx="624" cy="514" r="17"/><circle cx="718" cy="514" r="17"/></g></g></svg></div>';
  const fallbackNote = document.createElement('div');
  fallbackNote.className = 'graphics-note';
  fallbackNote.textContent = 'Simplified scene · 3D graphics unavailable';
  document.querySelector('.app-shell')!.append(fallbackNote);
  scene = { update() {}, updateRange() {}, resize() {}, dispose() {}, setViewMode() {}, setGunnerDisplay() {}, createInspectionModel() { return null; } };
  console.warn('3D scene unavailable; decision exercise remains usable.', error);
}
const dialog = document.querySelector<HTMLDialogElement>('#evidence-dialog')!;
const caption = document.querySelector<HTMLElement>('#caption')!;
const healthDialog = document.createElement('dialog');
healthDialog.id = 'health-dialog';
healthDialog.setAttribute('aria-labelledby', 'health-title');
healthDialog.setAttribute('aria-describedby', 'health-inspection-note');
document.querySelector('#app')!.append(healthDialog);

const mapDialog = document.createElement('dialog');
mapDialog.id = 'mission-map-dialog';
mapDialog.setAttribute('aria-labelledby', 'mission-map-title');
mapDialog.innerHTML = `<section class="expanded-map-panel"><header><div><span class="eyebrow"><span data-callsign>${escapeHtml(audio.missionCallsign)}</span> / NORTH UP</span><h2 id="mission-map-title">Mission map</h2></div><button data-action="close-map" aria-label="Close mission map">Close &times;</button></header><p>Driving and exercise time are paused. Music and background sounds continue if sound is on. Optional stops do not change the mission objective.</p><div class="map-tools" role="group" aria-label="Map view"><button data-action="map-zoom-out" aria-label="Zoom out">&minus;</button><output id="map-zoom" aria-label="Map zoom">1&times;</output><button data-action="map-zoom-in" aria-label="Zoom in">+</button><button data-action="map-fit">Fit all</button><button data-action="map-recenter">Find vehicle</button></div><p id="map-help">Drag to pan. Tap to set a waypoint, or choose a stop below. With map focused, arrow keys pan and + / &minus; zoom.</p><svg id="expanded-mission-map" data-mission-map viewBox="0 0 160 180" role="img" tabindex="0" aria-describedby="map-help" aria-label="Interactive north-up map; route, optional stops, vehicle and dismount objective"></svg><div class="expanded-map-legend"><span>&#9650; You</span><span>&#9671; DP: dismount point</span><span>LD: departure line</span><span>+ Waypoint</span><span>&#9675; Optional stop / &#10003; visited</span><span data-map-contact-legend hidden>&#9675; Troop &nbsp; &#9633; Gun truck<br>Hollow: estimated / Filled: detected / &times;: cleared</span></div><section class="map-stop-section" aria-labelledby="map-stops-title"><h3 id="map-stops-title">Optional stops</h3><div id="map-stop-list">${POINTS_OF_INTEREST.map(point => `<button data-action="map-stop-${point.id}" aria-pressed="false"><span>${escapeHtml(point.label)}</span><small>${escapeHtml(point.description)}</small><b data-visit-status>Not visited</b></button>`).join('')}</div></section><div class="map-selection"><p id="map-selection-status" role="status" aria-live="polite">No optional waypoint selected.</p><button data-action="map-clear">Clear waypoint</button></div><p class="expanded-map-location"></p><footer class="display-brand-footer"><img src="/branding/shift5-logo.svg" alt="Shift5"></footer></section>`;
document.querySelector('#app')!.append(mapDialog);
const expandedMap = mapDialog.querySelector<SVGSVGElement>('#expanded-mission-map')!;

function cancelMapGesture(): void {
  const pointers = mapNavigation.pointerIds;
  mapNavigation.cancel();
  for (const id of pointers) if (expandedMap.hasPointerCapture(id)) expandedMap.releasePointerCapture(id);
}

expandedMap.addEventListener('pointerdown', event => {
  if (!mapInspection.open || event.button !== 0) return;
  event.preventDefault();
  expandedMap.focus({ preventScroll: true });
  expandedMap.setPointerCapture(event.pointerId);
  mapNavigation.begin(event.pointerId, event.clientX, event.clientY, expandedMap.getBoundingClientRect());
});
expandedMap.addEventListener('pointermove', event => {
  if (!mapInspection.open || !mapNavigation.move(event.pointerId, event.clientX, event.clientY)) return;
  event.preventDefault(); syncMapViewport();
});
expandedMap.addEventListener('pointerup', event => {
  const tapped = mapInspection.open && mapNavigation.end(event.pointerId, event.clientX, event.clientY);
  syncMapViewport();
  if (expandedMap.hasPointerCapture(event.pointerId)) expandedMap.releasePointerCapture(event.pointerId);
  if (!tapped) return;
  const point = clientMapPoint(event.clientX, event.clientY, expandedMap.getBoundingClientRect(), mapNavigation.view);
  if (!point) return;
  const stop = POINTS_OF_INTEREST.find(stop => { const p = mapPoint(stop.x, stop.z); return Math.hypot(p.x - point.x, p.y - point.y) <= 5 / mapNavigation.zoom; });
  if (stop) range.selectNavigationTarget(stop.id);
  else { const world = mapWorldPoint(point.x, point.y); range.selectNavigationPoint(world.x, world.z); }
  updateMissionMap();
});
for (const name of ['pointercancel', 'lostpointercapture'] as const) expandedMap.addEventListener(name, event => {
  mapNavigation.cancelPointer(event.pointerId);
});
expandedMap.addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', 'Home'].includes(event.key)) return;
  cancelMapGesture();
  const delta = mapNavigation.view.width * .15;
  if (event.key === 'ArrowLeft') mapNavigation.pan(-delta, 0);
  else if (event.key === 'ArrowRight') mapNavigation.pan(delta, 0);
  else if (event.key === 'ArrowUp') mapNavigation.pan(0, -delta);
  else if (event.key === 'ArrowDown') mapNavigation.pan(0, delta);
  else if (event.key === '+' || event.key === '=') mapNavigation.setZoom(mapNavigation.zoom * 1.5);
  else if (event.key === '-') mapNavigation.setZoom(mapNavigation.zoom / 1.5);
  else if (event.key === 'Home') mapNavigation.fit();
  else return;
  event.preventDefault(); syncMapViewport();
});

function syncMapViewport(): void {
  const view = mapNavigation.view;
  expandedMap.setAttribute('viewBox', `${view.x} ${view.y} ${view.width} ${view.height}`);
  mapDialog.querySelector('#map-zoom')!.textContent = `${mapNavigation.zoom.toFixed(1).replace('.0', '')}\u00d7`;
  mapDialog.querySelector<HTMLButtonElement>('[data-action="map-zoom-out"]')!.disabled = mapNavigation.zoom <= 1;
  mapDialog.querySelector<HTMLButtonElement>('[data-action="map-zoom-in"]')!.disabled = mapNavigation.zoom >= 4;
}

function openMap(): void {
  if (mode !== 'range' || mapInspection.open || healthInspection.open || rangeDrawerInspection.open || debriefDialog.open || dialog.open) return;
  mapReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  mapInspection.begin(range.paused, keyboard);
  clearRangeInputs();
  setPaused(true);
  updateMissionMap();
  mapDialog.showModal();
  document.querySelector('#map-toggle')?.setAttribute('aria-expanded', 'true');
  mapDialog.querySelector<HTMLButtonElement>('button')!.focus({ preventScroll: true });
}

function closeMap(): void {
  if (!mapInspection.open) return;
  const paused = mapInspection.end(keyboard);
  cancelMapGesture();
  mapDialog.close();
  clearRangeInputs();
  setPaused(paused);
  document.querySelector('#map-toggle')?.setAttribute('aria-expanded', 'false');
  if (mapReturnFocus?.isConnected) mapReturnFocus.focus({ preventScroll: true }); else stage.focus({ preventScroll: true });
  mapReturnFocus = null;
}


const debriefDialog = document.createElement('dialog');
debriefDialog.id = 'mission-debrief-dialog';
debriefDialog.setAttribute('aria-labelledby', 'mission-debrief-title');
document.querySelector('#app')!.append(debriefDialog);

function faultChart(fault: VehicleFault): string {
  const data = faultInstrumentData(fault);
  const reading = data.current === null ? 'No data' : `${Math.round(data.current)}`;
  const delta = data.delta === null ? 'Unavailable' : `${data.delta >= 0 ? '+' : ''}${data.delta.toFixed(1)} pp`;
  const signal = { charging: 'CHARGING OUTPUT', cooling: 'COOLANT TEMPERATURE', 'wheel-end': 'WHEEL-END VIBRATION' }[fault.id];
  const chart = !data.last ? '<p class="fault-chart-empty">Waiting for recorded samples.</p>' : `<svg class="fault-chart" viewBox="0 0 500 180" role="img" aria-label="${escapeHtml(fault.component)} trend, percent of starting reading. Latest recorded sample ${Math.round(data.last.value)} percent at ${exerciseTime(data.last.time)}. Dashed line marks the exercise baseline."><text class="fault-axis-title" x="48" y="12">% OF START</text>${data.ticks.map(tick => `<path d="M48 ${data.y(tick)}H480" class="fault-grid"/><text x="39" y="${data.y(tick) + 4}" text-anchor="end">${Number(tick.toFixed(1))}</text>`).join('')}${data.baseline === null ? '' : `<path d="M48 ${data.y(data.baseline)}H480" class="fault-baseline"/>`}<polyline points="${data.points}" class="fault-line"/><circle class="fault-latest" cx="${data.x(data.last.time)}" cy="${data.y(data.last.value)}" r="4"/><text x="48" y="151">${exerciseTime(data.first)}</text>${data.samples.length > 1 ? `<text x="480" y="151" text-anchor="end">${exerciseTime(data.last.time)}</text>` : ''}<text class="fault-axis-title" x="264" y="173" text-anchor="middle">EXERCISE TIME / MM:SS</text></svg>`;
  return `<div class="fault-chart-heading"><span>${signal}<small>Relative to start</small></span><strong>${reading}${data.current === null ? '' : '<small>%</small>'}</strong></div><div class="fault-reading-meta"><span>Baseline <b>${data.baseline === null ? '&mdash;' : `${Math.round(data.baseline)}%`}</b></span><span>Change <b>${delta}</b></span></div>${chart}<div class="fault-chart-key"><span><i></i>Recorded trend / latest dot</span><span class="baseline-key">Start reference</span></div>`;
}

function faultTitle(fault: VehicleFault): string { return fault.severity === 'normal' ? fault.component : fault.label; }

function faultSelectors(faults: readonly VehicleFault[], prefix: string): string {
  return faults.map(fault => `<button class="fault-selector" data-action="${prefix}-${fault.id}" data-severity="${fault.severity}" aria-pressed="${fault.id === selectedFault}"><span class="sensor-indicator"></span><span><b>${escapeHtml(faultTitle(fault))}</b><small>${escapeHtml(fault.component)}</small></span><span class="fault-severity">${severityLabel(fault.severity)}</span></button>`).join('');
}

function syncFaultSelectors(container: Element, faults: readonly VehicleFault[], prefix: string): void {
  if (!container.childElementCount) container.innerHTML = faultSelectors(faults, prefix);
  faults.forEach(fault => {
    const button = container.querySelector<HTMLButtonElement>(`[data-action="${prefix}-${fault.id}"]`)!;
    button.dataset.severity = fault.severity;
    button.setAttribute('aria-pressed', String(fault.id === selectedFault));
    button.querySelector('.fault-severity')!.textContent = severityLabel(fault.severity);
    button.querySelector('b')!.textContent = faultTitle(fault);
  });
}

function faultDetails(fault: VehicleFault): string {
  const last = faultInstrumentData(fault).last;
  return `<div class="fault-detail-heading"><div><span class="eyebrow">SELECTED COMPONENT</span><h3>${escapeHtml(fault.component)}</h3></div><span class="fault-severity" data-severity="${fault.severity}">${severityLabel(fault.severity)}</span></div><div class="fault-record"><span>SENSOR ${fault.id.toUpperCase()} / SIM</span><span>Sample <time>${last ? exerciseTime(last.time) : '&mdash;'}</time></span></div>${faultChart(fault)}<dl class="fault-context"><div><dt>First warning</dt><dd>${fault.firstWarningAt === null ? 'None recorded' : exerciseTime(fault.firstWarningAt)}</dd></div><div><dt>Crew inspection</dt><dd>${fault.diagnosed ? 'Recorded / not repaired' : 'Not yet inspected'}</dd></div><div class="fault-source"><dt>Reading source</dt><dd>Simulated vehicle / MFoCS feed<br>Manifold &rarr; Turbine</dd></div></dl><div class="fault-consequence"><b>${fault.severity === 'normal' ? 'System status' : fault.diagnosed ? 'Inspection assessment' : 'Continued-driving risk'}</b><p>${escapeHtml(fault.consequence)}</p></div>${fault.severity !== 'normal' || fault.diagnosed ? `<p class="fault-repair"><b>Maintenance:</b> ${escapeHtml(fault.repair)}</p>` : ''}${fault.id === 'charging' && fault.severity !== 'normal' ? '<p class="screen-note">Alternator suspected. Readings alone do not confirm the failed component.</p>' : ''}`;
}

function selectFault(id: FaultId, guided = false): void {
  selectedFault = id;
  if (guided) updateGuidedInspection(); else renderHealthPanel();
}

const systemsHealthContents = new WeakMap<Element, string>();
function syncSystemsHealth(host: Element, faults: readonly VehicleFault[]): void {
  const markup = systemsHealthMarkup(faults);
  // The score lives beside the model: no canvas replacement or live announcements.
  if (systemsHealthContents.get(host) !== markup) {
    host.innerHTML = markup;
    systemsHealthContents.set(host, markup);
  }
}

function mountHealthInspector(): void {
  const host = healthDialog.querySelector<HTMLElement>('#health-vehicle-model');
  if (!host || healthInspector) return;
  healthInspector = new VehicleInspector(host, scene.createInspectionModel(), id => selectFault(id));
  healthInspector.update(range.health.faults, selectedFault);
}

function renderHealthPanel(): void {
  const health = range.health;
  const fault = health.faults.find(item => item.id === selectedFault) ?? health.faults[0]!;
  const ended = range.missionEnded;
  const lastDecision = health.decisions.at(-1);
  const statusMessage = health.phase === 'broken' ? 'Vehicle stopped after overheating. Engine off. Recovery and repair assessment required.'
    : health.phase === 'recovery' ? 'Recovery requested inside this exercise. Vehicle stopped; repair required. No message was sent.'
    : lastDecision?.action === 'diagnose' ? 'Inspection recorded. Readings do not confirm a failed component, and no repair has been performed.'
    : health.paceLimited ? 'Pace reduced. Existing damage remains; further damage builds more slowly while moving.'
    : health.phase === 'nominal' ? 'Each sensor starts at 100%. Select a system to check its readings.'
    : health.continued ? 'Continuing with unresolved faults. Further driving can leave major repair work or stop the vehicle.'
    : 'Inspect the readings and choose a response. Reducing pace early can limit damage; continued driving can make it worse.';
  healthDialog.dataset.health = health.phase;
  if (!healthDialog.querySelector('#health-vehicle-model')) {
    healthDialog.innerHTML = `<div class="health-hardware"><span>MFoCS / COMMANDER DISPLAY &middot; ${escapeHtml(mode === 'range' ? range.callsign : audio.missionCallsign)}</span><img class="health-corner-logo" src="/branding/shift5-logo.svg" alt="Shift5"></div><div class="health-screen"><header class="health-panel-heading"><div><span class="eyebrow">VEHICLE HEALTH</span><h2 id="health-title">Vehicle condition</h2></div><button data-action="close-health" class="health-close" aria-label="Close MFoCS health display">Close &times;</button></header><p id="health-inspection-note">Driving and exercise time are paused while you inspect. Music and background sounds continue if sound is on.</p><p id="health-ambient-caption" class="sr-only" role="status" aria-atomic="true"></p><div class="health-event" role="status" aria-live="polite"></div><div class="health-console-grid"><section class="vehicle-overview" aria-label="Vehicle sensors"><div class="operator-panel-heading"><span>STRYKER / SENSOR LOCATIONS</span><span id="health-clock"></span></div><div class="vehicle-condition-overview"><div id="health-vehicle-model" class="vehicle-inspector-host"></div><div id="health-system-score" class="systems-health-host"></div></div><div id="health-sensor-list" class="fault-selectors"></div></section><section id="health-fault-detail" class="fault-detail" tabindex="-1" aria-label="Selected fault readings"></section></div><details class="operator-details"><summary>How this display gets its data</summary><p>Existing vehicle / MFoCS access &rarr; Manifold &rarr; Turbine pulling, translating and structuring &rarr; analytics insight &rarr; crew decision &rarr; outcome.</p><p>Manifold is the access path in this illustration. This is not actual Shift5 software or an independently verified integration.</p></details><p class="health-disclaimer">Training data &middot; illustrative faults and game consequences. No live vehicle connection, real thresholds or maintenance procedure.</p></div><div class="health-actions"><button data-action="health-continue"><b>Continue mission</b><span>Keep driving with the fault unresolved</span></button><button data-action="health-diagnose"><b>Inspect fault</b><span>Review assessment; no repair</span></button><button data-action="health-reduce-pace"><b>Reduce pace</b><span>Limit further damage; no repair</span></button><button data-action="health-recovery"><b>Call recovery</b><span>Stop this run for repair</span></button></div><div class="health-hardware"><span>TRAINING DISPLAY</span><span>INSPECTION PAUSED</span></div>`;
  }
  healthDialog.querySelector('#health-title')!.textContent = health.phase === 'broken' ? 'Vehicle breakdown.' : health.phase === 'recovery' ? 'Recovery requested.' : health.phase === 'nominal' ? 'Vehicle condition' : 'Faults need a crew decision.';
  healthDialog.querySelector('.health-event')!.innerHTML = `<strong>${health.phase === 'broken' ? 'STOPPED / BREAKDOWN' : health.phase === 'recovery' ? 'STOPPED / REPAIR REQUIRED' : health.paceLimited ? 'REDUCED PACE / FAULTS UNRESOLVED' : health.phase === 'critical' ? 'SEVERE FAULT' : health.phase === 'warning' ? 'VEHICLE HEALTH ALERT' : 'ALL SENSORS NORMAL'}</strong><p>${escapeHtml(statusMessage)}</p>`;
  healthDialog.querySelector('#health-clock')!.textContent = exerciseTime(range.time);
  syncFaultSelectors(healthDialog.querySelector('#health-sensor-list')!, health.faults, 'sensor');
  syncSystemsHealth(healthDialog.querySelector('#health-system-score')!, health.faults);
  healthDialog.querySelector('#health-fault-detail')!.innerHTML = faultDetails(fault);
  healthDialog.querySelectorAll<HTMLButtonElement>('.health-actions button').forEach(button => { button.disabled = ended; });
  const continueButton = healthDialog.querySelector<HTMLButtonElement>('[data-action="health-continue"]')!;
  continueButton.querySelector('b')!.textContent = health.phase === 'nominal' ? 'Return to mission' : 'Continue mission';
  continueButton.querySelector('span')!.textContent = health.phase === 'nominal' ? 'Close the display' : 'Keep driving with the fault unresolved';
  healthDialog.querySelector<HTMLButtonElement>('[data-action="health-diagnose"]')!.disabled = ended || fault.diagnosed;
  const pace = healthDialog.querySelector<HTMLButtonElement>('[data-action="health-reduce-pace"]')!;
  pace.disabled = ended || health.paceLimited;
  healthDialog.querySelector<HTMLButtonElement>('[data-action="health-recovery"]')!.disabled = ended || health.phase === 'nominal';
  pace.querySelector('b')!.textContent = health.paceLimited ? 'Pace reduced' : 'Reduce pace';
  healthInspector?.update(health.faults, selectedFault);
}

function openHealth(): void {
  if (mode !== 'range' || healthInspection.open || debriefDialog.open) return;
  healthReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  healthInspection.begin(range.paused, keyboard);
  clearRangeInputs();
  setRangeView(cabinDisplay.inspectHealth(rangeView));
  setPaused(true);
  selectedFault = range.health.faults.find(fault => fault.severity === 'failed')?.id ?? range.health.faults.find(fault => fault.severity === 'severe')?.id ?? range.health.faults.find(fault => fault.severity === 'moderate')?.id ?? 'charging';
  renderHealthPanel();
  healthDialog.showModal();
  mountHealthInspector();
  healthDialog.querySelector<HTMLButtonElement>('[data-action="close-health"]')!.focus();
  document.body.classList.add('health-inspecting');
  syncControls();
}

function closeHealth(outcome: 'resume' | 'recovery' = 'resume'): void {
  if (!healthInspection.open) return;
  const paused = healthInspection.end(keyboard);
  healthInspector?.dispose(); healthInspector = null;
  if (healthDialog.open) healthDialog.close();
  document.body.classList.remove('health-inspecting');
  const view = cabinDisplay.finishHealth(outcome);
  if (view !== undefined && mode === 'range') setRangeView(view);
  clearRangeInputs();
  setPaused(paused);
  if (healthReturnFocus?.isConnected) healthReturnFocus.focus({ preventScroll: true }); else stage.focus({ preventScroll: true });
}

function closeDebrief(): void {
  if (!debriefDialog.open) return;
  debriefDialog.close();
  document.body.classList.remove('debrief-inspecting');
  clearRangeInputs();
  if (debriefReturnFocus?.isConnected && !(debriefReturnFocus instanceof HTMLButtonElement && debriefReturnFocus.disabled)) debriefReturnFocus.focus({ preventScroll: true }); else document.querySelector<HTMLButtonElement>('[data-action="review-debrief"]')?.focus({ preventScroll: true });
}

function openDebrief(): void {
  if (!range.debrief || debriefDialog.open || healthInspection.open || mapInspection.open || mode !== 'range') return;
  shownDebrief = range.debrief;
  clearRangeInputs();
  debriefReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  debriefDialog.innerHTML = missionDebriefMarkup(range.debrief);
  debriefDialog.showModal();
  audio.setPaused(true);
  document.body.classList.add('debrief-inspecting');
  debriefDialog.querySelector<HTMLButtonElement>('[data-action="close-debrief"]')!.focus();
}

function guidedFaults(): VehicleFault[] {
  const readings = sim.observations.filter(observation => observation.engine && observation.fresh);
  const starting = readings.slice(0, 5);
  const baseline = starting.reduce((sum, observation) => sum + observation.voltage, 0) / Math.max(1, starting.length) || sim.latest.voltage;
  const severity = sim.alert || sim.secured ? 'severe' : sim.faultSeverity > .2 ? 'moderate' : 'normal';
  if (severity !== 'normal' && guidedWarningAt === null) guidedWarningAt = sim.time;
  if (severity === 'severe' && guidedSevereAt === null) guidedSevereAt = sim.time;
  const base = { diagnosed: false, firstWarningAt: null, severeAt: null, exposure: 0, damage: 0, baseline: 100, reading: 100, observations: [{ time: sim.time, value: 100 }], maintenance: 'none' as const, repair: 'Routine inspection after this exercise.' };
  return [
    { ...base, id: 'charging', label: 'Charging output', component: 'Charging system', severity, firstWarningAt: guidedWarningAt, severeAt: guidedSevereAt, reading: readings.length ? readings.at(-1)!.voltage / baseline * 100 : 100, observations: readings.map(observation => ({ time: observation.time, value: observation.voltage / baseline * 100 })), consequence: severity === 'normal' ? 'Output is near the starting reading.' : 'Output has risen while the engine runs and electrical load stays similar. Stop and inspect the charging system. Alternator suspected; not confirmed.', repair: 'Vehicle remains secured until the charging-system fault is checked and repaired.' },
    { ...base, id: 'cooling', label: 'Cooling temperature', component: 'Engine cooling', severity: 'normal', consequence: 'No cooling warning in this guided exercise.' },
    { ...base, id: 'wheel-end', label: 'Wheel-end vibration', component: 'Wheel assembly', severity: 'normal', consequence: 'No wheel-end warning in this guided exercise.' },
  ];
}

// Disclosures are created only on phase changes. Telemetry updates replace their
// contents, so the reader's open/closed choice survives live readings and pause.
function guidedDetails(label: string, content: string, className = ''): string {
  const compact = window.matchMedia('(max-width: 760px), (pointer: coarse) and (max-height: 540px)').matches;
  return `<details class="guided-details ${className}"${compact ? '' : ' open'}><summary>${label}</summary><div class="guided-details-body">${content}</div></details>`;
}

function guidedInspection(): string {
  return `<section class="guided-inspection" aria-label="Vehicle sensor display"><div class="operator-panel-heading"><span>STRYKER / TOUCH A SENSOR</span><span id="guided-inspection-clock"></span></div><div class="vehicle-condition-overview"><div id="guided-vehicle-model" class="vehicle-inspector-host"></div><div id="guided-system-score" class="systems-health-host"></div></div>${guidedDetails('All systems / select sensor', '<div id="guided-sensor-list" class="fault-selectors"></div>', 'guided-systems')}<section id="guided-fault-detail" class="fault-detail" aria-label="Selected vehicle sensor"></section></section>`;
}

function guidedActionDock(): string {
  const step = guidedExercise.describe(sim);
  return `<section class="guided-action-dock" aria-label="Guided exercise actions" aria-labelledby="guided-objective"><span class="guided-step-status eyebrow">GUIDED EXERCISE / STEP ${step.step + 1} OF ${GUIDED_STEPS.length}</span><h2 id="guided-objective">${escapeHtml(step.objective)}</h2><p id="guided-action-detail">${escapeHtml(step.detail)}</p><div class="guided-primary-action"><button id="guided-next-button" class="primary-button" data-action="guided-next" aria-describedby="guided-action-status"${step.disabled ? ' disabled' : ''}>${escapeHtml(step.label)} ${arrow}</button></div><p id="guided-action-status" role="status">${escapeHtml(step.reason)}</p><details class="guided-roadmap"${guidedRoadmapOpen ? ' open' : ''}><summary>Exercise steps / ${step.step + 1} of ${GUIDED_STEPS.length}</summary><ol>${step.progress.map(entry => `<li data-state="${entry.state}"${entry.state === 'current' ? ' aria-current="step"' : ''}><span>${escapeHtml(entry.label)}</span><small>${entry.state === 'complete' ? 'Done' : entry.state === 'current' ? 'Current' : 'Next'}</small></li>`).join('')}</ol></details></section>`;
}

function syncGuidedAction(): void {
  const next = document.querySelector<HTMLButtonElement>('#guided-next-button');
  if (!next) return;
  const step = guidedExercise.describe(sim);
  next.disabled = step.disabled;
  const label = `${step.label} →`;
  if (next.textContent !== label) next.textContent = label;
  const status = document.querySelector('#guided-action-status');
  if (status && status.textContent !== step.reason) status.textContent = step.reason;
}

function syncGuidedDisplay(): void {
  const panel = document.querySelector<HTMLElement>('#guided-mfocs-panel');
  const open = mode === 'mission' && guidedExercise.displayOpen && !!panel;
  document.body.classList.toggle('guided-display-open', open);
  const toggle = document.querySelector<HTMLButtonElement>('[data-action="display-toggle"]');
  if (panel) panel.hidden = !open;
  if (toggle) { toggle.setAttribute('aria-expanded', String(open)); toggle.textContent = open ? 'Hide MFoCS' : 'Open MFoCS'; }
  const expand = document.querySelector<HTMLButtonElement>('[data-action="display-focus"]');
  if (expand) expand.hidden = !open;
  if (!open) { displayExpanded = false; document.body.classList.remove('display-expanded'); }
  if (open) {
    const host = document.querySelector<HTMLElement>('#guided-vehicle-model');
    if (host) fitGuidedInspector(host);
    updateGuidedInspection();
  }
}

function fitGuidedInspector(host: HTMLElement): void {
  const content = host.closest<HTMLElement>('.monitor-content');
  if (!content) return;
  const compact = window.matchMedia('(max-width: 760px), (pointer: coarse) and (max-height: 540px)').matches;
  if (!compact) {
    host.style.removeProperty('--inspector-height');
    host.style.removeProperty('--inspector-min-height');
    return;
  }
  // The model sits after the evidence. Size to the bounded scroll viewport,
  // rather than subtracting preceding content and shrinking it to a tiny strip.
  const height = Math.max(48, Math.min(280, Math.floor(content.clientHeight * .72)));
  host.style.setProperty('--inspector-height', `${height}px`);
  host.style.setProperty('--inspector-min-height', `${height}px`);
}

function updateGuidedInspection(): void {
  const host = document.querySelector<HTMLElement>('#guided-vehicle-model');
  if (!host || !guidedExercise.displayOpen) return;
  const faults = guidedFaults();
  if (!guidedInspector) {
    fitGuidedInspector(host);
    guidedInspector = new VehicleInspector(host, scene.createInspectionModel(), id => selectFault(id, true));
    guidedLayoutObserver = new ResizeObserver(() => fitGuidedInspector(host));
    guidedLayoutObserver.observe(host.closest('.monitor-content')!);
  }
  guidedInspector.update(faults, selectedFault);
  syncSystemsHealth(document.querySelector('#guided-system-score')!, faults);
  document.querySelector('#guided-inspection-clock')!.textContent = exerciseTime(sim.time);
  syncFaultSelectors(document.querySelector('#guided-sensor-list')!, faults, 'guided-sensor');
  document.querySelector('#guided-fault-detail')!.innerHTML = faultDetails(faults.find(fault => fault.id === selectedFault)!);
}

function button(label: string, action = 'advance', secondary = false): string {
  return `<button class="${secondary ? 'secondary-button' : 'primary-button'}" data-action="${action}">${label} ${arrow}</button>`;
}

function pipeline(active: number): string {
  return `<details class="operator-details"><summary>How the data reaches the crew</summary><div class="data-pipeline" aria-label="Data pathway"><div class="pipeline-stages">${['Vehicle / MFoCS', 'Manifold', 'Turbine', 'Crew decision'].map((name, i) => `<span class="pipeline-chip ${i === active ? 'current' : ''}">${name}</span>${i < 3 ? '<b aria-hidden="true">&rarr;</b>' : ''}`).join('')}</div></div><p>Existing vehicle / MFoCS access &rarr; Manifold &rarr; Turbine pulling, translating and structuring &rarr; analytics insight &rarr; crew decision &rarr; outcome.</p><p>Illustrative workflow. No separate Manifold hardware, actual Shift5 software or independently verified integration.</p></details>`;
}

function chart(detailed = false): string {
  return `<svg viewBox="0 0 540 130" class="trace-chart" role="img" aria-label="Synthetic charging signal over exercise time, rising as the fault develops"><defs><linearGradient id="${detailed ? 'detail-' : ''}trace-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dfb16d" stop-opacity=".18"/><stop offset="1" stop-color="#dfb16d" stop-opacity="0"/></linearGradient></defs><path class="chart-grid" d="M8 20H532M8 62H532M8 104H532"/><path class="trace-area" fill="url(#${detailed ? 'detail-' : ''}trace-fill)"/><path class="trace-line"/><text x="8" y="124">EARLIER</text><text x="500" y="124">NOW</text><circle class="trace-end" r="3"/></svg>`;
}

function telemetry(): string {
  return `<div class="telemetry-strip"><div><span>CHARGING OUTPUT</span><strong id="voltage-value">Collecting</strong><small>compared with start</small></div><div><span>ELECTRICAL LOAD</span><strong id="load-value">&mdash;</strong><small>relative load</small></div><div><span>ENGINE</span><strong id="engine-value">Running</strong><small id="fresh-value">current reading</small></div></div>`;
}

function monitor(content: string, active: number, kicker = 'VEHICLE SYSTEMS / CREW VIEW'): string {
  const screen = document.createElement('template');
  screen.innerHTML = content;
  const controls = screen.content.querySelector('.screen-action, .decision-row');
  controls?.remove();
  const phaseTitle = screen.content.querySelector('.screen-heading h1')?.textContent ?? 'Vehicle inspection';
  screen.content.querySelector('.screen-heading h1')?.remove();
  const brief = `<details class="guided-details guided-brief"><summary>Current step / readings and data path</summary><div class="guided-details-body">${screen.innerHTML}${pipeline(active)}<p class="health-disclaimer">Training data &middot; illustrative faults. No live vehicle connection or maintenance procedure.</p></div></details>`;
  return `<div class="commander-hud"><span class="eyebrow">${insideView ? 'INSIDE / COMMANDER SEAT' : 'HATCH / COMMANDER VIEW'}</span><span><i class="live-dot"></i> ${sim.engine ? 'VEHICLE SYSTEMS ONLINE' : 'VEHICLE SECURED'}</span><small>Front Range training area</small></div><section class="instrument-position" aria-label="Vehicle information display"><div class="display-toolbar"><span>MFoCS–FAMILY DISPLAY</span><div class="display-view-controls"><button class="display-focus view-toggle" data-action="view" aria-pressed="${insideView}">${insideView ? 'Hatch view' : 'Inside view'}</button><button class="display-focus" data-action="display-toggle" aria-expanded="${guidedExercise.displayOpen}" aria-controls="guided-mfocs-panel">${guidedExercise.displayOpen ? 'Hide MFoCS' : 'Open MFoCS'}</button></div></div><div class="monitor-bezel" id="guided-mfocs-panel"${guidedExercise.displayOpen ? '' : ' hidden'}><span class="bezel-screw tl"></span><span class="bezel-screw tr"></span><span class="bezel-screw bl"></span><span class="bezel-screw br"></span><div class="bezel-top"><span>TACTICAL INFORMATION TERMINAL</span><span class="hardware-lights"><i></i><i></i><i></i></span></div><div class="monitor-screen"><div class="screen-brand"><img src="/branding/shift5-logo.svg" alt="Shift5"><span>${escapeHtml(mode === 'range' ? range.callsign : audio.missionCallsign)}</span><span class="feed-badge"><i class="live-dot"></i> TRAINING DATA</span></div><div class="screen-status"><span>${kicker}</span><span>STRYKER / ${escapeHtml(audio.missionCallsign)}</span></div><div class="monitor-content" tabindex="0" aria-label="Display information; scroll to inspect"><h1 class="guided-phase-title">${escapeHtml(phaseTitle)}</h1>${brief}${guidedInspection()}</div></div><div class="bezel-bottom"><span>EXERCISE INTERFACE</span><div class="bezel-keys"><i></i><i></i><i></i><i></i><i></i></div><span class="power-key">⏻</span></div></div></section>`;
}

function screenIntro(kicker: string, title: string, text: string): string {
  return `<div class="screen-heading"><span class="eyebrow">${kicker}</span><h1>${title}</h1><p>${text}</p></div>`;
}

function setRangeView(view: RangeView): void {
  clearRangeInputs();
  rangeView = view;
  if (view !== 'inside') cabinDisplay.leaveInside();
  document.body.dataset.rangeView = view;
  syncSpeedometerView();
  document.querySelectorAll<HTMLButtonElement>('.range-view-buttons button').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.action === `range-view-${view}`)));
  syncGunnerDisplay();
}

function syncGunnerDisplay(): void {
  const inside = mode === 'range' && rangeView === 'inside';
  const gunnerDisplay = cabinDisplay.mode;
  const focused = inside && cabinDisplay.focused;
  document.body.classList.toggle('gunner-display-focused', focused);
  document.body.dataset.gunnerDisplay = gunnerDisplay;
  scene.setGunnerDisplay(gunnerDisplay, focused);
  const controls = document.querySelector<HTMLElement>('.gunner-display-controls');
  if (!controls) return;
  controls.hidden = !inside;
  controls.querySelectorAll<HTMLButtonElement>('[data-gunner-mode]').forEach(el => {
    el.setAttribute('aria-pressed', String(el.dataset.gunnerMode === gunnerDisplay));
  });
  const expand = controls.querySelector<HTMLButtonElement>('[data-action="gunner-expand"]')!;
  expand.setAttribute('aria-expanded', String(focused));
  expand.textContent = focused ? 'Back to seat' : 'Focus display';
  expand.setAttribute('aria-label', focused ? 'Back to seat, show more of the Stryker cabin' : 'Focus display, move closer to the physical crew monitor');
  expand.title = focused ? 'Return to the wider seated cabin view' : 'Bring the crew monitor closer while staying inside the cabin';
  controls.querySelector<HTMLElement>('.gunner-display-caption')!.textContent = gunnerDisplay === 'thermal' ? 'THERMAL / SIMULATED' : gunnerDisplay === 'day' ? 'DAY / LIVE GAME VIEW' : 'MFoCS / VEHICLE DATA';
}

function resetGunnerDisplay(): void {
  cabinDisplay.reset();
  syncGunnerDisplay();
}

function renderRange(): void {
  rangeControlsExpanded = false;
  stage.innerHTML = `<aside id="range-drawer" class="range-drawer" role="dialog" aria-modal="true" aria-labelledby="range-drawer-title"><span class="sr-only">Exercise paused.</span><div class="range-drawer-heading"><h2 id="range-drawer-title">Mission &amp; settings</h2><button data-action="range-drawer" aria-label="Close mission details and settings">Close &times;</button></div><section class="range-hud" aria-label="Mission instruments"><div class="range-title"><span class="eyebrow">${escapeHtml(range.callsign)} / ASSIGNED MISSION</span><h1>Deliver the squad.</h1><p id="range-mission-status"></p><p id="range-objective-count" class="range-objective-count"></p><div class="mission-progress"><span id="range-progress"></span></div></div><div class="range-stats"><div><span>TERRAIN</span><strong id="range-terrain">Training ground</strong></div><div><span>SPEED &middot; MPH</span><strong id="range-speed">0</strong></div><div><span>VEHICLE INTEGRITY</span><strong id="range-integrity">100%</strong></div><div><span>HITS / SHOTS</span><strong><span id="range-hits">0</span> / <span id="range-shots">0</span></strong></div></div></section>
    <div class="range-drawer-settings"><section class="range-status-details" aria-label="Current alerts"><p id="range-health-detail"></p><p id="range-contact-detail"></p><p id="range-event-detail"></p></section><p>Hold ACCEL or Space to accelerate; release to coast. Hold B to brake; release to disengage. Drag the left stick to drive and steer. Hold S / down or pull the stick back to slow, then reverse. Auto aim slews toward nearby targets ahead. Wait for the lock before firing; shots follow the barrel while it turns. Hold FIRE to shoot; the aim slider or Q / E temporarily takes manual control.</p><p>Clear the contacts, stop inside the marked dismount zone, then select Drop ramp or press R to unload the nine-person squad. Outside zone = mission failure. The ramp command commits the unload.</p><div><button data-action="sound-retry">Enable / retry sound</button><button class="drawer-music-control" data-action="music" aria-pressed="${audio.musicEnabled}">Music: ${audio.musicEnabled ? 'on' : 'off'}</button><button data-action="aim-assist" aria-pressed="${range.aimAssistEnabled}">Auto aim: ${range.aimAssistEnabled ? 'on' : 'off'}</button><button data-action="motion" aria-pressed="${reducedMotion}">Reduced motion</button><button data-action="fullscreen">Fullscreen</button><button data-action="restart">Restart mission</button><button data-action="menu">Main menu</button></div><p class="sound-help">Sound on but silent? Enable / retry sound refreshes the audio output and returns to the exercise. On iPhone, check media volume and the selected speaker or headphones.</p><p>Fictional game handling and combat. Simulated speed limits: road 60 mph, grass 45, wash 25, rock 18, reverse 10. Terrain and vehicle faults can reduce the current limit. These are game settings, not operational guidance. No operational procedures or ballistics.</p></div></aside>
    <div class="range-instrument-stack">
    <section class="range-speedometer" aria-label="Simulated vehicle speed" hidden><div class="speedometer-reading"><strong id="speedometer-speed">0</strong><span>MPH <b id="speedometer-direction" hidden>REV</b></span><small>SIM</small></div><div class="speedometer-limit"><span>LIMIT <b id="speedometer-limit">60</b></span><small id="speedometer-reason">Road</small></div><div class="speedometer-track" aria-hidden="true"><span id="speedometer-progress"></span></div></section>
    <button class="range-health" id="range-health-button" data-action="health" aria-haspopup="dialog"><span class="range-health-heading"><span class="range-health-icon" aria-hidden="true">!</span><span>Open MFoCS</span></span><b id="range-health-label">Systems normal</b></button>
    <aside class="mission-map" aria-label="Mission map"><button data-action="map" id="map-toggle" aria-expanded="${mapInspection.open}" aria-haspopup="dialog" aria-controls="mission-map-dialog"><span class="map-label"><span class="map-full-label">MISSION </span>MAP</span><img class="map-corner-brand" src="/branding/shift5-logo.svg" alt=""><span class="map-expand-icon" aria-hidden="true">&#10530;</span><span class="phone-objective" id="phone-objective" hidden aria-hidden="true"><svg viewBox="0 0 20 20" width="20" height="20" focusable="false"><path d="M10 2 L17 16 L10 12 L3 16 Z" fill="currentColor"/></svg><span><b>DISMOUNT</b><small id="phone-objective-distance"></small></span></span></button><span id="phone-objective-description" class="sr-only"></span><div class="map-content" data-action="map" role="button" tabindex="0" aria-label="Expand mission map" aria-haspopup="dialog" aria-controls="mission-map-dialog"><svg id="mission-map-svg" data-mission-map viewBox="0 0 160 180" role="img" aria-label="North-up schematic of the complete route, departure line, staging area and dismount objective. After departure, hollow icons show estimated contacts; filled icons show detected contacts; crosses show cleared contacts."></svg><div class="map-legend"><span>&#9650; YOU</span><span>&#9671; DISMOUNT</span><span>LD DEPARTURE</span><span id="map-contact-legend" data-map-contact-legend hidden>&#9675; TROOP &nbsp; &#9633; GUN TRUCK<br>HOLLOW EST. / FILLED SEEN / &times; CLEARED</span></div><p id="range-location">GRID 0 / 80</p></div><p id="map-navigation-hint" hidden></p></aside>
    <section class="gunner-display-controls" aria-label="Inside gunner display" hidden><div class="gunner-display-buttons"><button data-action="gunner-day" data-gunner-mode="day" aria-pressed="true" aria-label="Day gunner display, live game view">Day</button><button data-action="gunner-thermal" data-gunner-mode="thermal" aria-pressed="false" aria-label="Thermal gunner display, simulated game imagery">Thermal</button><button data-action="gunner-mfocs" data-gunner-mode="mfocs" aria-pressed="false" aria-label="MFoCS vehicle data display">MFoCS</button><button data-action="gunner-expand" aria-expanded="false">Focus display</button></div><span class="gunner-display-caption" aria-live="polite">DAY / LIVE GAME VIEW</span></section>
    </div>

    <div class="range-edge-controls"><div id="range-movement-clock" class="movement-clock" role="timer" aria-live="off"><span id="movement-clock-label">PRACTICE</span><strong id="movement-clock-value">03:00</strong><small id="movement-clock-hint">STARTS AT LD</small></div><nav class="range-view-panel" aria-label="Camera views"><div class="range-view-buttons">${RANGE_VIEWS.map((view, i) => `<button data-action="range-view-${view}" aria-pressed="${rangeView === view}" title="${i + 1}: ${view}">${{hatch:'Hatch',inside:'Inside',chase:'Chase',top:'Top'}[view]}</button>`).join('')}</div><span>CAMERA &middot; KEYS 1&ndash;4</span></nav><div class="ramp-command"><button data-action="drop-ramp" id="drop-ramp-button" aria-describedby="ramp-command-status">Drop ramp <small>R</small></button><span id="ramp-command-status" role="status" aria-live="polite">Outside zone = mission failure</span></div></div>
    <div class="range-announcements"><span id="range-health-notice" role="status" aria-live="assertive"></span><span id="range-contact-notice" role="status" aria-live="polite"></span><span id="range-event-notice" role="status" aria-live="polite"></span></div>
    <div class="range-controls-tray"><button class="range-controls-toggle" data-action="range-controls" aria-expanded="false" aria-controls="range-controls">Controls</button><section id="range-controls" class="range-controls" aria-label="Driving and weapon controls" hidden inert><div class="range-key-guide"><span><b>WASD / ARROWS</b> drive &middot; <b>SPACE</b> accelerate &middot; <b>B</b> brake</span><span><b>Q / E</b> aim &middot; <b>F</b> fire &middot; <b>R</b> drop ramp &middot; <b>P</b> pause &middot; <b>M</b> mute</span><span>Fictional contacts may reduce vehicle integrity</span></div><div class="range-control-row"><div id="drive-stick" class="touch-stick" role="group" aria-label="Thumb drive stick: drag up to drive, down to reverse, left or right to steer"><span class="stick-direction stick-forward" aria-hidden="true">FORWARD</span><span class="stick-direction stick-reverse" aria-hidden="true">REVERSE</span><span class="stick-knob" aria-hidden="true"></span><span class="stick-hint" aria-hidden="true">DRAG TO DRIVE</span></div><div class="drive-pad" aria-label="Drive controls"><button data-hold="left" aria-label="Steer left">&#9664;</button><div class="drive-longitudinal"><button data-hold="forward" aria-label="Hold to drive forward">&#9650;<small>FORWARD</small></button><button data-hold="reverse" aria-label="Hold to reverse">&#9660;<small>REVERSE</small></button></div><button data-hold="right" aria-label="Steer right">&#9654;</button><div class="drive-toggles"><button data-action="cruise" id="cruise-toggle" aria-pressed="false">Drive lock<small>TAP TO CRUISE</small></button><button data-hold="accelerate" class="accelerate-button" aria-label="Hold to accelerate">Accelerate<small>HOLD / SPACE</small></button></div></div><div class="weapon-controls"><label for="range-aim-input"><span id="range-lock" class="aim-lock-status" role="status" aria-live="polite">AUTO AIM / READY</span><input id="range-aim-input" type="range" min="-1" max="1" value="0" step=".01" aria-label="Weapon rotation, springs back when released"></label><div class="weapon-actions"><button class="center-aim-button" data-action="center-aim">Center aim</button><button class="mobile-accelerate-button" data-hold="accelerate" aria-label="Hold to accelerate">ACCEL</button><button class="fire-button" data-hold="fire">FIRE<small>HOLD &middot; .50 CAL</small></button></div></div></div></section></div>
    <section id="range-result" class="range-result" role="status" hidden><span class="eyebrow">MISSION RESULT</span><h2 id="range-result-title"></h2><p id="range-result-detail"></p><div>${button('Review debrief', 'review-debrief')}${button('Restart mission', 'restart', true)}${button('Main menu', 'menu', true)}</div></section>
    `;
  syncRangeControls();
  syncGunnerDisplay();
  syncSpeedometerView();
  updateRangeLive();
}

function renderBriefing(): void {
  document.body.dataset.phase = 'briefing';
  document.body.classList.remove('display-expanded');
  stage.innerHTML = `<section class="mission-briefing" aria-labelledby="briefing-title"><div class="briefing-header"><span>FRONT RANGE / TRAINING ORDERS</span><img src="/branding/shift5-logo.svg" alt="Shift5"></div><h1 id="briefing-title">MISSION BRIEFING</h1><p class="sr-only" id="briefing-readable">${escapeHtml(missionBriefing.text)}</p><div class="briefing-copy" aria-hidden="true"><span id="briefing-typed"></span><span class="briefing-cursor">&#9608;</span></div><div class="briefing-actions"><button data-action="accept-mission" class="briefing-accept" hidden>Accept Mission <span aria-hidden="true">&gt;</span></button><button data-action="skip-briefing" class="briefing-skip">Show full briefing</button><button data-action="menu" class="briefing-back">Back to home</button></div><p class="briefing-state" id="briefing-state" role="status" aria-live="polite">Receiving orders. The mission starts only when you accept.</p></section>`;
  updateBriefing();
}

function updateBriefing(): void {
  if (mode !== 'briefing') return;
  const typed = document.querySelector('#briefing-typed');
  if (typed && typed.textContent !== missionBriefing.visibleText) typed.textContent = missionBriefing.visibleText;
  const accept = document.querySelector<HTMLButtonElement>('[data-action="accept-mission"]');
  if (accept) accept.hidden = !missionBriefing.ready;
  const skip = document.querySelector<HTMLButtonElement>('[data-action="skip-briefing"]');
  if (skip) skip.hidden = missionBriefing.ready;
  const status = document.querySelector('#briefing-state');
  const message = missionBriefing.ready ? 'Orders received. Select Accept Mission when ready.' : 'Receiving orders. The mission starts only when you accept.';
  if (status && status.textContent !== message) status.textContent = message;
}

function render(): void {
  closeMap();
  setRangeDrawer(false);
  guidedLayoutObserver?.disconnect(); guidedLayoutObserver = null;
  guidedInspector?.dispose(); guidedInspector = null;
  const p = sim.phase;
  document.body.dataset.mode = mode;
  document.body.classList.remove('range-controls-open');
  document.querySelectorAll<HTMLElement>('[data-callsign]').forEach(el => { el.textContent = mode === 'range' ? range.callsign : audio.missionCallsign; });
  syncGunnerDisplay();
  // Reset any range effects once, then let the static home artwork rest the GPU.
  if (mode === 'home') scene.update(sim, 0, reducedMotion);
  document.querySelector<HTMLElement>('.chapter-rail')!.hidden = mode !== 'mission';
  document.querySelector<HTMLElement>('.caption-label')!.textContent = mode === 'range' ? 'RANGE / SYSTEM' : 'CREW / SYSTEM';
  if (mode === 'briefing') { renderBriefing(); syncControls(); updateCaption(); return; }
  if (mode === 'range') {
    document.body.dataset.phase = 'range';
    document.body.classList.remove('display-expanded');
    document.documentElement.style.setProperty('--progress', '0%');
    renderRange(); syncControls(); updateCaption(); return;
  }
  if (['title', 'exterior', 'secured', 'service', 'debrief'].includes(p) || !guidedExercise.displayOpen) displayExpanded = false;
  document.body.dataset.phase = p;
  document.body.classList.toggle('display-expanded', displayExpanded);
  document.body.classList.toggle('reduced-motion', reducedMotion);
  document.querySelectorAll<HTMLElement>('.chapter').forEach((el, i) => {
    el.classList.toggle('active', i === phaseChapter[p]);
    el.classList.toggle('past', i < phaseChapter[p]);
    if (i === phaseChapter[p]) el.setAttribute('aria-current', 'step'); else el.removeAttribute('aria-current');
  });
  document.documentElement.style.setProperty('--progress', `${phaseIndex[p] / 10 * 100}%`);
  const location = '<div class="location-tag"><span class="location-cross">⌖</span> FRONT RANGE TRAINING AREA <span>38.7° N / 104.8° W · ILLUSTRATIVE</span></div>';
  if (p === 'title') {
    stage.innerHTML = `<section class="hero home-hero" aria-labelledby="home-title"><h1 id="home-title">STRYKER<span>MISSION SIMULATOR</span></h1><p class="home-tagline">Start the mission. Watch your data.</p><div class="home-actions">${button('Start mission', 'start-range')}${button('Guided exercise', 'begin', true)}</div><div class="home-secondary"><details class="home-help"><summary>How to play</summary><div><p><strong>Mission:</strong> Use the optional practice boards, cross the departure line, clear fictional contacts and stop in the dismount zone. Select Drop ramp to unload the nine-person squad. Outside zone = mission failure. Check vehicle-health alerts in MFoCS.</p><p><strong>Controls:</strong> WASD / arrows to drive, Space to accelerate, hold B to brake, F to fire, R to drop the ramp. On a phone, use the thumb stick, ACCEL and FIRE.</p><p class="sound-help"><strong>Sound on but silent?</strong> Check media volume and the selected speaker or headphones. <button data-action="sound-retry">Enable / retry sound</button> Then start or resume the exercise.</p><p><strong>Guided exercise:</strong> Follow a charging-system warning and make the protective crew decision. About 3&ndash;5 minutes, at your pace.</p></div></details><a class="home-shift5-link" href="https://shift5.io/" target="_blank" rel="noopener noreferrer" aria-label="Visit Shift5 website (opens in a new tab)"><span class="home-shift5-heading"><img src="/branding/shift5-logo.svg" alt="Shift5"><span class="home-shift5-visit">Visit shift5.io <span aria-hidden="true">&#8599;</span></span></span><span class="home-shift5-tagline">Real Data. Rapid Analysis. Right Decision.</span></a></div></section>`;
  } else if (p === 'exterior') {
    stage.innerHTML = location;
  } else if (p === 'cabin') {
    stage.innerHTML = `${monitor(`${screenIntro('VEHICLE DATA AT THE CREW STATION', 'Vehicle systems online.', 'Check the vehicle before continuing. Touch a sensor on the Stryker, or select a system below.')}${telemetry()}<div class="screen-action">${button('Check charging output')}<span class="screen-note">User-paced inspection</span></div>`, 0)}`;
  } else if (p === 'feed') {
    stage.innerHTML = `${monitor(`${screenIntro('01 / EXISTING ACCESS', 'Compare charging output.', 'The engine is running. Check electrical load and compare the current reading with the start of this run.')}${telemetry()}<div class="callout subtle"><span>OBSERVATION</span><p>High output needs inspection. The reading alone does not confirm a failed alternator.</p></div><div class="screen-action">${button('See where the readings come from')}</div>`, 0)}`;
  } else if (p === 'manifold') {
    stage.innerHTML = `${monitor(`${screenIntro('02 / MANIFOLD', 'Readings from the vehicle.', 'Manifold uses the existing vehicle / MFoCS access in this illustration. The crew stays at the same display.')}<div class="stream-map"><div class="stream-source"><span>EXISTING ACCESS</span><b>Vehicle / MFoCS</b><small>Output &middot; load &middot; engine</small></div><span class="stream-arrow">→</span><div class="stream-source highlighted"><span>MANIFOLD</span><b>Data access</b><small>Vehicle readings</small></div></div><div class="field-list"><span><i>01</i> Charging output</span><span><i>02</i> Electrical load</span><span><i>03</i> Engine state</span><span><i>04</i> Reading time</span></div><div class="callout subtle"><span>READINGS KEPT TOGETHER</span><p>The output reading travels with its time, engine state and electrical load.</p></div><div class="screen-action">${button('See how Turbine prepares the readings')}</div>`, 1)}`;
  } else if (p === 'turbine') {
    stage.innerHTML = `${monitor(`${screenIntro('03 / TURBINE', 'Compare like readings.', 'Turbine pulls the available readings, translates their labels and units, and puts them in time order for comparison.')}<div class="process-steps"><div><span>01</span><h3>Pull</h3><p>Get vehicle readings through Manifold.</p></div><div><span>02</span><h3>Translate</h3><p>Identify the reading, unit and engine state.</p></div><div><span>03</span><h3>Structure</h3><p>Put output, load and engine state together by time.</p></div></div><div class="structured-row" aria-label="Example structured record"><span>EXAMPLE RECORD</span><span>charging</span><span>load</span><span>engine</span><span class="good-text">fresh ✓</span></div><p class="screen-note">An illustrative explanation of the requested workflow; not actual Shift5 software or a verified integration.</p><div class="screen-action">${button('Review the charging warning')}</div>`, 2)}`;
  } else if (p === 'insight') {
    stage.innerHTML = `${monitor(`${screenIntro('04 / CHARGING WARNING', 'Evaluate the charging warning.', 'Compare fresh output readings under similar load. A sustained warning supports the halt decision below.')}${telemetry()}<div class="callout alert-callout"><span id="insight-state">CHECKING READINGS</span><p id="insight-description">Comparing current output with the start of this run.</p></div><div class="decision-row"><div><span class="eyebrow">YOUR CALL</span><p>Halt the movement and secure the vehicle before service.</p></div><button class="primary-button" data-action="halt" id="halt-button" disabled>Halt the vehicle ${arrow}</button></div>`, 3)}`;
  } else if (p === 'halted') {
    stage.innerHTML = `${monitor(`${screenIntro('05 / PROTECT THE CREW', 'Movement halted.', 'The crew has stopped the vehicle. The engine is still running. Secure and shut down before any service interaction.')}<div class="protect-status"><span class="check-disc">✓</span><div><h3>Stationary</h3><p>Movement has ended.</p></div><span class="state-pill amber">ENGINE RUNNING</span></div><div class="protect-status pending"><span class="step-disc">2</span><div><h3>Secure & shut down</h3><p>The next protective step.</p></div></div><div class="screen-action">${button('Secure & shut down', 'secure')}</div><p class="screen-note">Abstract exercise action. Follow applicable procedures in real operations.</p>`, 3)}`;
  } else if (p === 'secured' || p === 'service') {
    stage.innerHTML = `<section class="guided-service-context" aria-label="Vehicle secured"><span class="eyebrow">VEHICLE POWER OFF / EXERCISE STEP</span><p>Stationary &middot; Engine off &middot; Vehicle secured</p>${p === 'service' ? '<div class="service-diagram"><div class="service-node">CHARGING<br>SOURCE</div><span class="isolation-mark" aria-hidden="true">//</span><div class="service-node">VEHICLE<br>SYSTEM</div><span>ABSTRACT ISOLATION &middot; NO WIRING PROCEDURE</span></div>' : ''}</section>`;
  } else {
    stage.innerHTML = `<section class="debrief"><div class="debrief-heading"><img class="guided-debrief-brand" src="/branding/shift5-logo.svg" alt="Shift5"><span class="eyebrow">06 / AFTER THE DECISION</span><span class="outcome-pill">PROTECTIVE SEQUENCE COMPLETE</span><h1>Vehicle secured.<br>Repair required.</h1><p>The crew stopped, shut down and recorded safe isolation of the suspected charging source. The vehicle stays out of service for inspection and repair.</p><div class="repair-required"><span>!</span><div><b>Repair required.</b><p>The vehicle remains shut down. Isolation does not restore normal operation, prove the fault or clear the vehicle for use.</p></div></div></div><div class="debrief-record"><span class="eyebrow">YOUR DECISION RECORD</span><ol><li><span>01</span><div><h3>Checked vehicle readings</h3><p>Existing vehicle / MFoCS access supplied charging, load and engine-state observations.</p></div></li><li><span>02</span><div><h3>Compared readings over time</h3><p>Manifold supplied access. Turbine pulled, translated and structured readings so output could be checked alongside load and engine state.</p></div></li><li><span>03</span><div><h3>Protect the crew</h3><p>Halt → secure and shut down → abstract service / isolation.</p></div></li></ol><div class="takeaway"><span>THE LEADER’S TAKEAWAY</span><p>The warning led to a stop before further driving. Isolation did not repair the vehicle or confirm the alternator.</p></div><div class="debrief-actions">${button('Run the exercise again', 'restart')}${button('Review evidence', 'evidence', true)}</div><p class="fine-print">Synthetic telemetry and fictional crew dialogue. Illustrative workflow, not independently verified integration, actual Shift5 software, vehicle-control access or maintenance guidance.</p></div></section>`;
  }
  if (mode === 'mission' && !['title', 'debrief'].includes(p)) stage.insertAdjacentHTML('beforeend', guidedActionDock());
  syncGuidedDisplay();
  if (mode === 'home' && !graphicsAvailable) {
    const rangeButton = stage.querySelector<HTMLButtonElement>('[data-action="start-range"]');
    if (rangeButton) { rangeButton.disabled = true; rangeButton.textContent = 'Training range needs 3D graphics'; }
  }
  updateCaption();
  lastPhase = p;
  lastAlert = !sim.alert;
  lastSampleCount = -1;
  syncControls();
  updateLive();
}

function updateCharts(): void {
  const observations = sim.observations.filter(o => o.engine).slice(-75);
  if (!observations.length) return;
  const first = observations[0]!.time;
  const duration = Math.max(12, observations.at(-1)!.time - first);
  const points = observations.map(o => [8 + (o.time - first) / duration * 524, Math.max(10, Math.min(104, 104 - (o.voltage - 27.9) / 2.8 * 90))]);
  const path = points.map((point, i) => `${i ? 'L' : 'M'}${point[0]!.toFixed(1)},${point[1]!.toFixed(1)}`).join(' ');
  document.querySelectorAll<SVGSVGElement>('.trace-chart').forEach(svg => {
    svg.querySelector('.trace-line')?.setAttribute('d', path);
    svg.querySelector('.trace-area')?.setAttribute('d', `${path} L${points.at(-1)![0]!.toFixed(1)},108 L8,108 Z`);
    svg.querySelector('.trace-end')?.setAttribute('cx', points.at(-1)![0]!.toFixed(1));
    svg.querySelector('.trace-end')?.setAttribute('cy', points.at(-1)![1]!.toFixed(1));
  });
}

function updateLive(): void {
  updateCaption();
  const latest = sim.latest;
  const set = (id: string, value: string) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  const minutes = Math.floor(sim.time / 60);
  set('elapsed', `${String(minutes).padStart(2, '0')}:${String(Math.floor(sim.time % 60)).padStart(2, '0')}`);
  if (sim.observations.length !== lastSampleCount || latest.time !== lastSampleTime) {
    const engineReadings = sim.observations.filter(o => o.fresh && o.engine);
    const baseline = engineReadings.slice(0, 5);
    const baselineValue = baseline.reduce((sum, observation) => sum + observation.voltage, 0) / Math.max(1, baseline.length);
    const recent = engineReadings.slice(-3);
    const recentValue = recent.reduce((sum, observation) => sum + observation.voltage, 0) / Math.max(1, recent.length);
    set('voltage-value', engineReadings.length < 6 ? 'Collecting' : sim.alert ? 'Elevated ↗' : recentValue - baselineValue > .2 ? 'Rising ↗' : 'Baseline');
    set('load-value', `${Math.round(latest.load * 100)}%`);
    set('engine-value', sim.engine ? 'Running' : 'Off');
    set('fresh-value', latest.fresh && sim.time - latest.time < 1.2 ? 'reading current' : 'awaiting reading');
    updateCharts();
    updateGuidedInspection();
    if (evidenceOpen) renderEvidenceRows();
    lastSampleCount = sim.observations.length;
    lastSampleTime = latest.time;
  }
  if (lastAlert !== sim.alert) {
    set('insight-state', sim.alert ? 'CHARGING OUTPUT HIGH / STOP AND INSPECT' : 'CHECKING READINGS');
    set('insight-description', sim.alert ? 'Output stays above the starting reading. Engine running; load unchanged. Stop the vehicle, then secure and shut down before service.' : 'Comparing current output with the start of this run.');
    lastAlert = sim.alert;
  }
  syncGuidedAction();
}

function updateCaption(): void {
  if (healthInspection.open) {
    const healthCaption = healthDialog.querySelector('#health-ambient-caption');
    const background = audio.distantCaption ?? '';
    if (healthCaption && healthCaption.textContent !== background) healthCaption.textContent = background;
  }
  const next = mode === 'range'
    ? range.time < rampCommandFeedbackUntil && !range.dismounting ? rampCommandFeedback : missionStaging.active ? MISSION_STAGING_CAPTION : outcomeReveal.recoveryElapsed !== null ? recoveryCaption() : range.dismounting ? `${range.mission.failureReason === 'dismount-outside-zone' ? 'Mission failed: ramp dropped outside the dismount zone. ' : ''}${audio.crewCaption ?? (range.dismount.phase === 'opening' ? 'Ramp lowering.' : 'Squad exiting: nine troops unloading.')}` : range.health.phase === 'broken' || audio.radioActive ? audio.caption : range.time < rangeEventFeedbackUntil ? rangeEventFeedback : range.time < rangeFeedbackUntil ? rangeFeedback : audio.distantCaption ?? (range.mission.phase === 'training' ? practicePrompt(range.shotsFired, range.targets.filter(target => target.kind === 'training' && target.destroyedAt !== null).length) : range.mission.notice)
    : mode === 'briefing' ? 'Read your orders. The vehicle and mission clock wait for Accept Mission.' : mode === 'home' ? 'Choose the dismount-point mission or follow the guided vehicle-health decision exercise.' : audio.caption || captionForPhase(sim.phase);
  if (next !== lastCaption) { caption.textContent = next; const dialogCaption = document.querySelector('#dialog-caption'); if (dialogCaption) dialogCaption.textContent = next; lastCaption = next; }
}

function updateMissionMap(): void {
  const maps = document.querySelectorAll('[data-mission-map]');
  if (!maps.length || mode !== 'range') return;
  const route = MISSION_ROUTE.map(w => { const p = mapPoint(w.x, w.z); return `${p.x},${p.y}`; }).join(' ');
  const player = mapPoint(range.position.x, range.position.z);
  const objective = mapPoint(range.mission.objective.x, range.mission.objective.z);
  const start = mapPoint(MISSION_START.x, MISSION_START.z);
  const departure = mapPoint(0, DEPARTURE_Z);
  const west = mapPoint(WORLD_BOUNDS.minX, 0).x;
  const east = mapPoint(WORLD_BOUNDS.maxX, 0).x;
  const boards = range.targets.filter(t => t.kind === 'training').map(t => {
    const p = mapPoint(t.x, t.z);
    return `<path transform="translate(${p.x} ${p.y})" d="${t.destroyedAt === null ? 'M-1.8-1.8H1.8V1.8H-1.8Z' : 'M-2-2 2 2M-2 2 2-2'}" fill="none" stroke="${t.destroyedAt === null ? '#e6c68d' : '#6d7c89'}" stroke-width="1"/>`;
  }).join('');
  const contacts = range.mission.contacts.map(c => {
    const visibility = contactVisibility(c, range.mission.departureCrossed);
    if (visibility === 'hidden') return '';
    const p = mapPoint(c.x, c.z);
    const fill = visibility === 'detected' ? '#ff8065' : visibility === 'neutralized' ? '#57666e' : '#202832';
    const shape = c.kind === 'troop' ? `<circle r="3.1" fill="${fill}" stroke="#ffb09b"/>` : `<rect x="-4" y="-2.7" width="8" height="5.4" rx="1" fill="${fill}" stroke="#ffb09b"/>`;
    return `<g transform="translate(${p.x} ${p.y})">${shape}${visibility === 'neutralized' ? '<path d="M-3-3 3 3M-3 3 3-3" stroke="#b9c7cf" stroke-width="1.3"/>' : ''}</g>`;
  }).join('');
  const roads = SIDE_ROADS.map(road => `<polyline points="${road.points.map(point => { const p = mapPoint(point.x, point.z); return `${p.x},${p.y}`; }).join(' ')}" fill="none" stroke="#bba27c" stroke-width="2.5" opacity=".7" stroke-linejoin="round"><title>${escapeHtml(road.label)}</title></polyline>`).join('');
  const stops = POINTS_OF_INTEREST.map((stop, index) => {
    const p = mapPoint(stop.x, stop.z);
    const visited = range.exploration.visitedIds.includes(stop.id);
    const selected = range.exploration.selectedId === stop.id;
    return `<g transform="translate(${p.x} ${p.y})"><title>${escapeHtml(stop.label)}${visited ? ' / visited' : ''}</title><circle r="${selected ? 5.5 : 4.5}" fill="${visited ? '#2f706a' : '#263947'}" stroke="${selected ? '#7de4ff' : '#c1dfd8'}" stroke-width="1"/><text text-anchor="middle" y="2" font-size="5.5" fill="#fff">${visited ? '&#10003;' : index + 1}</text></g>`;
  }).join('');
  const target = range.navigationTarget;
  const waypoint = target ? (() => { const p = mapPoint(target.x, target.z); return `<path d="M${player.x} ${player.y}L${p.x} ${p.y}" stroke="#7de4ff" stroke-width=".8" stroke-dasharray="2 2" opacity=".8"/><g transform="translate(${p.x} ${p.y})"><circle r="7" fill="none" stroke="#7de4ff"/><path d="M-3 0H3M0-3V3" stroke="#7de4ff" stroke-width="1.2"/></g>`; })() : '';
  const markup = `<rect x="1" y="1" width="158" height="178" rx="3" fill="#202832" stroke="#ffffff35"/><path class="map-reference-detail" d="M46 12V168M80 12V168M114 12V168M12 51H148M12 90H148M12 129H148" stroke="#ffffff0c"/><path d="M${west} ${departure.y}H${east}V168H${west}Z" fill="#a2c4a50c"/><polyline points="${route}" fill="none" stroke="#aa9470" stroke-width="6" opacity=".3" stroke-linejoin="round"/><polyline points="${route}" fill="none" stroke="#fff" stroke-width="1.4" stroke-dasharray="3 3" opacity=".8"/><path d="M${west} ${departure.y}H${east}" stroke="#ffd17d" stroke-width="1.2" stroke-dasharray="4 2"/><text x="15" y="${departure.y - 4}" fill="#ffd17d" font-size="6">LD</text><g transform="translate(${start.x} ${start.y})"><circle r="3" fill="#c5dbca"/><text x="7" y="4" fill="#c5dbca" font-size="6">START</text></g><g transform="translate(${objective.x} ${objective.y})"><circle r="7" fill="#ff58411c" stroke="#ff8065"/><path d="M0-4 4 0 0 4-4 0Z" fill="#fff"/><text x="10" y="3" fill="#fff" font-size="6">DP</text></g>${boards}${contacts}<g transform="translate(${player.x} ${player.y}) rotate(${mapHeading(range.heading)})"><path d="${PLAYER_MARKER_PATH}" fill="#ff5841" stroke="#fff" stroke-width="1.1"/></g><text x="8" y="10" fill="#fff" font-size="6">N &#8593; / SCHEMATIC</text><text class="map-reference-detail" x="15" y="176" fill="#c5dbca" font-size="5.5">STAGING / PRACTICE BOARDS</text>`;
  maps.forEach(svg => { svg.innerHTML = markup.replace('<polyline', `${roads}<polyline`).replace(`${boards}${contacts}`, `${boards}${contacts}${stops}${waypoint}`); });
  syncMapViewport();
  POINTS_OF_INTEREST.forEach(point => {
    const button = mapDialog.querySelector<HTMLButtonElement>(`[data-action="map-stop-${point.id}"]`)!;
    button.setAttribute('aria-pressed', String(range.exploration.selectedId === point.id));
    button.disabled = range.missionEnded;
    button.querySelector('[data-visit-status]')!.textContent = range.exploration.visitedIds.includes(point.id) ? 'Visited' : 'Not visited';
  });
  mapDialog.querySelector<HTMLButtonElement>('[data-action="map-clear"]')!.disabled = !target || range.missionEnded;
  const distance = target ? Math.round(Math.hypot(target.x - range.position.x, target.z - range.position.z)) : 0;
  const visitedTarget = !!target?.id && range.exploration.visitedIds.includes(target.id);
  const status = target ? `${target.label} / ${visitedTarget ? 'visited / ' : ''}${distance} game units${range.exploration.nearbyId === target.id && !visitedTarget ? ' / stop to visit' : ''}` : 'No optional waypoint selected.';
  const statusElement = mapDialog.querySelector('#map-selection-status')!;
  if (statusElement.textContent !== status) statusElement.textContent = status;
  const hint = document.querySelector<HTMLElement>('#map-navigation-hint');
  if (hint) { hint.hidden = !target; hint.textContent = target ? `${target.label} · ${visitedTarget ? 'visited' : `${distance} units`}` : ''; }
  document.querySelectorAll<HTMLElement>('[data-map-contact-legend]').forEach(legend => { legend.hidden = !range.mission.departureCrossed; });
  mapDialog.querySelector('.expanded-map-location')!.textContent = `Grid ${Math.round(range.position.x)} / ${Math.round(range.position.z)}`;
}

function syncSpeedometerView(): void {
  const gauge = document.querySelector<HTMLElement>('.range-speedometer');
  if (gauge) gauge.hidden = !['chase', 'top'].includes(rangeView);
}

function updateRangeLive(): void {
  const set = (id: string, value: string) => { const el = document.getElementById(id); if (el && el.textContent !== value) el.textContent = value; };
  set('range-terrain', range.terrain.label);
  const speedMph = range.speedMph;
  const reversing = speedMph < -.1;
  const speedText = Math.abs(speedMph).toFixed(0);
  set('range-speed', `${speedText}${reversing ? ' REV' : ''}`);
  set('speedometer-speed', speedText);
  set('speedometer-limit', range.speedLimitMph.toFixed(0));
  set('speedometer-reason', range.speedLimitReason);
  const direction = document.getElementById('speedometer-direction');
  if (direction) direction.hidden = !reversing;
  const speedProgress = document.getElementById('speedometer-progress');
  if (speedProgress) speedProgress.style.width = `${Math.min(100, Math.abs(speedMph) / Math.max(1, range.speedLimitMph) * 100)}%`;
  set('range-hits', String(range.hits));
  set('range-shots', String(range.shotsFired));
  set('range-integrity', `${Math.round(range.mission.integrity)}%`);
  const health = range.health;
  syncHealthPulse();
  const healthButton = document.querySelector<HTMLButtonElement>('#range-health-button');
  if (healthButton) { healthButton.dataset.health = health.phase; healthButton.setAttribute('aria-label', health.phase === 'nominal' ? 'Open MFoCS. Vehicle systems normal.' : `Open MFoCS. ${health.phase === 'critical' ? 'Severe vehicle fault' : health.phase === 'broken' ? 'Vehicle breakdown' : health.phase === 'recovery' ? 'Recovery requested' : 'Vehicle fault warning'}.`); }
  set('range-health-label', health.phase === 'nominal' ? 'Systems normal' : health.phase === 'recovery' ? 'Recovery requested' : health.phase === 'broken' ? 'Vehicle stopped' : health.phase === 'critical' ? 'Severe fault' : 'Fault warning');
  set('range-health-notice', health.phase === 'nominal' ? '' : health.phase === 'recovery' ? 'Vehicle stopped. In-game recovery requested; repair required.' : health.phase === 'broken' ? 'Breakdown. Vehicle stopped; repair required.' : `[Health alert tone] ${health.phase === 'critical' ? 'Severe vehicle fault.' : 'Vehicle fault warning.'} Open MFoCS. ${health.paceLimited ? 'Pace reduced; faults remain.' : 'Inspect or reduce pace before damage gets worse.'}`);
  set('range-health-detail', document.getElementById('range-health-notice')?.textContent || 'Vehicle systems normal.');
  const mission = range.mission;
  const terminal = range.missionEnded;
  const pointer = document.getElementById('phone-objective');
  if (pointer) {
    const objective = !terminal && !range.dismounting ? objectivePointer(range.position,range.heading,mission.objective) : null;
    pointer.hidden = !objective;
    const tap = document.getElementById('map-toggle');
    if (objective) {
      pointer.dataset.arrived = String(objective.inZone);
      pointer.querySelector('svg')?.style.setProperty('transform', 'rotate(' + objective.degrees.toFixed(1) + 'deg)');
      set('phone-objective-distance', objective.inZone ? 'IN ZONE' : objective.meters + ' m');
      set('phone-objective-description', objective.inZone ? 'Vehicle is in the dismount zone.' : 'Dismount point is ' + objective.meters + ' meters away. Open Map to see the route.');
      tap?.setAttribute('aria-describedby','phone-objective-description');
    } else tap?.removeAttribute('aria-describedby');
  }
  const clock = range.movementClock;
  const clockLabel = clock.status === 'waiting' ? 'PRACTICE' : clock.status === 'arrived' ? 'ARRIVED' : clock.status === 'expired' ? 'TIME UP' : terminal ? 'HALTED' : range.paused || document.hidden ? 'PAUSED' : 'REMAINING';
  const clockTime = exerciseTime(Math.ceil(clock.remainingSeconds));
  const clockHint = clock.status === 'waiting' ? 'STARTS AT LD' : clock.status === 'running' && !terminal && !range.paused && !document.hidden ? 'TO DISMOUNT' : 'TIME LEFT';
  set('movement-clock-label', clockLabel);
  set('movement-clock-value', clockTime);
  set('movement-clock-hint', clockHint);
  const clockElement = document.querySelector<HTMLElement>('#range-movement-clock');
  if (clockElement) {
    clockElement.dataset.urgent = String(clock.status === 'expired' || (clock.status === 'running' && clock.remainingSeconds <= 30 && !terminal));
    clockElement.setAttribute('aria-label', clock.status === 'waiting' ? 'Three-minute movement clock starts at the line of departure.' : clock.status === 'arrived' ? `Dismount point reached with ${clockTime} remaining.` : `${clockLabel}: ${clockTime} remaining.`);
  }
  const boards = range.targets.filter(t => t.kind === 'training');
  const broken = boards.filter(t => t.destroyedAt !== null).length;
  const dismountStatus = range.dismount.phase === 'opening' ? 'Ramp lowering' : 'Squad exiting: nine troops unloading';
  const rampAvailability = rampCommandAvailability(range, rampCommandContext());
  set('range-mission-status', range.dismounting ? `${mission.failureReason === 'dismount-outside-zone' ? 'MISSION FAILED / Wrong dismount location. ' : 'DISMOUNT / '}${dismountStatus}.` : terminal ? (mission.status === 'complete' ? 'MISSION COMPLETE / squad delivered' : mission.failureReason === 'movement-timeout' ? 'MISSION FAILED / three-minute movement deadline missed' : mission.failureReason === 'dismount-outside-zone' ? 'MISSION FAILED / squad unloaded outside the dismount zone' : mission.status === 'recovery' ? 'MISSION STOPPED / recovery requested' : range.health.phase === 'broken' ? 'MISSION STOPPED / vehicle breakdown' : 'MISSION ENDED / vehicle integrity depleted') : mission.phase === 'training' ? `STAGING / ${practicePrompt(range.shotsFired, broken)}` : mission.phase === 'combat' ? `CLEAR CONTACTS / ${mission.remainingContacts} remaining. Hollow map icons show estimated positions.` : `DISMOUNT / ${Math.round(mission.distance)} units to objective. Stop inside, then select Drop ramp.`);
  set('range-objective-count', range.dismounting ? mission.notice : mission.phase === 'training' ? `${broken} / ${boards.length} practice boards broken (optional). Contacts activate beyond LD.` : mission.remainingContacts > 0 ? `${mission.remainingContacts} / ${mission.contacts.length} contacts remaining. Clear all before dropping the ramp in the zone.` : `All ${mission.contacts.length} contacts cleared. Stop in the marked zone before the deadline, then select Drop ramp.`);
  set('ramp-command-status', range.dismounting ? `${mission.failureReason === 'dismount-outside-zone' ? 'Wrong zone: mission failed. ' : ''}${dismountStatus}.` : terminal ? 'Unload command closed.' : range.time < rampCommandFeedbackUntil ? rampCommandFeedback : rampAvailability.reason);
  const rampButton = document.querySelector<HTMLButtonElement>('#drop-ramp-button');
  if (rampButton) {
    rampButton.disabled = !rangePlayable();
    rampButton.setAttribute('aria-label', `Drop ramp (R). ${rampAvailability.reason}`);
    rampButton.setAttribute('aria-disabled', String(!rampAvailability.available));
    rampButton.title = rampAvailability.reason;
  }
  const progress = document.querySelector<HTMLElement>('#range-progress');
  if (progress) progress.style.width = `${terminal ? 100 : range.dismounting ? 95 : Math.min(90, mission.currentWaypoint / (mission.waypoints.length - 1) * 90)}%`;
  document.querySelector('#range-integrity')?.classList.toggle('integrity-low', mission.integrity < 40);
  const result = document.querySelector<HTMLElement>('#range-result');
  if (result) result.hidden = !terminal || ((range.mission.status === 'breakdown' || range.mission.status === 'recovery') && shownDebrief !== range.debrief && !outcomeReveal.ready);
  if (terminal && range.debrief) {
    const report = range.debrief;
    set('range-result-title', missionDebriefTitle(report));
    set('range-result-detail', report.summary);
    if (shownDebrief !== report && !healthInspection.open && !mapInspection.open && !rangeDrawerInspection.open && (report.outcome !== 'breakdown' && report.outcome !== 'recovery' || outcomeReveal.ready)) openDebrief();
  }
  if (mission.status !== lastMissionStatus) {
    lastMissionStatus = mission.status;
    if (mission.phase !== 'training') { rangeFeedback = mission.notice; rangeFeedbackUntil = range.time + 4; }
    if (terminal) { clearRangeInputs(); syncControls(); }
  }
  const currentNotice = mission.phase === 'training' && !terminal && !range.dismounting ? practicePrompt(range.shotsFired, broken) : mission.notice;
  set('range-contact-notice', currentNotice);
  set('range-contact-detail', currentNotice);
  set('range-event-notice', range.time < rangeEventFeedbackUntil ? rangeEventFeedback : '');
  set('range-event-detail', range.time < rangeEventFeedbackUntil ? rangeEventFeedback : '');
  updateMissionMap();
  set('range-lock', range.dismounting ? 'SQUAD UNLOADING' : range.missionEnded ? 'RUN ENDED' : range.aimLock ? `${range.aimLockReady ? 'LOCK' : 'SLEWING'} / ${range.aimLock.label}` : !range.aimAssistEnabled ? 'MANUAL AIM' : range.manualAimActive ? 'MANUAL / AUTO SOON' : 'AUTO AIM / READY');
  document.querySelector('#range-lock')?.classList.toggle('locked', range.aimLockReady);
  set('range-location', `GRID ${Math.round(range.position.x)} / ${Math.round(range.position.z)}`);
  set('elapsed', `${String(Math.floor(range.time / 60)).padStart(2, '0')}:${String(Math.floor(range.time % 60)).padStart(2, '0')}`);
  updateCaption();
}

function isPaused(): boolean { return mode === 'range' ? range.paused : sim.paused; }
function audioPaused(): boolean { return mode !== 'home' && (isPaused() || evidenceOpen || debriefDialog.open); }
function inspectionAudioContinues(): boolean {
  if (debriefDialog.open) return false;
  if (mode === 'range') return !range.missionEnded && (healthInspection.audioContinues || mapInspection.audioContinues);
  return mode === 'mission' && evidenceOpen && !sim.paused;
}

function clearRangeInputs(): void {
  keyboard.clear();
  clearOnscreenRangeInputs();
}

/** Hidden controls cannot leave a captured pointer, fire request or cruise latched. */
function clearOnscreenRangeInputs(): void {
  keyboard.consumeFire();
  const pointers = [...heldPointers.keys(), ...(touchStick.pointerId === null ? [] : [touchStick.pointerId]), ...(aimPointer === undefined ? [] : [aimPointer])];
  heldPointers.clear(); touchStick.clear(); aimInput = 0; aimPointer = undefined; cruise = false;
  document.querySelectorAll<HTMLElement>('[data-hold], #drive-stick, #range-aim-input').forEach(el => {
    for (const id of pointers) if (el.hasPointerCapture(id)) el.releasePointerCapture(id);
  });
  syncStick();
  document.querySelectorAll<HTMLElement>('[data-hold]').forEach(el => el.classList.remove('held'));
  const slider = document.querySelector<HTMLInputElement>('#range-aim-input');
  if (slider) slider.value = '0';
  const toggle = document.querySelector<HTMLButtonElement>('#cruise-toggle');
  if (toggle) { toggle.setAttribute('aria-pressed', 'false'); toggle.firstChild!.textContent = 'Drive lock'; }
}

function rangeInput() {
  return withTouchStick(drivingInput(keyboard, new Set(heldPointers.values()), aimInput, cruise), touchStick);
}

function renderEvidenceRows(): void {
  const rows = sim.observations.slice(-8).reverse();
  document.querySelector('#sample-table')!.innerHTML = rows.length ? rows.map(o => `<tr><td>${o.time.toFixed(1)} s</td><td>${o.voltage.toFixed(2)}</td><td>${Math.round(o.load * 100)}%</td><td>${o.engine ? 'Running' : 'Off'}</td><td>${o.fresh ? 'Fresh' : 'Stale'}</td></tr>`).join('') : '<tr><td colspan="5">Readings begin when you enter the exercise.</td></tr>';
}

function syncSoundControls(): void {
  const state = audio.soundState;
  lastMusicPreparing = audio.musicPreparing;
  lastSoundState = state;
  const retry = state === 'unstarted' || state === 'blocked' || ((mode === 'home' || mode === 'briefing') && state === 'paused');
  const label = muted ? 'Sound off' : retry ? 'Tap sound' : state === 'paused' ? 'Sound paused' : state === 'unsupported' ? 'Sound unavailable' : 'Sound on';
  const description = muted ? 'Turn sound on (M)' : retry ? 'Tap to enable sound (M)' : state === 'unsupported' ? 'Sound unavailable on this device; tap to retry (M)' : state === 'paused' ? 'Sound paused with exercise; turn sound off (M)' : 'Turn sound off (M)';
  document.querySelectorAll<HTMLButtonElement>('[data-action="mute"]').forEach(el => {
    el.setAttribute('aria-pressed', String(muted));
    el.setAttribute('aria-label', description);
    el.title = description;
    el.dataset.soundRetry = String(retry);
    if (!el.querySelector('#sound-icon')) el.textContent = label;
  });
  document.querySelector('#sound-label')!.textContent = label;
  document.querySelectorAll<HTMLButtonElement>('[data-action="music"]').forEach(el => {
    const playMusic = (mode === 'home' || mode === 'briefing') && audio.musicNeedsActivation;
    const status = !audio.musicEnabled ? 'Music off' : muted ? 'Music on; master sound muted' : playMusic ? 'Play music' : audioPaused() && !inspectionAudioContinues() ? 'Music on; paused with exercise' : audio.musicPreparing ? 'Music loading' : retry ? 'Music on; tap sound to enable audio' : 'Music on';
    el.setAttribute('aria-label', playMusic ? 'Play music' : `${status}. ${audio.musicEnabled ? 'Turn music off' : 'Turn music on'}`);
    el.title = status;
    if (el.classList.contains('drawer-music-control')) el.textContent = `Music: ${audio.musicEnabled ? 'on' : 'off'}`;
  });
  document.querySelector('#music-label')!.textContent = (mode === 'home' || mode === 'briefing') && audio.musicNeedsActivation ? 'Play music' : audio.musicPreparing ? 'Music loading' : audio.musicEnabled ? 'Music on' : 'Music off';
  document.querySelector('#sound-icon')!.textContent = muted ? '◖×' : retry ? '♪↻' : state === 'unsupported' ? '♪×' : '◖))';
}

/** Keep context activation in the original click/key gesture, before any await. */
function activateSound(retryOutput = false): void {
  audio.setPaused(audioPaused(), inspectionAudioContinues());
  void audio.start(retryOutput).then(syncSoundControls, syncSoundControls);
  syncSoundControls();
}

function syncControls(): void {
  const paused = isPaused();
  document.body.classList.toggle('briefing-held', mode === 'briefing' && (paused || document.hidden));
  syncHealthPulse();
  document.querySelectorAll<HTMLButtonElement>('[data-action="music"]').forEach(el => {
    el.setAttribute('aria-pressed', String(audio.musicEnabled));
    if (el.classList.contains('drawer-music-control')) el.textContent = `Music: ${audio.musicEnabled ? 'on' : 'off'}`;
  });
  document.querySelector('#music-label')!.textContent = audio.musicEnabled ? 'Music on' : 'Music off';
  document.querySelectorAll<HTMLButtonElement>('[data-action="pause"]').forEach(el => { el.setAttribute('aria-pressed', String(paused)); el.disabled = mode === 'home' || healthInspection.open || mapInspection.open || evidenceOpen; });
  document.querySelector('#pause-label')!.textContent = paused ? 'Resume' : 'Pause';
  const pauseDescription = paused ? 'Resume exercise (P)' : 'Pause exercise (P)';
  document.querySelectorAll<HTMLButtonElement>('[data-action="pause"]').forEach(el => { el.setAttribute('aria-label', pauseDescription); el.title = pauseDescription; });
  document.querySelector('#pause-icon')!.textContent = paused ? '▷' : 'Ⅱ';
  document.querySelectorAll<HTMLButtonElement>('[data-action="motion"]').forEach(el => el.setAttribute('aria-pressed', String(reducedMotion)));
  syncPauseMenu();
  const terminalRange = mode === 'range' && range.missionEnded;
  const dismounting = mode === 'range' && range.dismounting;
  stage.querySelectorAll<HTMLButtonElement>('button').forEach(el => {
    const name = el.dataset.action ?? '';
    const transport = ['restart', 'menu', 'map', 'review-debrief', 'range-drawer', 'range-controls', 'aim-assist', 'motion', 'fullscreen', 'mute', 'sound-retry', 'music', 'pause'].includes(name) || name.startsWith('range-view-') || name.startsWith('gunner-');
    const viewControl = ['display-focus', 'display-toggle', 'view', 'evidence', 'health'].includes(name) || name.startsWith('guided-sensor-') || !!el.closest('.vehicle-inspector');
    el.disabled = (!transport && !viewControl && mode !== 'home' && (paused || terminalRange || dismounting || missionStaging.active)) || (name === 'halt' && !sim.alert) || (name === 'start-range' && !graphicsAvailable);
  });
  syncGunnerDisplay();
  syncGuidedAction();
  const slider = document.querySelector<HTMLInputElement>('#range-aim-input');
  if (slider) slider.disabled = paused || terminalRange || dismounting || missionStaging.active;
  audio.setPaused(audioPaused(), inspectionAudioContinues());
  syncSoundControls();
}

/** Native modal focus keeps movement controls inactive until deliberate Resume. */
function syncPauseMenu(): void {
  const show = mode !== 'home' && isPaused() && !healthInspection.open && !mapInspection.open && !rangeDrawerInspection.open && !debriefDialog.open && !evidenceOpen && !dialog.open && !(mode === 'range' && range.missionEnded);
  if (show && !pauseBanner.open) pauseBanner.showModal();
  else if (!show && pauseBanner.open) pauseBanner.close();
}

function setPaused(value: boolean): void {
  clearRangeInputs();
  if (mode === 'range') range.paused = value; else sim.paused = value;
  previousFrame = performance.now();
  syncControls();
}

async function action(name: string): Promise<void> {
  if (name === 'range-controls' && mode === 'range') {
    if (healthInspection.open || mapInspection.open || rangeDrawerInspection.open || debriefDialog.open || dialog.open) return;
    rangeControlsExpanded = !rangeControlsExpanded;
    if (!rangeControlsExpanded) clearOnscreenRangeInputs();
    syncRangeControls();
    return;
  }
  if (name === 'sound-retry') {
    if (rangeDrawerInspection.open) setRangeDrawer(false);
    muted = false; audio.setMuted(false); preferences.muted = false; saveGamePreferences(preferences);
    activateSound(true); syncControls(); return;
  }
  if (name === 'music') {
    // The first home tap honors enabled music and unlocks it; a later tap toggles.
    if (!((mode === 'home' || mode === 'briefing') && audio.musicNeedsActivation)) {
      audio.setMusicEnabled(!audio.musicEnabled); preferences.musicEnabled = audio.musicEnabled; saveGamePreferences(preferences);
    }
    if (audio.musicEnabled && !muted) activateSound(audio.soundState === 'blocked');
    syncControls(); return;
  }
  if (name.startsWith('gunner-') && mode === 'range' && rangeView === 'inside') {
    const display = name.slice('gunner-'.length);
    if (display === 'expand') {
      cabinDisplay.toggleFocus();
    } else if (display === 'day' || display === 'thermal' || display === 'mfocs') {
      cabinDisplay.select(display);
    } else return;
    clearRangeInputs();
    syncGunnerDisplay();
    return;
  }
  if (name === 'range-drawer' && mode === 'range') { setRangeDrawer(!rangeDrawerInspection.open); return; }
  if (name === 'aim-assist' && mode === 'range') {
    range.setAimAssist(!range.aimAssistEnabled);
    const toggle = document.querySelector('[data-action="aim-assist"]');
    toggle?.setAttribute('aria-pressed', String(range.aimAssistEnabled));
    if (toggle) toggle.textContent = `Auto aim: ${range.aimAssistEnabled ? 'on' : 'off'}`;
    updateRangeLive(); return;
  }
  if (name === 'health') { closeMap(); setRangeDrawer(false); openHealth(); return; }
  if (name === 'review-debrief') { openDebrief(); return; }
  if (name === 'close-debrief') { closeDebrief(); return; }
  if (name.startsWith('sensor-') || name.startsWith('guided-sensor-')) {
    const guided = name.startsWith('guided-sensor-');
    const id = name.slice(guided ? 14 : 7) as FaultId;
    if (['charging', 'cooling', 'wheel-end'].includes(id)) selectFault(id, guided);
    return;
  }
  if (name === 'close-health') { closeHealth(); return; }
  if (name.startsWith('health-') && mode === 'range' && healthInspection.open) {
    const decision = name.slice(7);
    if (decision !== 'continue' && decision !== 'diagnose' && decision !== 'reduce-pace' && decision !== 'recovery') return;
    if (decision === 'continue' && range.health.phase === 'nominal') { closeHealth(); return; }
    if (!range.takeHealthDecision(decision, selectedFault) && !(decision === 'continue' && range.health.continued && !range.missionEnded)) return;
    clearRangeInputs();
    if (decision === 'diagnose') {
      renderHealthPanel();
      healthDialog.querySelector<HTMLElement>('#health-fault-detail')?.focus({ preventScroll: true });
    } else {
      closeHealth(decision === 'recovery' ? 'recovery' : 'resume');
      if (decision === 'recovery') {
        outcomeReveal.update(range.debrief,0,false);
        setPaused(false);
        activateSound();
      }
    }
    updateRangeLive(); syncControls(); return;
  }
  if (name === 'menu') {
    missionBriefing.cancel(); missionStaging.cancel();
    closeMap();
    setRangeDrawer(false);
    closeDebrief(); shownDebrief = null; outcomeReveal.reset();
    if (healthInspection.open) closeHealth();
    clearRangeInputs();
    if (dialog.open) dialog.close();
    guidedWarningAt = null; guidedSevereAt = null;
    rampCommandFeedback = ''; rampCommandFeedbackUntil = 0;
    mode = 'home'; sim.restart(); range.restart(); audio.restart(); range.callsign = audio.missionCallsign; audio.setMuted(muted);
    resetGunnerDisplay();
    guidedExercise.reset(); guidedRoadmapOpen = false; displayExpanded = false; insideView = true; scene.setViewMode('inside');
    // Seed the home mixer before a tab switch can suspend its first RAF.
    audio.updateHome(0, audioPaused());
    previousFrame = performance.now(); render(); window.scrollTo({ top: 0 }); return;
  }
  if (name === 'start-range' || (name === 'restart' && (mode === 'range' || mode === 'briefing'))) {
    closeMap();
    setRangeDrawer(false);
    closeDebrief(); shownDebrief = null; outcomeReveal.reset(); selectedFault = 'charging';
    if (!graphicsAvailable) return;
    if (healthInspection.open) closeHealth();
    rampCommandFeedback = ''; rampCommandFeedbackUntil = 0;
    missionStaging.cancel(); clearRangeInputs(); mode = 'briefing'; range.restart(); sim.restart(); audio.restart(); range.callsign = audio.missionCallsign; audio.setMuted(muted);
    resetGunnerDisplay();
    mapNavigation.fit();
    rangeView = 'chase'; document.body.dataset.rangeView = rangeView; lastMissionStatus = ''; lastRangeShots = 0; lastRangeHits = 0; rangeFeedbackUntil = 0; lastHealthAlertSerial = 0; observedBrokenBoards.clear(); rangeEventFeedbackUntil = 0;
    missionBriefing.begin(range.callsign, reducedMotion);
    previousFrame = performance.now();
    render(); stage.focus({ preventScroll: true }); window.scrollTo({ top: 0 });
    activateSound();
    return;
  }
  if (name === 'skip-briefing' && mode === 'briefing' && !isPaused()) {
    missionBriefing.skip(); updateBriefing(); document.querySelector<HTMLButtonElement>('[data-action="accept-mission"]')?.focus({ preventScroll: true }); return;
  }
  if (name === 'accept-mission' && mode === 'briefing' && !isPaused() && !document.hidden && missionBriefing.accept()) {
    missionStaging.begin(); clearRangeInputs(); mode = 'range'; previousFrame = performance.now();
    render(); stage.focus({ preventScroll: true }); window.scrollTo({ top: 0 }); activateSound(); return;
  }
  if (name.startsWith('range-view-') && mode === 'range') {
    const view = name.slice('range-view-'.length) as RangeView;
    if (!RANGE_VIEWS.includes(view)) return;
    setRangeView(view);
    return;
  }
  if (name === 'map' && mode === 'range') { openMap(); return; }
  if (name === 'close-map') { closeMap(); return; }
  if (name.startsWith('map-') && mapInspection.open && mode === 'range') {
    cancelMapGesture();
    if (name === 'map-zoom-in') mapNavigation.setZoom(mapNavigation.zoom * 1.5);
    else if (name === 'map-zoom-out') mapNavigation.setZoom(mapNavigation.zoom / 1.5);
    else if (name === 'map-fit') mapNavigation.fit();
    else if (name === 'map-recenter') { const player = mapPoint(range.position.x, range.position.z); mapNavigation.setZoom(Math.max(2, mapNavigation.zoom)); mapNavigation.center(player.x, player.y); }
    else if (name === 'map-clear') range.clearNavigationTarget();
    else if (name.startsWith('map-stop-')) { const id = name.slice(9); if (range.selectNavigationTarget(id)) { const point = range.navigationTarget!; const p = mapPoint(point.x, point.z); mapNavigation.center(p.x, p.y); } }
    updateMissionMap(); return;
  }
  if (name === 'drop-ramp') {
    const result = executeRampCommand(range, rampCommandContext());
    rampCommandFeedback = result.reason; rampCommandFeedbackUntil = range.time + 5;
    if (result.accepted) {
      clearRangeInputs();
      setRangeView('chase');
      syncControls();
    }
    if (mode === 'range') updateRangeLive();
    return;
  }
  if (name === 'cruise' && rangePlayable()) {
    cruise = keyboard.keys.has('KeyB') ? false : !cruise;
    const toggle = document.querySelector('#cruise-toggle')!;
    toggle.setAttribute('aria-pressed', String(cruise));
    toggle.firstChild!.textContent = cruise ? 'Driving' : 'Drive lock'; return;
  }
  if (name === 'center-aim' && rangePlayable()) { range.centerAim(); aimInput = 0; return; }
  if (name === 'fullscreen') {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
    catch { /* The exercise remains available when fullscreen is restricted by the browser. */ }
    return;
  }
  if (name === 'view') {
    insideView = !insideView;
    scene.setViewMode(insideView ? 'inside' : 'commander');
    const viewLabel = document.querySelector('.commander-hud .eyebrow');
    if (viewLabel) viewLabel.textContent = insideView ? 'INSIDE / COMMANDER SEAT' : 'HATCH / COMMANDER VIEW';
    const toggle = document.querySelector<HTMLButtonElement>('[data-action="view"]');
    if (toggle) { toggle.setAttribute('aria-pressed', String(insideView)); toggle.textContent = insideView ? 'Hatch view' : 'Inside view'; }
    return;
  }
  if (name === 'display-focus') {
    if (mode === 'mission' && !guidedExercise.displayOpen) return;
    displayExpanded = !displayExpanded;
    document.body.classList.toggle('display-expanded', displayExpanded);
    const toggle = document.querySelector<HTMLButtonElement>('[data-action="display-focus"]');
    if (toggle) { toggle.setAttribute('aria-expanded', String(displayExpanded)); toggle.textContent = displayExpanded ? '↙ Return to commander view' : '⤢ Expand display'; }
    if (displayExpanded) document.querySelector('.instrument-position')?.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'instant' : 'smooth' });
    scene.resize(); return;
  }
  if (name === 'display-toggle' && mode === 'mission') {
    const panel = document.querySelector('#guided-mfocs-panel');
    const focusInside = !!panel?.contains(document.activeElement);
    guidedExercise.toggleDisplay();
    syncGuidedDisplay(); syncGuidedAction(); scene.resize();
    if (!guidedExercise.displayOpen && focusInside) document.querySelector<HTMLButtonElement>('[data-action="display-toggle"]')?.focus({ preventScroll: true });
    return;
  }
  if (name === 'pause') { if (mapInspection.open || evidenceOpen) return; if (rangeDrawerInspection.open) { setRangeDrawer(false); if (!isPaused()) activateSound(); return; } if (!document.hidden && mode !== 'home' && !healthInspection.open) { setPaused(!isPaused()); if (!isPaused()) activateSound(); } return; }
  if (name === 'mute') {
    const retry = !muted && (audio.soundState === 'blocked' || audio.soundState === 'unstarted' || audio.soundState === 'unsupported' || ((mode === 'home' || mode === 'briefing') && audio.soundState === 'paused'));
    if (!retry) {
      muted = !muted;
      audio.setMuted(muted);
      preferences.muted = muted;
      saveGamePreferences(preferences);
    }
    if (!muted) activateSound();
    syncControls(); return;
  }
  if (name === 'motion') { reducedMotion = !reducedMotion; if (mode === 'briefing' && reducedMotion) { missionBriefing.skip(); updateBriefing(); } preferences.reducedMotion = reducedMotion; saveGamePreferences(preferences); document.body.classList.toggle('reduced-motion', reducedMotion); syncControls(); return; }
  if (name === 'restart') { guidedWarningAt = null; guidedSevereAt = null; clearRangeInputs(); resetGunnerDisplay(); if (dialog.open) dialog.close(); guidedExercise.reset(); guidedRoadmapOpen = false; displayExpanded = false; insideView = true; scene.setViewMode('inside'); sim.restart(); audio.restart(mode === 'mission'); range.callsign = audio.missionCallsign; audio.setMuted(muted); if (mode === 'mission') { sim.begin(); } activateSound(); previousFrame = performance.now(); render(); window.scrollTo({ top: 0 }); return; }
  if (name === 'evidence') {
    clearRangeInputs();
    document.querySelector('#detail-chart')!.innerHTML = chart(true);
    renderEvidenceRows(); updateCharts(); evidenceOpen = true; syncPauseMenu(); dialog.showModal(); syncControls(); return;
  }
  if (name === 'close-evidence') { dialog.close(); return; }
  if ((sim.paused && mode !== 'home') || document.hidden) return;
  const before = sim.phase;
  if (name === 'begin') {
    guidedWarningAt = null; guidedSevereAt = null; selectedFault = 'charging';
    mode = 'mission'; guidedExercise.reset(); guidedRoadmapOpen = false; displayExpanded = false; sim.restart(); audio.restart(true); range.callsign = audio.missionCallsign; audio.setMuted(muted); insideView = true; scene.setViewMode('inside');
    resetGunnerDisplay();
    sim.begin();
    activateSound();
  } else if (name === 'board') { insideView = false; scene.setViewMode('commander'); sim.board(); }
  else if (name === 'guided-next' && mode === 'mission') {
    guidedExercise.activate(sim);
    if (before === 'exterior' && sim.phase === 'cabin') { insideView = false; scene.setViewMode('commander'); }
    syncGuidedDisplay(); syncGuidedAction();
  }
  else if (name === 'advance') sim.advance();
  else if (name === 'halt') sim.halt();
  else if (name === 'secure') sim.secure();
  else if (name === 'isolate') sim.isolate();
  if (sim.phase !== before) { render(); stage.focus({ preventScroll: true }); if (window.matchMedia('(max-width: 760px), (pointer: coarse) and (max-height: 540px)').matches) window.scrollTo({ top: 0 }); }
  audio.update(sim, { inside: insideView });
}

document.addEventListener('click', event => {
  const target = (event.target as Element).closest<HTMLElement>('[data-action]');
  if (target) { event.preventDefault(); void action(target.dataset.action!); }
  // Run after action state changes so explicit Music off / Sound off wins.
  // Native click covers taps, keyboard buttons and ordinary home links/details.
  if (event.isTrusted && !audioPaused() && ((mode === 'home' || mode === 'briefing') ? audio.musicNeedsActivation : audio.soundState === 'blocked') && !['music', 'mute', 'sound-retry', 'begin', 'start-range', 'restart', 'pause'].includes(target?.dataset.action ?? '')) activateSound();
});
document.addEventListener('toggle', event => {
  if (event.target instanceof HTMLDetailsElement && event.target.classList.contains('guided-roadmap')) guidedRoadmapOpen = event.target.open;
}, true);
function rampCommandContext(): RampCommandContext {
  return { inRange: mode === 'range', staging: missionStaging.active, hidden: document.hidden,
    inspection: healthInspection.open ? 'vehicle inspection' : mapInspection.open ? 'mission map' : rangeDrawerInspection.open ? 'mission instructions' : debriefDialog.open || dialog.open ? 'dialog' : null };
}
function rangePlayable(): boolean { return mode === 'range' && !missionStaging.active && !range.paused && !document.hidden && !range.missionEnded && !range.dismounting && !healthInspection.open && !mapInspection.open && !rangeDrawerInspection.open && !debriefDialog.open && !dialog.open; }

function syncHealthPulse(): void {
  document.body.dataset.healthPulse = String(rangePlayable() && !reducedMotion && (range.health.phase === 'warning' || range.health.phase === 'critical'));
}

function keyboardTarget(target: EventTarget | null) {
  const element = target instanceof HTMLElement ? target : null;
  const input = element?.closest('input,textarea,select');
  return { tagName: input?.tagName, type: input instanceof HTMLInputElement ? input.type : undefined, editable: !!element?.isContentEditable };
}

document.addEventListener('keydown', event => {
  if (event.key === 'Tab') {
    gameFocus.navigateWithKeyboard();
    clearRangeInputs();
    if (rangeDrawerInspection.open) {
      const controls = [...document.querySelectorAll<HTMLElement>('#range-drawer button:not(:disabled), #range-drawer a[href], #range-drawer [tabindex="0"]')].filter(element => element.getClientRects().length > 0 && !element.inert);
      const index = nextTrappedFocus(controls.indexOf(document.activeElement as HTMLElement), controls.length, event.shiftKey);
      event.preventDefault();
      if (index !== null) controls[index]!.focus({ preventScroll: true });
      return;
    }
  }
  if (pauseBanner.open) {
    const code = gameKeyCode(event);
    if ((code === 'KeyP' || code === 'Escape') && !event.repeat && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault(); void action('pause');
    }
    // Native Enter/Space activation and Tab focus stay within the Resume dialog.
    return;
  }
  if (gameKeyCode(event) === 'Escape' && mapInspection.open) { event.preventDefault(); closeMap(); return; }
  if ((gameKeyCode(event) === 'Enter' || gameKeyCode(event) === 'Space') && event.target instanceof HTMLElement && event.target.matches('.map-content')) { event.preventDefault(); openMap(); return; }
  if (gameKeyCode(event) === 'Escape' && rangeDrawerInspection.open) { event.preventDefault(); setRangeDrawer(false); return; }
  if (!permitsGameKeys(keyboardTarget(event.target), event, healthInspection.open || mapInspection.open || rangeDrawerInspection.open) || dialog.open || debriefDialog.open) {
    // Modifier shortcuts and editor focus cannot leave an old throttle latched.
    keyboard.clear();
    return;
  }
  const code = gameKeyCode(event);
  const nativeSpace = code === 'Space' && gameFocus.nativeSpace(event.target instanceof HTMLElement && !!event.target.closest('button[data-action], summary'));
  if (code === 'KeyM' && !event.repeat) { event.preventDefault(); void action('mute'); return; }
  if (code === 'KeyP' && !event.repeat) { event.preventDefault(); void action('pause'); return; }
  const drive = routeDrivingKeyDown(event, keyboard, { inRange: mode === 'range', playable: rangePlayable(), target: keyboardTarget(event.target), nativeSpace });
  if (drive.consumed) { if (drive.cancelCruise) cancelCruise(); return; }
  if (mode === 'range') {
    if (nativeSpace) {
      keyboard.up('Space');
      return;
    }
    if (code === 'KeyR' && !event.repeat) { event.preventDefault(); void action('drop-ramp'); return; }
    const camera = rangeViewForKey(code);
    if (camera && !event.repeat) { event.preventDefault(); void action(`range-view-${camera}`); return; }
    return;
  }
  if (code === 'Space' && !event.repeat && !(event.target instanceof HTMLElement && event.target.closest('button, summary'))) { event.preventDefault(); void action('pause'); }
});
// Always release even when focus/modifiers changed after keydown.
document.addEventListener('keyup', event => { const code = gameKeyCode(event); keyboard.up(code); if (event.target instanceof HTMLInputElement && event.target.id === 'range-aim-input' && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(code)) { aimInput = 0; event.target.value = '0'; } });
document.addEventListener('focusin', event => { if (!permitsGameKeys(keyboardTarget(event.target), {}, healthInspection.open || mapInspection.open || rangeDrawerInspection.open)) clearRangeInputs(); });

function cancelCruise(): void {
  cruise = false;
  const toggle = document.querySelector('#cruise-toggle');
  if (toggle) { toggle.setAttribute('aria-pressed', 'false'); toggle.firstChild!.textContent = 'Drive lock'; }
}

function syncStick(): void {
  const control = document.querySelector<HTMLElement>('#drive-stick');
  if (!control) return;
  control.style.setProperty('--stick-x', `${touchStick.position.x * 36}px`);
  control.style.setProperty('--stick-y', `${touchStick.position.y * 36}px`);
  control.classList.toggle('held', touchStick.pointerId !== null);
}

function syncRangeControls(): void {
  const panel = document.querySelector<HTMLElement>('#range-controls');
  const aim = document.querySelector<HTMLInputElement>('#range-aim-input');
  const toggle = document.querySelector<HTMLButtonElement>('[data-action="range-controls"]');
  if (!panel || !aim || !toggle) return;
  const compact = compactRangeControls.matches;
  const hidePanel = !compact && !rangeControlsExpanded;
  const hideAim = compact && !rangeControlsExpanded;
  // Move focus before hiding the element that currently owns it.
  if ((hidePanel && panel.contains(document.activeElement)) || (hideAim && aim.contains(document.activeElement))) toggle.focus({ preventScroll: true });
  panel.hidden = hidePanel;
  panel.inert = hidePanel;
  aim.hidden = hideAim;
  aim.inert = hideAim;
  toggle.setAttribute('aria-controls', compact ? 'range-aim-input' : 'range-controls');
  toggle.setAttribute('aria-expanded', String(rangeControlsExpanded));
  toggle.textContent = rangeControlsExpanded ? 'Hide controls' : 'Controls';
  document.body.classList.toggle('range-controls-open', rangeControlsExpanded);
}

compactRangeControls.addEventListener('change', () => {
  if (mode !== 'range') return;
  clearOnscreenRangeInputs();
  syncRangeControls();
});

function setRangeDrawer(open: boolean): void {
  if (open === rangeDrawerInspection.open || (open && mapInspection.open)) return;
  if (open) {
    drawerReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    rangeDrawerInspection.begin(range.paused, keyboard); setPaused(true);
    // The drawer pauses the exercise and owns interaction until Close/Escape.
    const background = [...stage.children, ...document.querySelectorAll('.masthead, .bottom-bar, #pause-banner')];
    background.forEach(element => {
      if (!(element instanceof HTMLElement) || element.id === 'range-drawer') return;
      drawerBackground.set(element, element.inert); element.inert = true;
    });
  }
  else setPaused(rangeDrawerInspection.end(keyboard));
  document.body.classList.toggle('range-drawer-open', open);
  document.querySelector('[data-action="range-drawer"]')?.setAttribute('aria-expanded', String(open));
  if (open) document.querySelector<HTMLElement>('.range-drawer-heading button')?.focus({ preventScroll: true });
  else {
    drawerBackground.forEach((inert, element) => { element.inert = inert; });
    drawerBackground.clear();
    if (drawerReturnFocus?.isConnected && !drawerReturnFocus.inert) drawerReturnFocus.focus({ preventScroll: true });
    else document.querySelector<HTMLElement>('.range-menu-toggle')?.focus({ preventScroll: true });
    drawerReturnFocus = null;
  }
}

document.addEventListener('pointerdown', () => { gameFocus.usePointer(); }, { capture: true });
document.addEventListener('pointerdown', event => {
  if (!rangePlayable() || event.button !== 0) return;
  const element = event.target instanceof Element ? event.target : null;
  const stick = element?.closest<HTMLElement>('#drive-stick');
  if (stick) {
    event.preventDefault();
    const box = stick.getBoundingClientRect();
    if (touchStick.begin(event.pointerId, box.left + box.width / 2, box.top + box.height / 2, box.width / 2 - 20, event.clientX, event.clientY)) {
      cancelCruise();
      stick.setPointerCapture(event.pointerId);
      syncStick();
    }
    return;
  }
  if (element instanceof HTMLInputElement && element.id === 'range-aim-input') {
    if (aimPointer === undefined) { aimPointer = event.pointerId; element.setPointerCapture(event.pointerId); }
    else event.preventDefault();
    return;
  }
  const control = element?.closest<HTMLButtonElement>('[data-hold]');
  if (!control || control.disabled) return;
  event.preventDefault();
  if (['accelerate', 'forward', 'reverse'].includes(control.dataset.hold!)) cancelCruise();
  heldPointers.set(event.pointerId, control.dataset.hold!);
  if (control.dataset.hold === 'fire') keyboard.pulseFire();
  control.classList.add('held');
  control.setPointerCapture(event.pointerId);
});
document.addEventListener('pointermove', event => {
  if (touchStick.move(event.pointerId, event.clientX, event.clientY)) { event.preventDefault(); syncStick(); }
}, { passive: false });
const releasePointer = (event: PointerEvent) => {
  if (touchStick.release(event.pointerId)) syncStick();
  const name = heldPointers.get(event.pointerId);
  heldPointers.delete(event.pointerId);
  if (name === 'fire' && event.type !== 'pointerup') keyboard.consumeFire();
  if (name && ![...heldPointers.values()].includes(name)) document.querySelectorAll<HTMLElement>(`[data-hold="${name}"]`).forEach(el => el.classList.remove('held'));
  if (event.pointerId === aimPointer) {
    aimInput = 0; aimPointer = undefined;
    const slider = document.querySelector<HTMLInputElement>('#range-aim-input');
    if (slider) slider.value = '0';
  }
  const target = event.target;
  if (target instanceof Element && target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
};
document.addEventListener('pointerup', releasePointer);
document.addEventListener('pointercancel', releasePointer);
document.addEventListener('lostpointercapture', releasePointer);

document.addEventListener('input', event => { if (event.target instanceof HTMLInputElement && event.target.id === 'range-aim-input') aimInput = -Number(event.target.value); });
document.addEventListener('change', event => { if (event.target instanceof HTMLInputElement && event.target.id === 'range-aim-input') { aimInput = 0; event.target.value = '0'; } });
// Clicking away releases controls without changing the user's Pause choice.
window.addEventListener('blur', () => playbackFocus.blur());
dialog.addEventListener('close', () => { evidenceOpen = false; previousFrame = performance.now(); syncControls(); });
pauseBanner.addEventListener('cancel', event => { event.preventDefault(); void action('pause'); });
mapDialog.addEventListener('cancel', event => { event.preventDefault(); closeMap(); });
mapDialog.addEventListener('click', event => {
  if (event.target !== mapDialog) return;
  const bounds = mapDialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeMap();
});
healthDialog.addEventListener('cancel', event => { event.preventDefault(); closeHealth(); });
healthDialog.addEventListener('close', () => { if (!healthDialog.open) closeHealth(); });
debriefDialog.addEventListener('cancel', event => { event.preventDefault(); closeDebrief(); });
document.addEventListener('fullscreenchange', () => { document.querySelector('[data-action="fullscreen"]')?.setAttribute('aria-pressed', String(!!document.fullscreenElement)); scene.resize(); });
let backgroundAudioTimer: ReturnType<typeof setInterval> | undefined;
let backgroundAudioAt = performance.now();
function syncBackgroundAudio(): void {
  if (backgroundAudioTimer !== undefined) { clearInterval(backgroundAudioTimer); backgroundAudioTimer = undefined; }
  backgroundAudioAt = performance.now();
  if (document.hidden) backgroundAudioTimer = setInterval(() => {
    const now = performance.now(); audio.updateBackground((now - backgroundAudioAt) / 1000); backgroundAudioAt = now;
  }, 100);
}
document.addEventListener('visibilitychange', () => { syncBackgroundAudio(); playbackFocus.visibilityChanged(); syncHealthPulse(); document.body.classList.toggle('briefing-held', mode === 'briefing' && (isPaused() || document.hidden)); });
motionPreference.addEventListener('change', event => { if (preferences.reducedMotion !== null) return; reducedMotion = event.matches; if (mode === 'briefing' && reducedMotion) { missionBriefing.skip(); updateBriefing(); } document.body.classList.toggle('reduced-motion', reducedMotion); syncControls(); });
// Measure captions rather than assuming a fixed height: long cues and phone text scaling
// must reserve their real space below the persistent action.
const captionBar = document.querySelector<HTMLElement>('.bottom-bar')!;
const captionObserver = new ResizeObserver(() => { document.documentElement.style.setProperty('--caption-height', `${Math.ceil(captionBar.getBoundingClientRect().height)}px`); });
captionObserver.observe(captionBar);
window.addEventListener('resize', () => { cancelMapGesture(); clearRangeInputs(); if (!window.matchMedia('(max-width: 760px), (pointer: coarse) and (max-height: 540px)').matches) setRangeDrawer(false); scene.resize(); });
const pageLifecycle = new PageLifecycle({
  suspend() { playbackFocus.visibilityChanged(); syncBackgroundAudio(); },
  dispose() { if (backgroundAudioTimer !== undefined) clearInterval(backgroundAudioTimer); captionObserver.disconnect(); guidedLayoutObserver?.disconnect(); healthInspector?.dispose(); guidedInspector?.dispose(); audio.dispose(); scene.dispose(); },
  restore() { syncBackgroundAudio(); playbackFocus.visibilityChanged(); scene.resize(); },
});
window.addEventListener('pagehide', event => pageLifecycle.hide(event.persisted));
window.addEventListener('pageshow', event => pageLifecycle.show(event.persisted));

function frame(now: number): void {
  const delta = Math.max(0, Math.min((now - previousFrame) / 1000, .15));
  previousFrame = now;
  // Hidden world frames never advance; native audio has its own clock below.
  if (document.hidden) { requestAnimationFrame(frame); return; }
  const active = !isPaused() && !evidenceOpen;
  if (mode === 'range') {
    const staged = missionStaging.active;
    if (missionStaging.update(delta, active && !healthInspection.open && !mapInspection.open && !rangeDrawerInspection.open && !debriefDialog.open)) { clearRangeInputs(); syncControls(); }
    if (active && !staged) range.tick(delta, rangeInput());
    outcomeReveal.update(range.debrief, delta, active && !healthInspection.open && !mapInspection.open && !rangeDrawerInspection.open && !debriefDialog.open);
    const recoveryElapsed = outcomeReveal.recoveryElapsed;
    scene.updateRange(range, active ? delta : 0, reducedMotion, rangeView, recoveryElapsed);
    audio.update(range.audioState, { powertrain: range.powertrain, inside: rangeView === 'inside', training: range.mission.phase === 'training',
      practiceCompleted: range.shotsFired > 0 || range.targets.some(target => target.kind === 'training' && target.destroyedAt !== null),
      contact: range.mission.departureCrossed && range.mission.contacts.some(contact => !contact.neutralized && Math.hypot(contact.x - range.position.x, contact.z - range.position.z) <= 130),
      health: range.health.phase, terminal: range.missionEnded, breakdown: range.health.phase === 'broken',
      faultInspection: inspectionAudioContinues(), transportPaused: debriefDialog.open, departureCrossed: range.mission.departureCrossed && !range.dismounting,
      dismountPhase: range.dismount.phase, dismountElapsed: range.dismount.elapsed,
      recoveryReveal: recoveryElapsed !== null, staging: missionStaging.active, stagingTime: missionStaging.elapsed }, delta);
    if (range.health.alertSerial !== lastHealthAlertSerial) {
      if (range.health.alertSerial > lastHealthAlertSerial && range.health.phase !== 'broken') audio.healthAlert(range.health.phase === 'critical' ? 'critical' : 'warning');
      lastHealthAlertSerial = range.health.alertSerial;
      rangeFeedback = `[Health alert tone] ${range.health.phase === 'critical' ? 'Severe vehicle fault.' : range.health.phase === 'broken' ? 'Vehicle breakdown. Stopped; repair required.' : 'Vehicle fault warning.'} Open MFoCS to inspect or reduce pace.`;
      rangeFeedbackUntil = range.time + 7;
      updateRangeLive();
    }
    if (range.shotsFired > lastRangeShots) {
      audio.fireRangeShot();
      const hitId = range.shots.at(-1)?.hitTargetId;
      const hitContact = range.mission.contacts.find(contact => contact.id === hitId);
      const hitBoard = range.targets.find(target => target.id === hitId && target.kind === 'training');
      rangeFeedback = `[Simulated .50 cal report] ${range.hits > lastRangeHits ? hitContact ? `Fictional enemy ${hitContact.kind === 'vehicle' ? 'gun truck' : 'troop'} ${hitContact.neutralized ? 'neutralized.' : `hit; ${hitContact.health} / ${hitContact.maxHealth} game health remains.`} ${range.mission.remainingContacts} contacts remaining.` : hitBoard ? 'Practice board shattered. It stays broken for this run.' : 'Game target hit.' : 'Round fired. Orange ring indicates weapon direction.'}`;

      rangeFeedbackUntil = range.time + 2.5;
      lastRangeShots = range.shotsFired; lastRangeHits = range.hits;
    }
    for (const target of range.targets) {
      if (target.kind !== 'training' || target.destroyedAt === null || target.destroyedAt <= 0 || observedBrokenBoards.has(target.id)) continue;
      observedBrokenBoards.add(target.id);
      if (target.destroyedBy === 'vehicle') {
        rangeEventFeedback = 'Practice board crushed under the vehicle. It stays broken for this run.';
        rangeEventFeedbackUntil = range.time + 3;
      }
    }
    if (range.missionEnded) clearRangeInputs();
    rangeUiClock += delta;
    if (rangeUiClock >= .08) { rangeUiClock = 0; updateRangeLive(); }
  } else {
    if (active && mode === 'mission') sim.tick(delta);
    if (mode === 'mission') scene.update(sim, active ? delta : 0, reducedMotion, guidedFaults(), audio.missionCallsign);
    if (mode === 'home' || mode === 'briefing') audio.updateHome(delta, audioPaused());
    else audio.update(sim, { inside: insideView, faultInspection: inspectionAudioContinues(), transportPaused: evidenceOpen }, delta);
    if (mode === 'briefing') {
      if (missionBriefing.update(delta, active)) { audio.briefingTick(); updateBriefing(); }
    } else {
      if (lastPhase !== sim.phase) render();
      updateLive();
    }
  }
  if (audio.soundState !== lastSoundState || audio.musicPreparing !== lastMusicPreparing) syncSoundControls();
  requestAnimationFrame(frame);
}
render();
requestAnimationFrame(frame);
