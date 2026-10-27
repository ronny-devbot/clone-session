// Self-test: node test/selftest.ts
import assert from "node:assert";
import { cloneFilenameFor, dropTrailingPartialLine, rewriteHeaderId, truncateAfterLastUserMessage } from "../clone.ts";

// header + one entry, as pi writes it
const file =
	'{"type":"session","version":3,"id":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","timestamp":"2026-01-01T00:00:00.000Z","cwd":"/tmp/x"}\n' +
	'{"type":"message","id":"m1","parentId":null,"timestamp":"2026-01-01T00:00:01.000Z","message":{"role":"user","content":"hi"}}\n';

const now = new Date("2026-06-06T06:06:06.006Z");

// filename convention matches pi's: 2026-10-24T14-19-10-454Z_<uuid>.jsonl
assert.strictEqual(
	cloneFilenameFor("new-id-1234", now),
	"2026-06-06T06-06-06-006Z_new-id-1234.jsonl",
);

// header rewrite: new id, new timestamp, rest of file untouched
const rewritten = rewriteHeaderId(file, "new-id-1234", now);
const [header, rest] = rewritten.split("\n");
assert.strictEqual(JSON.parse(header).id, "new-id-1234");
assert.strictEqual(JSON.parse(header).timestamp, "2026-06-06T06:06:06.006Z");
assert.strictEqual(rest, file.split("\n")[1]);

// rejects non-session files
assert.throws(() => rewriteHeaderId('{"nope":1}\n', "x"), /not a pi session file/);

// trailing half-written line is dropped
const partial = file + '{"type":"message","id":"m2","parentI';
assert.strictEqual(
	dropTrailingPartialLine(partial),
	file.replace(/\n$/, ""),
);

// complete trailing line is kept
assert.strictEqual(dropTrailingPartialLine(file), file.replace(/\n$/, ""));

// mid-turn tail (user message + in-progress assistant with tool call) cuts at the user message
const midTurn =
	file +
	'{"type":"message","id":"a1","parentId":"m1","timestamp":"2026-01-01T00:00:02.000Z","message":{"role":"assistant","content":[{"type":"toolCall","id":"t1","name":"bash"}]}}\n';
const cut = truncateAfterLastUserMessage(midTurn);
assert.strictEqual(cut, file.replace(/\n$/, ""));
// no user message yet: unchanged
assert.strictEqual(truncateAfterLastUserMessage('{"type":"session","id":"x"}\n'), '{"type":"session","id":"x"}\n');

console.log("clone-session self-test: OK");
