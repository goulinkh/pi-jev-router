import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { allDecisions, decisions, history, summarize } from "./telemetry.ts";

const route = { type: "custom", customType: "jev-route", id: "one", timestamp: "2026-01-01", data: { sessionId: "s", target: "codex/sol", thinking: "low", source: "jev", evaluationRequests: 2, inputTokens: 100, outputTokens: 5, estimatedCost: 0.01, reason: "task-fit policy" } };
const monitor = { ...route, id: "two", customType: "jev-monitor", data: { ...route.data, target: "codex/astra", source: "fallback", usageIncomplete: true } };
test("counts decisions separately from requests and recommendations", () => {
	const text = summarize([route, monitor]);
	assert.match(text, /2 routing decisions \(1 initial, 1 monitoring\)/);
	assert.match(text, /4 classifier requests, 1 fallbacks/);
	assert.match(text, /1 × monitor recommendation: codex\/astra/);
	assert.match(text, /incomplete\/legacy usage/);
	assert.equal(decisions([route], "other").length, 0);
	assert.match(history([route, monitor], 1), /jev-monitor/);
	assert.doesNotMatch(history([route, monitor], 1), /jev-route/);
});
test("turn selections are not presented as legacy fork recommendations", () => {
 const text = summarize([{ ...monitor, data: { ...monitor.data, routingPolicy: "turn-routing-v1" } }]);
 assert.match(text, /turn selection \(pending auth\): codex\/astra/);
 assert.match(text, /switch-applied/);
});
test("legacy history and empty summary", () => {
	assert.match(history([{ ...route, data: { target: "old" } }], 10), /Legacy record/);
	assert.match(summarize([]), /0 routing decisions/);
});
test("scans nested session logs, skips bad lines, deduplicates inherited entries", async () => {
	const root = await mkdtemp(join(tmpdir(), "jev-audit-"));
	try {
		await mkdir(join(root, "project"));
		await writeFile(join(root, "a.jsonl"), JSON.stringify(route) + "\ninvalid\n");
		await writeFile(join(root, "project", "b.jsonl"), [route, monitor].map((e) => JSON.stringify(e)).join("\n"));
		const result = await allDecisions(root);
		assert.equal(result.entries.length, 2);
		assert.equal(result.skipped, 1);
		assert.equal((await allDecisions(join(root, "missing"))).entries.length, 0);
	} finally { await rm(root, { recursive: true, force: true }); }
});
