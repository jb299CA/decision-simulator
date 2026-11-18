# Decision Simulator

A browser-local TypeScript/Vite/Three.js game and product demonstration. This engineering snapshot corresponds to release 41 and contains the application, tests and bundled runtime assets. It has no connection to a production deployment, hosting account or deployment credentials.

The two experiences are a fictional arcade dismount mission and a guided vehicle-health decision exercise. Telemetry, faults, handling, combat, thermal contrast and outcomes are synthetic illustrations. This is not actual Shift5 software, a verified vehicle integration, equipment training or a vehicle-control system. Inspecting a fault does not confirm an alternator diagnosis or repair the vehicle.

## Local development

Use Node.js 24 and npm. The lockfile pins dependencies; no backend, account or API key is needed.

```sh
npm ci
npm test
npm run check
npm run build
npm run dev
```

Open http://127.0.0.1:5174/ for development. After a build, run `npm run preview` and open http://127.0.0.1:4174/. Both servers bind to localhost and require their configured port to be free. Stop a server with Ctrl+C. The production output is `dist/`.

Use a branch and pull request for proposed changes as a collaboration convention. This snapshot does not establish or enforce repository branch protection, review requirements or deployment automation.

## Architecture

| Location | Responsibility |
| --- | --- |
| `src/main.ts`, `src/style.css` | Application lifecycle, interface, dialogs, controls and responsive presentation |
| `src/simulation.ts`, `src/range.ts`, `src/vehicle-health.ts` | Guided and arcade state, crew decisions, fault progression and run outcomes |
| `src/scene.ts`, camera/vehicle/environment modules | Three.js scene, procedural geometry, camera modes and bounded visual effects |
| `src/instrument-screen.ts`, display/inspection modules | Physical cabin display, synthetic readings, charts and inspection model |
| `src/input.ts`, `src/touch-stick.ts`, focus/lifecycle modules | Keyboard/touch composition, pause, focus and held-input cleanup |
| `src/audio.ts`, `src/music.ts`, `src/radio-script.ts` | Procedural audio/music, bundled fictional dialogue and captions |
| `tests/` | Node state, behavior, input, resource and rendering-helper tests |
| `public/` | Runtime logo, concept artwork, fictional voice clips and license notice |

The renderer and audio follow simulation state. Inspection and map dialogs pause the exercise. Terminal outcomes retain an immutable run debrief; a separate presentation clock can animate the breakdown reveal. Preferences use browser-local storage with an in-memory fallback.

## Controls

| Action | Keyboard | On-screen / phone |
| --- | --- | --- |
| Drive / reverse | W / S or up / down | Proportional thumb stick |
| Steer | A / D or left / right | Thumb stick left / right |
| Accelerate | Hold Space or W; release to coast | Hold ACCEL or push stick forward |
| Aim | Automatic lock; Q / E temporarily overrides | Automatic lock; aim slider overrides |
| Fire | Hold F | Hold FIRE |
| Unload squad | R | Drop ramp beside the cameras |
| Camera | 1 Hatch, 2 Inside, 3 Chase, 4 Top | Four camera buttons |
| Pause / resume | P | Pause / Resume |
| Mute | M | Sound control |
| Inspect health | Activate Open MFoCS | Open MFoCS |
| Expand map | Activate minimap | Tap map header |

Inside offers Day, illustrative Thermal and MFoCS display modes, plus Focus display / Back to seat. Mission instructions and secondary settings start collapsed; phone settings include the independent Music switch. The guided exercise uses its displayed phase actions and retains Space-to-pause. Space activates a keyboard-focused button when appropriate. Release, cancellation, focus loss, pause and dialogs clear held movement.

To complete delivery, clear the contacts, stop inside the marked dismount zone and select Drop ramp. The hinged rear ramp lowers and nine soldiers exit in sequence. Dropping the ramp anywhere outside the zone commits mission failure, then shows the squad exiting before the debrief. Accepted commands switch to Chase; driving and firing stop during unloading. Pause freezes the sequence, restart clears it, and reduced motion removes limb cycling. The squad and ramp use pooled procedural geometry. Recorded maintenance outcomes remain intact.

## Validation and limitations

The initial handoff received a fresh `npm ci`. This release 41 update, with the same pinned dependency lockfile, passed **261 tests**, TypeScript checks and a production build on November 18, 2026. Every copied payload file matches the tested canonical source. The initial install/audit reported no known dependency vulnerabilities. Gitleaks 8.30.1 reported no detected secrets in the updated repository history; a separate private-path/identifier scan also passed for the initial handoff. These checks are useful safeguards, not a guarantee that every vulnerability or sensitive item has been detected.

Manual browser verification of the latest expanded-world visuals, inspection/display layouts and phone gestures remains incomplete. Physical-phone performance, audio activation and final listening/mix quality are unverified. Automated tests do not establish device usability. The production build emits a non-blocking JavaScript chunk-size warning. No service worker or supported offline reload is included.

Geometry and audio approximate an illustrative scenario; they do not validate real vehicle performance, maintenance thresholds, targeting or product integration. See `THIRD_PARTY_NOTICES.md` before distributing assets or using the branding. No new open-source license or branding rights grant accompanies this handoff.

`handoff-manifest.json` lists SHA-256 hashes and byte sizes for the transferred source and runtime files. Generated dependencies, build output, deployment configuration, private planning material and source artwork masters are excluded.

## Repository access

This repository is private and owned by [jb299CA](https://github.com/jb299CA/decision-simulator). It was transferred from Cloud-Nook-Studio on November 18, 2026, retaining its branches, commits and [draft pull request #1](https://github.com/jb299CA/decision-simulator/pull/1). Only jb299CA has access, as Admin; there are no pending collaborator invitations. Personal private-repository collaborators receive Write access, with no read-only collaborator role. The owner must select and authorize contributors before inviting them.

`.github/CODEOWNERS` provides advisory review routing; it does not enforce approvals. GitHub Actions execution is disabled, workflow-token defaults are read-only and Dependabot alerts are enabled. Private forking is enabled; GitHub rejected a request to disable it because that setting is configurable only for organization-owned private repositories. There are no deployment workflows or production credentials. Enforced private-repository branch protection is unavailable on the current plan; GitHub requires an upgrade to Pro for this personal private repository. See [GitHub protected branch availability](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).

## Release 40 audio and firing feedback

Supported browsers request an AudioSession playback category before explicit activation. Enable / retry sound in Menu or Home instructions can refresh stale output routing; it preserves a pre-existing pause. Unsupported or throwing API implementations keep ordinary Web Audio behavior. No microphone access or silent media loop is used. Actual iPhone Chrome output still needs device verification.

Gun reports are about 4.3 dB louder at normal cadence, with priority ducking, a bounded overlap budget and immediate buffered onset. Inside now receives brief physical-display firing recoil, including Focus display; reduced motion disables it and Chase/Top remain steady.
