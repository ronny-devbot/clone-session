# clone-session

Adds the `clone_session` tool to pi (works in TUI and pi-web sessions):

## Install

```
pi install git:github.com/ronny-devbot/clone-session
```

- Snapshots the current session file, cut after the last user message, so the
  clone has the full history but does **not** inherit the in-progress turn.
- Writes it as a new-uuid file next to the source — the pi-web session list is
  disk-backed, so the clone appears in the UI immediately.
- POSTs your prompt to the pi-web session daemon for the clone, so the new
  session starts working on something different right away.

```
clone_session({ prompt: "Investigate the flaky checksum test in detail" })
→ "Cloned this session as <uuid>; it is now working on your prompt."
```

## Notes

- **Stale extension cache in the pi-web daemon.** The daemon keeps jiti's
  module cache in-process: after you edit this extension, pi-web sessions keep
  running the *old* code until the daemon restarts (even `/reload` re-imports
  from the cache). A fresh `pi` CLI process always loads the current code.
  To activate an edit without a full restart, rename this directory once.
- The daemon endpoint resolves from `$PI_WEB_SESSIOND_SOCKET`,
  `<data-dir>/sessiond-owner.json` (`endpoint`), `~/.pi-web/sessiond.sock`,
  and as a last resort the web proxy at `127.0.0.1:8504` (`/api/...`).

## Self-test

```
node test/selftest.ts
```
