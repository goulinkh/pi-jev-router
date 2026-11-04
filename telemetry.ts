import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

type RecordData = Record<string, unknown>;
export type DecisionEntry = { type: string; customType?: string; data?: unknown; timestamp?: string; id?: string };
const record = (value: unknown): value is RecordData => typeof value === "object" && value !== null && !Array.isArray(value);
export function decisions(entries: readonly DecisionEntry[], sessionId?: string) {
	return entries.filter((e) => e.type === "custom" && (e.customType === "jev-route" || e.customType === "jev-monitor") && record(e.data) && (!sessionId || e.data.sessionId === sessionId));
}

export function summarize(entries: readonly DecisionEntry[]) {
	const rows = decisions(entries);
	const counts = new Map<string, number>();
	let requests = 0, fallbacks = 0, input = 0, output = 0, cost = 0, incomplete = 0;
	const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
	for (const row of rows) {
		const d = row.data as RecordData;
		const key = `${row.customType === "jev-monitor" ? d.routingPolicy === "turn-routing-v1" ? "turn selection (pending auth)" : "monitor recommendation" : "initial selection"}: ${d.target} (${d.thinking})`;
		counts.set(key, (counts.get(key) ?? 0) + 1);
		requests += number(d.evaluationRequests); input += number(d.inputTokens); output += number(d.outputTokens); cost += number(d.estimatedCost);
		if (d.source === "fallback") fallbacks++;
		if (d.usageIncomplete || d.evaluationRequests === undefined) incomplete++;
	}
	return `${rows.length} routing decisions (${rows.filter((e) => e.customType === "jev-route").length} initial, ${rows.filter((e) => e.customType === "jev-monitor").length} monitoring)\n${requests} classifier requests, ${fallbacks} fallbacks; ${input} input / ${output} output tokens; estimated Jev $${cost.toFixed(6)}${incomplete ? `; ${incomplete} records with incomplete/legacy usage` : ""}\n${[...counts].sort(([a], [b]) => a.localeCompare(b)).map(([key, n]) => `${n} × ${key}`).join("\n")}\nLegacy monitoring only recommends forks; turn-routing-v1 decisions can switch after authentication. Inspect jev-pin outcome=switch-applied for committed transitions. Counts are decisions, not generation requests. Costs exclude skill/adaptive evaluations and may omit failed-call usage.`;
}

export function history(entries: readonly DecisionEntry[], limit: number) {
	return decisions(entries).slice(-limit).map((e) => {
		const d = e.data as RecordData;
		return `${d.timestamp ?? e.timestamp ?? "unknown time"} ${e.customType}: ${d.target} (${d.thinking}), ${d.source}\nReason: ${d.reason ?? "Legacy record: no explanation saved"}\n${JSON.stringify(d, null, 2)}`;
	}).join("\n\n") || "No routing decisions recorded.";
}

// Read only local session metadata. Never export prompts, provider errors, or credentials.
export async function allDecisions(root: string) {
	const entries: DecisionEntry[] = [];
	const seen = new Set<string>();
	let skipped = 0;
	async function walk(dir: string): Promise<void> {
		for (const item of await readdir(dir, { withFileTypes: true })) {
			const path = join(dir, item.name);
			if (item.isDirectory()) { await walk(path); continue; }
			if (!item.isFile() || !item.name.endsWith(".jsonl")) continue;
			try {
				for (const line of (await readFile(path, "utf8")).split("\n")) {
					if (!line.trim()) continue;
					try {
						const e = JSON.parse(line);
						if (!record(e) || !decisions([e as DecisionEntry]).length) continue;
						const d = e.data as RecordData;
						// Forked/copied histories retain entry IDs. Count each original event once.
						const key = typeof d.decisionId === "string" ? d.decisionId : JSON.stringify([e.id, e.timestamp, e.customType, d]);
						if (!seen.has(key)) { seen.add(key); entries.push(e as DecisionEntry); }
					} catch { skipped++; }
				}
			} catch { skipped++; }
		}
	}
	try { await walk(root); } catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	return { entries, skipped };
}
