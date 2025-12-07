# Changelog

All notable changes to TaskTrack will be documented in this file. This project adheres to a manual release process; update both this file and `assets/changelog.json` when shipping new versions so the in-app update summary stays accurate.

## [0.0.2] - 2025-12-07
- Let tasks declare which pomodoro round they belong to, with quick actions to move them forward and round labels in the UI.
- Prompt for confirmation when a focus round ends and automatically carry unfinished work to the next round instead of silently logging it.
- Surface the current round beside the active task and timer so the flow of focus → break cycles stays clear.

## [0.0.1] - 2025-12-07
- Add a Today view with task planning, active task selection, and a pomodoro timer that plays a chime when focus ends.
- Persist tasks by date to power daily summaries and a This Week overview of planned vs. completed pomodoros.
- Namespace localStorage keys for this app and refresh the stopwatch-inspired logo.
- Rename the app to TaskTrack across the interface and install metadata.
- Simplify task creation by removing manual entry for completed pomodoros (they now fill automatically).
- Clean up the Today tasks card to avoid duplicate headers.
- Add auto-advancing pomodoro cycles with configurable session lengths and long-break cadence in Settings.
- Allow selecting a notification tone (chime, bell, or beeps) from Settings; persists across sessions.
- Add a Preview button so users can hear the selected notification tone before saving.
- Restyled the tone selector/preview stack so the preview button sits beneath the select and matches control sizing.

## [0.0.0] - 2025-10-11
- Create base Progressive Web app.
