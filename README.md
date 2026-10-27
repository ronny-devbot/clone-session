# clone-session

Adds two tools to pi (works in TUI and pi-web sessions):

- `clone_session(prompt)` — clone the current session into a new **sibling** session
  and start it on a different task. Independent: its results stay in its own session.
- `clone_subsession(prompt)` — the same, but the clone becomes a **tracked child
  subsession** of the current session (parallel to `spawn_subsession`, but with full
  history): its completion reports back, and `list/check/read_subsession` and
  `yield_to_subsessions` work on it.

Both clone the session file cut after the last user message, so the clone has the
full history but not the in-progress turn (a mid-turn clone would re-run that work).
Because the clone shares the entire conversation prefix, its first model call can hit
provider prefix/KV caches — cheaper and faster cold start than a fresh session.

## Install

```
pi install git:github.com/ronny-devbot/clone-session
```

## Usage

```
clone_session({ prompt: "investigate the flaky checksum test" })
→ "Cloned this session as <uuid>; it is now working on your prompt."
```

## Notes

- **Stale extension cache in the pi-web daemon.** The daemon keeps jiti's
  module cache in-process: after you edit this extension, pi-web sessions keep
  running the *old* code until the daemon restarts (even `/reload` re-imports
  from the cache). A fresh `pi` CLI process always loads the current code.
  To activate an edit without a full restart, rename this directory once.
- `clone_subsession` appends pi-web's subsession child-link entry
  (`customType: "pi-web.subsession.spawned"`, same format pi-web itself persists)
  to the clone, so the daemon tracks it as a child of the current session.
  This is a pi-web feature: in a plain TUI the link entry is harmless but nothing
  consumes it.
- The daemon endpoint resolves from `$PI_WEB_SESSIOND_SOCKET`,
  `<data-dir>/sessiond-owner.json` (`endpoint`), `~/.pi-web/sessiond.sock`,
  and as a last resort the web proxy at `127.0.0.1:8504` (`/api/...`).

## Self-test

```
node test/selftest.ts
```
