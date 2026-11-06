import fastMode from "@pi-plugins/fast-mode";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

function isAuto(ctx: ExtensionContext): boolean {
	return ctx.model?.provider === "auto" && ctx.model.id === "gpt-auto";
}

// Resolve the virtual model for both provider requests and /fast status updates.
export function requestContext(payload: unknown, ctx: ExtensionContext): ExtensionContext {
	if (!isAuto(ctx)) return ctx;
	let id = payload && typeof payload === "object" ? (payload as { model?: unknown }).model : undefined;
	if (typeof id !== "string") {
		const pin = ctx.sessionManager?.getBranch().findLast(entry => entry.type === "custom" && entry.customType === "jev-pin"
			&& (entry.data as { sessionId?: string })?.sessionId === ctx.sessionManager.getSessionId());
		const target = pin?.type === "custom" ? (pin.data as { target?: unknown })?.target : undefined;
		if (typeof target === "string" && target.startsWith("openai-codex/")) id = target.slice("openai-codex/".length);
	}
	if (typeof id !== "string") return ctx;
	const model = ctx.modelRegistry.find("openai-codex", id);
	if (!model || model.api !== "openai-codex-responses") return ctx;
	return new Proxy(ctx, { get: (target, key, receiver) => key === "model" ? model : Reflect.get(target, key, receiver) });
}

export default function (pi: ExtensionAPI) {
	let updateStatus: ((event: any, ctx: ExtensionContext) => unknown) | undefined;
	const bridge = new Proxy(pi, {
		get(target, key, receiver) {
			if (key === "registerCommand") return (name: string, command: any) => pi.registerCommand(name, {
				...command,
				handler: (args: string, ctx: ExtensionContext) => {
					const resolved = requestContext(undefined, ctx);
					if (!isAuto(resolved)) return command.handler(args, resolved);
					const ui = new Proxy(ctx.ui, { get: (ui, key, receiver) => key === "notify"
						? (message: string, level: any) => ui.notify(message.startsWith("Fast mode is on, but inactive:")
							? "Fast mode is on for GPT Auto; waiting for a route. Priority will apply to eligible models." : message, level)
						: Reflect.get(ui, key, receiver) });
					return command.handler(args, new Proxy(ctx, { get: (target, key, receiver) => key === "ui" ? ui : Reflect.get(target, key, receiver) }));
				},
			});
			if (key !== "on") return Reflect.get(target, key, receiver);
			return (event: string, handler: (event: any, ctx: ExtensionContext) => unknown) => {
				if (event === "model_select") updateStatus = handler;
				return pi.on(event as any, ((eventData: any, ctx: ExtensionContext) => {
					const resolved = requestContext(event === "before_provider_request" ? eventData.payload : undefined, ctx);
					if (event === "before_provider_request" && isAuto(ctx) && !isAuto(resolved)) updateStatus?.({}, resolved);
					return handler(eventData, resolved);
				}) as any);
			};
		},
	});
	fastMode(bridge);
}
