# Smartphone UI update

## Scope

Improve the existing Fjordsprint phone experience without changing tracks, physics, scoring, required nickname entry, or 48-hour local score retention. No new runtime dependencies or backend.

## Acceptance criteria

- Start is visible without horizontal scrolling on narrow portrait screens.
- Secondary menu actions remain available behind an accessible menu button.
- Driving controls remain reachable with two thumbs; rotation and interrupted touches release held inputs.
- Questions and explanations are readable, scrollable, and operable without relying on color alone.
- Nickname entry remains usable when the on-screen keyboard reduces the viewport.
- Results prioritize the score and replay actions; detailed statistics and the leaderboard remain available.
- Portrait, landscape, small-screen, keyboard, and desktop regression checks are run before release.

## Validation

Implementation and validation are in progress on this branch. Automated browser checks do not replace testing on physical iOS and Android phones.
