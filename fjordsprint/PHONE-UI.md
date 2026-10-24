# Smartphone UI update — 3.2.1 presentation layer

## Changes

- Compact phone start screen with the primary race button above the fold and secondary actions behind an accessible Meny disclosure.
- Larger touch targets, clearer labels, safer edge spacing and dedicated portrait/landscape positioning for steering, pedals, recovery, timer and prompts.
- Readable, scrollable question panels with stacked answers. Fortsett follows the explanation; explicit correct-answer text supplements color feedback. Keyboard focus moves into the question and remains within its controls.
- VisualViewport-aware nickname and settings dialogs that adapt to a reduced visible viewport without disabling browser pinch zoom.
- Score and career reward appear before detailed race statistics. The local leaderboard and statistics remain available in native details disclosures.
- Existing desktop presentation remains unchanged. All new CSS is scoped to the existing mobile UI and the phone enhancement's ready class.

## Preserved behavior

Tracks, handling, question content, knowledge rewards, score calculations, required nickname entry and exactly 48 hours of local score retention are unchanged. Mobile assistance and its untimed reading remain available. No backend, account, external asset or new runtime dependency is introduced.

The interface enhancement is in `dist/phone-ui.js` and `dist/phone.css`, loaded by `dist/index.html`. It attaches after the existing mobile controls are mounted. Reading feedback responds to DOM changes rather than waiting for the graphics loop. Test-only game-state hooks are injected by Playwright and are not shipped in dist.

## Validation

Run from this directory:

```sh
npm test
python3 tests/browser-smoke.py
python3 tests/mobile-polish.py
python3 tests/phone-ui.py
```

The existing GitHub Actions matrix runs desktop, phone portrait and phone landscape integration checks. The portrait smoke-test job additionally runs `phone-ui.py` once. That suite checks 320×568, 390×844, 430×932, 568×320, 844×390 and 768×1024 layouts, plus a 320×330 reduced-viewport nickname form. It checks hit targets, horizontal overflow, simultaneous touch input and cancellation, readable answer/continuation flow, result disclosures, preserved 48-hour storage and desktop isolation. Screenshots and JSON reports are included in workflow artifacts.

Automated Chromium/WebGL and touch emulation are not physical iOS/Android testing, Safari validation, a performance benchmark or a claim of full accessibility conformance. Verify on the actual event phones and browsers before the event.
