/**
 * clone-session — clone the current pi-web session and point the clone elsewhere.
 *
 * Registers the `clone_session` tool:
 *   1. Snapshots this session's file (ctx.sessionManager.getSessionFile()), cut after
 *      the last user message (a clone made mid-turn would otherwise inherit an
 *      in-progress turn and re-run it), rewrites the header id, and writes it next
 *      to the source. The pi-web session list is disk-backed, so the clone shows
 *      up in the UI with this session's full history.
 *   2. POSTs the given prompt to the session daemon for the clone, so the new
 *      session immediately starts doing something different.
 *
 * Daemon endpoint resolution:
 *   $PI_WEB_SESSIOND_SOCKET → <PI_WEB_DATA_DIR|~/.pi-web>/sessiond-owner.json (.endpoint)
 *   → ~/.pi-web/sessiond.sock → last resort: web server proxy at 127.0.0.1:8504.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { Type } from "typebox";
import { dropTrailingPartialLine, rewriteHeaderId, truncateAfterLastUserMessage, writeClone } from "./clone.ts";

interface DaemonEndpoint {
	/** unix socket path, or host:port for the daemon itself (no /api prefix) */
	daemon: boolean;
	socketPath?: string;
	host?: string;
	port?: number;
}

function resolveDaemonEndpoint(): DaemonEndpoint {
	const fromEnv = process.env.PI_WEB_SESSIOND_SOCKET;
	if (fromEnv) return parseEndpoint(fromEnv);
	const dataDir = process.env.PI_WEB_DATA_DIR || path.join(os.homedir(), ".pi-web");
	try {
		const owner = JSON.parse(readFileSync(path.join(dataDir, "sessiond-owner.json"), "utf8")) as {
			endpoint?: string;
		};
		if (typeof owner.endpoint === "string" && owner.endpoint) return parseEndpoint(owner.endpoint);
	} catch {
		/* fall through to the default socket path */
	}
	const sock = path.join(dataDir, "sessiond.sock");
	if (existsSync(sock)) return { daemon: true, socketPath: sock };
	// Last resort: the pi-web web server proxies /api/sessions/* to the daemon.
	return { daemon: false, host: "127.0.0.1", port: Number(process.env.PI_WEB_PORT) || 8504 };
}

function parseEndpoint(endpoint: string): DaemonEndpoint {
	if (endpoint.startsWith("/")) return { daemon: true, socketPath: endpoint };
	const m = endpoint.match(/^(.*):(\d+)$/);
	return m
		? { daemon: true, host: m[1] || "127.0.0.1", port: Number(m[2]) }
		: { daemon: false, host: endpoint, port: Number(process.env.PI_WEB_PORT) || 8504 };
}

function daemonPost(urlPath: string, body: string): Promise<{ status: number; body: string }> {
	return new Promise((resolve, reject) => {
		const ep = resolveDaemonEndpoint();
		const req = http.request(
			{
				...(ep.socketPath
					? { socketPath: ep.socketPath, host: "localhost" }
					: { host: ep.host, port: ep.port }),
				method: "POST",
				path: ep.daemon ? urlPath : `/api${urlPath}`,
				headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) },
			},
			(res) => {
				let data = "";
				res.on("data", (chunk) => (data += chunk));
				res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }));
			},
		);
		req.on("error", reject);
		req.write(body);
		req.end();
	});
}

const Params = Type.Object({
	prompt: Type.String({
		description:
			"First instruction for the cloned session: what it should do instead of this one. " +
			"It is sent as a normal user message; the clone keeps this session's full history.",
	}),
});

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "clone_session",
		label: "Clone session",
		description:
			"Clone the current pi-web session into a new sibling session (same history) and " +
			"start it with a prompt so it works on something else. Returns the new session id.",
		parameters: Params,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			// pi-web runs all sessions in one process, so PI_SESSION_FILE is not in
			// process.env — the session manager is the canonical source for the file.
			const source = ctx.sessionManager.getSessionFile();
			if (!source || !existsSync(source)) {
				throw new Error("no session file on this runtime — cannot clone");
			}
			// Snapshot while this turn is running: guard against a half-written last line,
			// then cut at the last user message so the clone doesn't inherit this in-progress turn.
			const content = truncateAfterLastUserMessage(dropTrailingPartialLine(readFileSync(source, "utf8")));
			const header = JSON.parse(content.split("\n")[0]) as { cwd?: string };
			const newId = randomUUID();
			const target = writeClone(source, newId, rewriteHeaderId(content, newId));
			// The daemon scopes every session op by cwd — it comes from the session header.
			const res = await daemonPost(
				`/sessions/${newId}/prompt`,
				JSON.stringify({ text: params.prompt, cwd: header.cwd }),
			);
			if (res.status < 200 || res.status >= 300) {
				return {
					content: [
						{
							type: "text",
							text: `Clone created as ${newId}, but the daemon rejected the prompt (HTTP ${res.status}: ${res.body}). Send it manually.`,
						},
					],
					details: { sessionId: newId, file: target, promptAccepted: false },
				};
			}
			return {
				content: [
					{ type: "text", text: `Cloned this session as ${newId}; it is now working on your prompt.` },
				],
				details: { sessionId: newId, file: target, promptAccepted: true },
			};
		},
	});
}
