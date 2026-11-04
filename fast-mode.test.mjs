import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Use the installed Pi host, just as extension loading does; no duplicate Pi SDK.
const host = process.env.PI_HOST_ROOT ?? join(execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim(), "@earendil-works/pi-coding-agent");
const { createJiti } = await import(pathToFileURL(join(host, "node_modules/jiti/lib/jiti.mjs")));
const root = mkdtempSync(join(tmpdir(), "jev-fast-test-"));
const previous = process.env.PI_CODING_AGENT_DIR;
process.env.PI_CODING_AGENT_DIR = root;
try {
	mkdirSync(join(root, "extensions"));
	writeFileSync(join(root, "extensions/fast-mode.json"), JSON.stringify({ enabled: true, models: ["openai-codex/gpt-6.1-sol"] }));
	const jiti = createJiti(import.meta.url, { alias: {
		"@earendil-works/pi-coding-agent": join(host, "dist/index.js"),
		"@earendil-works/pi-ai": join(host, "node_modules/@earendil-works/pi-ai/dist/index.js"),
	} });
	const { default: bridge } = await jiti.import(new URL("./fast-mode.ts", import.meta.url).pathname);
	const { default: router } = await jiti.import(new URL("./index.ts", import.meta.url).pathname);
	assert.equal(typeof router, "function");
	const events = {}, commands = {};
	bridge({ on: (name, fn) => { events[name] = fn; }, registerFlag() {}, registerCommand: (name, cmd) => { commands[name] = cmd; }, getFlag: () => false });
	const sol = { provider: "openai-codex", id: "gpt-6.1-sol", api: "openai-codex-responses" };
	const astra = { ...sol, id: "gpt-6-astra" };
	const ctx = { hasUI: false, model: { provider: "auto", id: "gpt-auto" }, modelRegistry: { find: (_provider, id) => id === sol.id ? sol : id === astra.id ? astra : undefined }, ui: { notify() {} } };
	await events.session_start({}, ctx);
	const request = (payload, context = ctx) => events.before_provider_request({ payload }, context);
	assert.equal(request({ model: sol.id }).service_tier, "priority");
	assert.equal(request({ model: sol.id, service_tier: "flex" }), undefined);
	assert.equal(request({ model: astra.id }), undefined); // not allowlisted
	assert.equal(request({ model: "typesafe/jev-1.14" }), undefined);
	await commands.fast.handler("off", ctx);
	assert.equal(request({ model: sol.id }), undefined);
	await commands.fast.handler("on", ctx);
	assert.equal(request({ model: sol.id }).service_tier, "priority");
	assert.equal(request({ model: sol.id }, { ...ctx, model: sol }).service_tier, "priority");
	console.log("Fast-mode bridge: priority on, off, re-enabled, allowlist, explicit tier, classifier isolation and direct-model tests passed; router import passed.");
} finally {
	if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
	else process.env.PI_CODING_AGENT_DIR = previous;
	rmSync(root, { recursive: true, force: true });
}
