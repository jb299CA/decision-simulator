# Decision Simulator

A browser-local TypeScript/Vite/Three.js game and product demonstration. This engineering snapshot corresponds to release 39 and contains the application, tests and bundled runtime assets. It has no connection to a production deployment, hosting account or deployment credentials.

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
| Camera | 1 Hatch, 2 Inside, 3 Chase, 4 Top | Four camera buttons |
| Pause / resume | P | Pause / Resume |
| Mute | M | Sound control |
| Inspect health | Activate Open MFoCS | Open MFoCS |
| Expand map | Activate minimap | Tap map header |

Inside offers Day, illustrative Thermal and MFoCS display modes, plus Focus display / Back to seat. Mission instructions and secondary settings start collapsed; phone settings include the independent Music switch. The guided exercise uses its displayed phase actions and retains Space-to-pause. Space activates a keyboard-focused button when appropriate. Release, cancellation, focus loss, pause and dialogs clear held movement.

## Validation and limitations

This handoff was validated on November 18, 2026 with a fresh `npm ci`, **233 passing tests**, TypeScript checks and a production build. The install/audit reported no known dependency vulnerabilities. Gitleaks 8.30.1 reported no detected secrets in the handoff; a separate private-path/identifier scan also passed. These checks are useful safeguards, not a guarantee that every vulnerability or sensitive item has been detected.

Manual browser verification of the latest expanded-world visuals, inspection/display layouts and phone gestures remains incomplete. Physical-phone performance, audio activation and final listening/mix quality are unverified. Automated tests do not establish device usability. The production build emits a non-blocking JavaScript chunk-size warning. No service worker or supported offline reload is included.

Geometry and audio approximate an illustrative scenario; they do not validate real vehicle performance, maintenance thresholds, targeting or product integration. See `THIRD_PARTY_NOTICES.md` before distributing assets or using the branding. No new open-source license or branding rights grant accompanies this handoff.

`handoff-manifest.json` lists SHA-256 hashes and byte sizes for the transferred source and runtime files. Generated dependencies, build output, deployment configuration, private planning material and source artwork masters are excluded.

## Repository access

This repository is private. Cloud-Nook-Studio currently grants organization members read access by default; no additional engineering write access was assigned for this handoff. Repository owners control administration. When contributors are selected, use a named team with Write access and keep Admin access with the owners. Read access allows cloning and downloading the code.

`.github/CODEOWNERS` routes review requests to the owner; it does not enforce approvals. GitHub Actions execution is disabled, workflow-token defaults are read-only, Dependabot alerts are enabled, and private forking is disallowed by the organization. There are no deployment workflows or production credentials. Enforced private-repository branch protection requires a supported paid GitHub plan; see [GitHub protected branch availability](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).
