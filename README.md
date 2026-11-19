# Decision Simulator

A browser-local TypeScript/Vite/Three.js game and product demonstration. This engineering snapshot corresponds to release 51 and contains the application, tests and bundled runtime assets. It has no connection to a production deployment, hosting account or deployment credentials.

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

## Radio net

Each run selects a company/platoon identity: Aztec, Brave or Crazy Horse with 1-6, 2-6 or 3-6. The opening order is the matching company-to-platoon test-fire and LD clearance; later traffic follows Tomahawk 3 to company6, then matching platoon. Each prerecorded exchange includes its acknowledgment. Later background pairs vary without changing the player's displayed or debrief callsign.

Original dialogue follows the call order and proword distinctions in [Army ATP 6-02.53, Appendix I](https://rdl.train.army.mil/catalog-ws/view/100.ATSC/0C45D378-25E0-438E-8881-749EF51DE080-1452191121290/atp6_02x53.pdf). The game bundles 38 compact MP3s, using locally generated original voices. Strong male voices are the default, with female commander alternatives selected for20% of net transmissions. All numbers use ordinary pronunciations: three, five and nine. Callsign digits remain separate. Radio and intercom have distinct filtering; speech priority, transmit edges and cancellation follow simulation state. There is no runtime speech service.

## Validation and limitations

The initial handoff received a fresh `npm ci`. Release 46 passed **314 tests**, TypeScript checks and a production build on November 18, 2026. Every copied payload file matches the tested canonical source. The initial install/audit reported no known dependency vulnerabilities. Gitleaks 8.30.1 reported no detected secrets in the updated repository history; a separate private-path/identifier scan also passed for the initial handoff. These checks are useful safeguards, not a guarantee that every vulnerability or sensitive item has been detected.

Manual browser verification of the latest expanded-world visuals, inspection/display layouts and phone gestures remains incomplete. Physical-phone performance, audio activation and final listening/mix quality are unverified. Automated tests do not establish device usability. The production build emits a non-blocking JavaScript chunk-size warning. No service worker or supported offline reload is included.

Geometry and audio approximate an illustrative scenario; they do not validate real vehicle performance, maintenance thresholds, targeting or product integration. See `THIRD_PARTY_NOTICES.md` before distributing assets or using the branding. No new open-source license or branding rights grant accompanies this handoff.

`handoff-manifest.json` lists SHA-256 hashes and byte sizes for the transferred source and runtime files. Generated dependencies, build output, deployment configuration, private planning material and source artwork masters are excluded.

## Repository access

This repository is private and owned by [jb299CA](https://github.com/jb299CA/decision-simulator). It was transferred from Cloud-Nook-Studio on November 18, 2026, retaining its branches, commits and [pull request #1](https://github.com/jb299CA/decision-simulator/pull/1). Only jb299CA has access, as Admin; there are no pending collaborator invitations. Personal private-repository collaborators receive Write access, with no read-only collaborator role. The owner must select and authorize contributors before inviting them.

`.github/CODEOWNERS` provides advisory review routing; it does not enforce approvals. GitHub Actions execution is disabled, workflow-token defaults are read-only and Dependabot alerts are enabled. Private forking is enabled; GitHub rejected a request to disable it because that setting is configurable only for organization-owned private repositories. There are no deployment workflows or production credentials. Enforced private-repository branch protection is unavailable on the current plan; GitHub requires an upgrade to Pro for this personal private repository. See [GitHub protected branch availability](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).

## Release 40 audio and firing feedback

Supported browsers request an AudioSession playback category before explicit activation. Enable / retry sound in Menu or Home instructions can refresh stale output routing; it preserves a pre-existing pause. Unsupported or throwing API implementations keep ordinary Web Audio behavior. No microphone access or silent media loop is used. Actual iPhone Chrome output still needs device verification.

Gun reports are about 4.3 dB louder at normal cadence, with priority ducking, a bounded overlap budget and immediate buffered onset. Inside now receives brief physical-display firing recoil, including Focus display; reduced motion disables it and Chase/Top remain steady.

Release44 adds a180-second movement clock from first LD crossing. A cleared, stopped arrival settles the clock; Drop ramp remains explicit. Timeout has its own debrief reason and preserves maintenance findings. Radio-only static follows speech lifecycle. Public demo: https://decision-simulator.jon-d-bate.chatgpt.site .

Release45 hides the desktop driving panel by default behind Controls. Keyboard driving stays available; phones keep thumbstick/ACCEL/FIRE and collapse extra manual aim. The rear bumper carries the assigned company and platoon number, beneath the opening ramp. Inspection snapshots retain their original marking through immutable bounded texture caching. Browser visual review was blocked because Computer Use could not verify the browser URL.

Release46 restores a subtle phone-audible score with sparse midrange melody and soft percussion. Music on/off is visible in the header and respects master mute. Auto-away pauses expose visible Resume and accept a fresh scene tap or movement key; manual/dialog/terminal pause ownership is preserved. Held input is cleared, and delayed AudioContext suspension cannot override newer Play. Regression tests cover these state and audio races; live browser/device verification remains unavailable.

Release 47 adds a prominent Shift5 website link with the bundled logo and the tagline ?Real Data. Rapid Analysis. Right Decision.? TypeScript and production build passed; gameplay and audio are unchanged from the 314-test release 46 baseline. Live browser layout inspection remains outstanding.

Release 48: prominent mission countdown in all four camera views, with the three-minute clock starting at LD and freezing during pause/inspection. Original equipment-style two-pulse caution and three-pulse critical MFoCS cues respect mute/pause and do not queue. Guided telemetry alerts also trigger the caution cue. All 320 tests, TypeScript and production build pass. Browser/device listening verification remains outstanding.

Release 49: assisted, manual and center aim slew at a bounded game rate. Shots follow the actual barrel; lock indication waits for alignment. The six practice boards start about 92 game metres away and have at least 46 metres between them, leaving the road clear. All 325 tests and production build pass. Longer encounters can cause ignored severe faults to break down before arrival; early and late pace mitigation still permit completion. Browser play verification remains outstanding.

Release 50 removes the solid gameplay header background, border and blur across desktop and phone. Individual controls retain their backgrounds; the logo/text receive subtle contrast shadows. TypeScript and production build pass. Gameplay is unchanged from the 325-test release 49 baseline.

Release 51 regenerates all 38 dialogue clips with firmer male and female casting, shorter command sentences and controlled cadence. Female commanders remain about 20% of complete calls. Ordinary numbers replace phonetic variants throughout, and audio URLs use a new cache version. All 326 tests, TypeScript and production build pass; source/audio hashes agree and PCM has no clipped samples. Subjective listening and actual phone output remain unverified.
