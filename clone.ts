// Pure helpers for cloning a pi session file (no runtime deps, testable with plain node).
import { randomUUID } from "node:crypto";
import { renameSync, writeFileSync } from "node:fs";

/** Filename in pi's convention: <ISO timestamp with : and . as ->_<uuid>.jsonl */
export function cloneFilenameFor(id: string, now = new Date()): string {
	const stamp = now.toISOString().replace(/:/g, "-").replace(".", "-");
	return `${stamp}_${id}.jsonl`;
}

/**
 * Rewrites the session header's id (and timestamp) to a new uuid.
 * Throws if the file is not a pi session file.
 */
export function rewriteHeaderId(fileContent: string, newId: string, now = new Date()): string {
	const nl = fileContent.indexOf("\n");
	const headerLine = nl === -1 ? fileContent : fileContent.slice(0, nl);
	let header: { type?: string; id?: unknown; timestamp?: unknown };
	try {
		header = JSON.parse(headerLine);
	} catch (err) {
		throw new Error(`not a pi session file (bad header line: ${(err as Error).message})`);
	}
	if (header.type !== "session" || typeof header.id !== "string") {
		throw new Error("not a pi session file (missing session header id)");
	}
	header.id = newId;
	header.timestamp = now.toISOString();
	return JSON.stringify(header) + fileContent.slice(nl);
}

/**
 * The source file is appended to concurrently; drop a trailing half-written
 * line so the clone stays valid JSONL.
 */
export function dropTrailingPartialLine(content: string): string {
	const lines = content.split("\n");
	while (lines.length > 1 && lines[lines.length - 1].trim() === "") lines.pop();
	const last = lines[lines.length - 1];
	if (last) {
		try {
			JSON.parse(last);
		} catch {
			lines.pop();
		}
	}
	return lines.join("\n");
}

/**
 * Cut the transcript after the last user message, so the clone ends at a clean
 * turn boundary. While the agent is running, the file tail is an in-progress
 * turn (assistant thinking / tool calls without results); resuming from there
 * makes the clone re-run that work. The last user message is kept — the daemon
 * treats it as context and runs only the prompt that gets posted to the clone.
 * A file with no user message yet is returned unchanged.
 */
export function truncateAfterLastUserMessage(content: string): string {
	const lines = content.split("\n");
	let cut = -1;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (!line) continue;
		try {
			const entry = JSON.parse(line) as { type?: string; message?: { role?: string } };
			if (entry.type === "message" && entry.message?.role === "user") cut = i;
		} catch {
			/* never cut on a malformed line */
		}
	}
	return cut === -1 ? content : lines.slice(0, cut + 1).join("\n");
}

/** Atomically write the cloned session file next to the source. */
export function writeClone(sourceFile: string, newId: string, content: string): string {
	const target = `${sourceFile.slice(0, sourceFile.lastIndexOf("/"))}/${cloneFilenameFor(newId)}`;
	const tmp = `${target}.tmp-${process.pid}-${randomUUID().slice(0, 8)}`;
	writeFileSync(tmp, content);
	renameSync(tmp, target); // atomic on the same filesystem
	return target;
}
