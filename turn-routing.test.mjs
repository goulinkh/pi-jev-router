import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const host = process.env.PI_HOST_ROOT ?? join(execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim(), "@earendil-works/pi-coding-agent");
const { createJiti } = await import(pathToFileURL(join(host, "node_modules/jiti/lib/jiti.mjs")));
const root = mkdtempSync(join(tmpdir(), "jev-turn-test-"));
const previous = process.env.PI_CODING_AGENT_DIR;
process.env.PI_CODING_AGENT_DIR = root;
try {
 const jiti = createJiti(import.meta.url, { alias: {
  "@earendil-works/pi-coding-agent": join(host, "dist/index.js"),
  "@earendil-works/pi-ai": join(host, "node_modules/@earendil-works/pi-ai/dist/index.js"),
 } });
 const { default: router } = await jiti.import(new URL("./index.ts", import.meta.url).pathname);
 const events = {}, entries = []; let registered, desired = "gpt-6.1-sol", evaluations = 0, authOK = true, failClassifier = false;
 const models = ["gpt-6.1-sol", "gpt-6-astra"].map(id => ({ provider: "openai-codex", id, api: "openai-codex-responses", reasoning: true, input: ["text"], contextWindow: 128000, maxTokens: 16384, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }));
 router({ on: (name, fn) => { events[name] = fn; }, registerProvider: (_name, config) => { registered = config; }, registerCommand() {}, appendEntry: (customType, data) => entries.push({ type: "custom", customType, data }) });
 const ctx = { model: { provider: "auto", id: "gpt-auto", contextWindow: 128000, maxTokens: 16384 }, ui: { setStatus() {}, notify() {} }, sessionManager: { getSessionId: () => "test", getEntries: () => entries, getBranch: () => entries }, modelRegistry: {
  getAvailable: () => models, find: () => undefined, findOfType: () => ({}), getProviderAuth: async () => ({ auth: { apiKey: "test" } }),
  classify: async (_m, context) => { evaluations++; if (failClassifier) throw Error("offline"); const criteria = context.questions.route.criteria; const choice = Object.keys(criteria).find(k => JSON.parse(criteria[k]).model === `openai-codex/${desired}`); assert.ok(choice); return { stopReason: "stop", answers: { route: { type: "choice", choice, probabilities: { [choice]: 1 } } }, usage: { input: 1, output: 1 } }; },
  getApiKeyAndHeaders: async () => ({ ok: authOK, apiKey: "test" }),
  getProvider: () => ({ streamSimple: async function* (model, context, options) { await options.onPayload({ model: model.id }, model); yield { type: "done", reason: "stop", message: { role: "assistant", content: [], model: model.id, provider: model.provider, api: model.api, stopReason: "stop", timestamp: Date.now(), usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } } }; } }),
 } };
 await events.session_start({}, ctx);
 const run = async turn => { const stream = registered.streamSimple(ctx.model, { messages: [{ role: "user", content: `turn ${turn}`, timestamp: turn }] }, { sessionId: "test" }); const output = []; for await (const e of stream) output.push(e); return output; };
 const pin = () => entries.filter(e => e.customType === "jev-pin").at(-1)?.data;
 assert.equal((await run(1)).at(-1).type, "done"); assert.equal(pin().target, "openai-codex/gpt-6.1-sol");
 desired = "gpt-6-astra"; await run(1); assert.equal(evaluations, 1); // tool continuation stays Sol
 await run(2); assert.equal(pin().target, "openai-codex/gpt-6-astra"); assert.equal(pin().outcome, "switch-applied");
 desired = "gpt-6.1-sol"; await run(3); assert.equal(pin().target, "openai-codex/gpt-6.1-sol");
 desired = "gpt-6-astra"; authOK = false; assert.equal((await run(4)).at(-1).type, "error"); assert.equal(pin().target, "openai-codex/gpt-6.1-sol");
 await events.session_start({}, ctx); // pending/failed auth must not mark the turn committed on resume
 authOK = true; await run(4); assert.equal(pin().target, "openai-codex/gpt-6-astra");
 await events.session_start({}, ctx); const n = evaluations; await run(4); assert.equal(evaluations, n); // resume retains committed turn
 failClassifier = true; await run(5); assert.equal(pin().target, "openai-codex/gpt-6-astra");
 assert.ok(entries.filter(e => ["jev-route", "jev-monitor", "jev-generation", "jev-pin"].includes(e.customType)).every(e => e.data.routingPolicy === "turn-routing-v1"));
 console.log("Turn routing: escalation, downgrade, stable continuations, auth retry, resume, classifier fallback, policy markers passed.");
} finally { if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous; rmSync(root, { recursive: true, force: true }); }
