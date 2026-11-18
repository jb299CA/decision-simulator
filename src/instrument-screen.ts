import * as THREE from 'three';
import type { FaultSeverity, VehicleFault } from './mission-contract.ts';
import { systemHealthScore } from './health-score.ts';

type InstrumentRow = { label: string; value: number | null; unit: string; severity: FaultSeverity; history: number[] };
export type InstrumentInput = {
  mode: 'range' | 'guided'; time: number; engine: boolean; speed: number; rpm: number; load: number;
  callsign?: string; integrity: number; status: string; faults?: readonly VehicleFault[];
  voltage?: number; voltageHistory?: readonly number[]; alert?: boolean;
};
export type InstrumentSnapshot = {
  mode: InstrumentInput['mode']; time: number; engine: boolean; speed: number; rpm: number; load: number;
  callsign: string; integrity: number; status: string; rows: InstrumentRow[]; systems: ReturnType<typeof systemHealthScore>;
};
const finite = (n: number, fallback = 0) => Number.isFinite(n) ? n : fallback;
const bounded = (n: number, min: number, max: number) => Math.max(min, Math.min(max, finite(n)));
const severity = (s: FaultSeverity): FaultSeverity => ['normal', 'moderate', 'severe', 'failed'].includes(s) ? s : 'normal';

/** Preserve synthetic relative readings without inventing equipment diagnostic limits. */
export function instrumentSnapshot(input: InstrumentInput): InstrumentSnapshot {
  return {
    mode: input.mode, time: Math.floor(Math.max(0, finite(input.time)) * 5 + 1e-7) / 5,
    engine: input.engine, speed: input.engine ? Math.abs(finite(input.speed)) : 0,
    rpm: input.engine ? Math.max(0, finite(input.rpm)) : 0, load: input.engine ? bounded(input.load, 0, 1) * 100 : 0,
    integrity: bounded(input.integrity, 0, 100), status: input.status, callsign: input.callsign ?? 'Vehicle', systems: systemHealthScore(input.faults ?? []),
    rows: input.mode === 'range' ? (input.faults ?? []).map(fault => ({
      label: fault.severity === 'normal' ? fault.component : fault.label, value: Number.isFinite(fault.reading) ? fault.reading : null, unit: '% start', severity: severity(fault.severity),
      history: fault.observations.map(o => o.value).filter(Number.isFinite).slice(-48),
    })) : [{ label: 'Charging bus', value: Number.isFinite(input.voltage) ? input.voltage! : null, unit: 'V',
      severity: severity(input.faults?.find(fault => fault.id === 'charging')?.severity ?? (input.alert ? 'moderate' : 'normal')), history: (input.voltageHistory ?? []).filter(Number.isFinite).slice(-48) }],
  };
}

/** One persistent texture, repainted using simulated time at a maximum five regular updates/sec. */
export class InstrumentScreen {
  readonly texture: THREE.CanvasTexture;
  private readonly canvas = document.createElement('canvas');
  private readonly context: CanvasRenderingContext2D;
  private key = '';
  private logo: HTMLImageElement | null = null;
  private lastSnapshot: InstrumentSnapshot | null = null;
  private disposed = false;
  constructor() {
    this.canvas.width = 1280; this.canvas.height = 768;
    this.context = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas); this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 2;
    if (typeof Image !== 'undefined') {
      const logo = new Image();
      this.logo = logo;
      logo.onload = () => {
        // Artwork may arrive while paused. Repaint the stored snapshot without
        // advancing telemetry, and keep a powered-off screen completely dark.
        if (this.disposed || !this.lastSnapshot) return;
        this.draw(this.lastSnapshot); this.texture.needsUpdate = true;
      };
      logo.src = '/branding/shift5-logo.svg';
    }
  }
  update(input: InstrumentInput): boolean {
    if (this.disposed) return false;
    const snapshot = instrumentSnapshot(input);
    // Discrete crew/state changes repaint immediately, including while paused;
    // continuous telemetry is sampled only at the simulated-time bucket.
    const key = `${snapshot.mode}/${snapshot.time}/${snapshot.engine}/${snapshot.status}/${snapshot.systems.level}/${snapshot.systems.available}/${snapshot.rows.map(row => row.severity).join('/')}`;
    if (key === this.key) return false;
    this.key = key; this.lastSnapshot = snapshot; this.draw(snapshot); this.texture.needsUpdate = true; return true;
  }
  private draw(s: InstrumentSnapshot) {
    const c = this.context, w = this.canvas.width, h = this.canvas.height;
    c.fillStyle = '#11181c'; c.fillRect(0, 0, w, h);
    if (!s.engine) return;
    const white = '#f4f7f9', dim = '#a9bac4', orange = '#ff8a26';
    const tones: Record<FaultSeverity, string> = { normal: '#84d9bf', moderate: orange, severe: '#ff654b', failed: '#ff4856' };
    const captions: Record<FaultSeverity, string> = { normal: 'NORMAL', moderate: 'WARNING', severe: 'SEVERE', failed: 'FAILED' };
    const symbols: Record<FaultSeverity, string> = { normal: '?', moderate: '?', severe: '!', failed: '?' };
    const label = (text: string, x: number, y: number, size = 22, color = dim, bold = false) => {
      c.fillStyle = color; c.font = `${bold ? '700' : '500'} ${size}px "Arial",sans-serif`; c.fillText(text, x, y);
    };
    // A fixed instrument grid keeps physical controls and readings visually stable.
    c.fillStyle = '#202c33'; c.fillRect(0, 0, w, 68);
    label('MFoCS', 28, 45, 32, white, true); label(`${s.callsign.toUpperCase()} / SYSTEMS`, 214, 43, 23, white, true);
    c.textAlign = 'right';
    label(`SIM ${Math.floor(s.time / 60).toString().padStart(2, '0')}:${Math.floor(s.time % 60).toString().padStart(2, '0')}  ?  ENGINE ON`, 1246, 42, 21, dim);
    c.textAlign = 'left';
    const metrics = [
      { label: 'SPEED', value: s.speed.toFixed(1), unit: s.mode === 'range' ? 'mph' : 'units/s', progress: null },
      { label: 'ENGINE', value: Math.round(s.rpm).toString(), unit: 'RPM', progress: null },
      { label: 'LOAD', value: Math.round(s.load).toString(), unit: '%', progress: s.load / 100 },
    ];
    metrics.forEach((metric, i) => {
      const x = 28 + i * 282;
      c.fillStyle = '#1b272e'; c.fillRect(x, 88, 264, 170);
      label(metric.label, x + 18, 119, 21, dim, true);
      label(metric.value, x + 16, 186, 58, white, true); label(metric.unit, x + 19, 217, 20);
      c.fillStyle = '#34454f'; c.fillRect(x + 18, 236, 228, 4);
      if (metric.progress !== null) { c.fillStyle = '#a5bbc6'; c.fillRect(x + 18, 236, 228 * metric.progress, 4); }
    });
    const systems = s.systems, ringColor = systems.available ? tones[systems.level] : dim;
    c.fillStyle = '#1b272e'; c.fillRect(874, 88, 378, 170);
    label('SYSTEMS', 894, 119, 21, dim, true);
    // The health number comes only from fault state; combat hull integrity remains separate.
    c.lineWidth = 9; c.strokeStyle = '#34454f'; c.beginPath(); c.arc(1170, 169, 56, 0, Math.PI * 2); c.stroke();
    if (systems.available) {
      c.strokeStyle = ringColor; c.beginPath(); c.arc(1170, 169, 56, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * systems.score / 100); c.stroke();
    }
    c.textAlign = 'center'; label(systems.available ? String(systems.score) : '?', 1170, 181, 39, white, true); label('/ 100', 1170, 208, 16, dim); c.textAlign = 'left';
    label(systems.label.toUpperCase(), 894, 159, 24, ringColor, true);
    label(systems.available ? `${systems.activeFaults} active fault${systems.activeFaults === 1 ? '' : 's'}` : 'Awaiting fault data', 894, 191, 20, dim);
    label(`HULL  ${Math.round(s.integrity)}%`, 894, 235, 19, white);
    label('COMPONENT / CONDITION', 34, 293, 19, dim, true);
    label(s.mode === 'range' ? 'READING / % START' : 'READING / VOLTS', 510, 293, 19, dim, true);
    label('RECENT SAMPLES', 868, 293, 19, dim, true);
    const rows = s.rows.slice(0, 3);
    rows.forEach((row, index) => {
      const y = 311 + index * 103, color = tones[row.severity];
      c.fillStyle = index % 2 ? '#1c2930' : '#18242b'; c.fillRect(28, y, 1224, 96);
      c.fillStyle = color; c.fillRect(28, y, 5, 96);
      label(symbols[row.severity], 48, y + 39, 27, color, true);
      label(row.label, 83, y + 37, 25, white, true);
      label(captions[row.severity], 84, y + 71, 18, color, true);
      label(row.value === null ? '?' : row.value.toFixed(s.mode === 'guided' ? 2 : 1), 510, y + 47, 37, white, true);
      label(row.unit, 660, y + 46, 20, dim);
      this.sparkline(row.history, 866, y + 15, 353, 52, color);
      label('EARLIER', 866, y + 85, 13, dim); c.textAlign = 'right'; label('NOW', 1219, y + 85, 13, dim); c.textAlign = 'left';
    });
    if (!rows.length) label('Awaiting component observations', 48, 367, 26, dim);
    if (s.mode === 'guided') {
      label('SOURCE  ?  EXISTING VEHICLE / CREW DISPLAY ACCESS', 36, 455, 19, dim, true);
      label(s.rows[0]?.severity === 'normal' ? 'Observe voltage with load and engine state.' : 'Charging trend changed. Inspect evidence before deciding.', 36, 505, 26, s.rows[0]?.severity === 'normal' ? white : orange);
      label('Voltage alone does not confirm an alternator fault.', 36, 550, 23, dim);
      label(systems.available ? 'SYSTEMS score summarizes simulated component condition.' : 'SYSTEMS score requires component fault data.', 36, 590, 21, dim);
    }
    c.fillStyle = '#283942'; c.fillRect(28, 641, 1224, 55);
    // Bound long crew messages to one panel row, preserving full text in the expanded UI.
    label(s.status.length > 89 ? `${s.status.slice(0, 86)}?` : s.status, 44, 677, 23, rows.some(row => row.severity !== 'normal') ? orange : white, true);
    if (this.logo?.complete && this.logo.naturalWidth > 0) c.drawImage(this.logo, 1097, 712, 150, 36);
    label('SYNTHETIC TRAINING DATA  ?  No live vehicle connection', 32, 737, 18, dim);
  }

  private sparkline(values: number[], x: number, y: number, width: number, height: number, color: string) {
    const c = this.context;
    c.strokeStyle = '#3b484f'; c.lineWidth = 1; c.beginPath(); c.moveTo(x, y + height); c.lineTo(x + width, y + height); c.stroke();
    if (!values.length) return;
    const min = Math.min(...values), max = Math.max(...values), span = Math.max(.01, max - min), pad = span * .15;
    c.strokeStyle = color; c.lineWidth = 4; c.beginPath();
    values.forEach((value, index) => {
      const px = x + (values.length === 1 ? width / 2 : index / (values.length - 1) * width), py = y + height - (value - min + pad) / (span + 2 * pad) * height;
      if (!index) c.moveTo(px, py); else c.lineTo(px, py);
    });
    c.stroke();
  }
  dispose() {
    this.disposed = true;
    if (this.logo) { this.logo.onload = null; this.logo.onerror = null; }
    this.logo = null; this.lastSnapshot = null;
    this.texture.dispose();
  }
}
