import fastMode from "@pi-plugins/fast-mode";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

// Preserve the upstream plugin's config, --fast flag, /fast toggle and eligibility
// checks. Only correct the model identity for concrete requests behind GPT Auto.
export function requestContext(payload: unknown, ctx: ExtensionContext): ExtensionContext {
	if (ctx.model?.provider !== "auto" || ctx.model.id !== "gpt-auto" || !payload || typeof payload !== "object") return ctx;
	const id = (payload as { model?: unknown }).model;
	if (typeof id !== "string") return ctx;
	const model = ctx.modelRegistry.find("openai-codex", id);
	if (!model || model.api !== "openai-codex-responses") return ctx;
	return new Proxy(ctx, { get: (target, key, receiver) => key === "model" ? model : Reflect.get(target, key, receiver) });
}

export default function (pi: ExtensionAPI) {
	const bridge = new Proxy(pi, {
		get(target, key, receiver) {
			if (key !== "on") return Reflect.get(target, key, receiver);
			return (event: string, handler: (event: any, ctx: ExtensionContext) => unknown) => {
				if (event !== "before_provider_request") return pi.on(event as any, handler as any);
				return pi.on("before_provider_request", (event, ctx) => handler(event, requestContext(event.payload, ctx)) as any);
			};
		},
	});
	fastMode(bridge);
}
