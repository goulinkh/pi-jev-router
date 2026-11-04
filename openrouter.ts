import type { ClassifierContext, ClassifierQuestion } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export const EVALUATOR_PROVIDER = "openrouter";
export const EVALUATOR_MODEL = "typesafe/jev-1.14";

type Registry = ExtensionContext["modelRegistry"];
type Question = {
	type: "choice" | "boolean";
	instructions: string;
	criteria: Record<string, unknown>;
};
type Questions = Record<string, Question>;
type Answer<Q extends Question> = Q["type"] extends "boolean"
	? { probability: number }
	: { choice: string; probabilities: Record<string, number> };

// Pi's classifier API requires string criteria. Preserve structured rubrics as
// JSON text, rather than dropping their role/use_when/not_for/boundary fields.
export function prepareQuestions(questions: Questions): Record<string, ClassifierQuestion> {
	return Object.fromEntries(Object.entries(questions).map(([id, question]) => {
		const criteria = Object.fromEntries(Object.entries(question.criteria).map(([key, value]) =>
			[key, typeof value === "string" ? value : JSON.stringify(value)]));
		if (question.type === "boolean") {
			if (typeof criteria.true !== "string" || typeof criteria.false !== "string") throw new Error("Invalid boolean criteria");
			return [id, { type: "bool", instructions: question.instructions, criteria: { true: criteria.true, false: criteria.false } }];
		}
		return [id, { type: "choice", instructions: question.instructions, criteria }];
	}));
}

export function evaluationBytes(state: unknown, questions: unknown): number {
	// Include normalized criteria, the model ID, and headroom for wire framing.
	return Buffer.byteLength(JSON.stringify({ model: EVALUATOR_MODEL, state,
		questions: prepareQuestions(questions as Questions) }), "utf8") + 1024;
}

export function createEvaluator(registry: Registry) {
	const model = registry.findOfType("classifier", EVALUATOR_PROVIDER, EVALUATOR_MODEL);
	if (!model) throw new Error("OpenRouter Jev 1.14 is missing from Pi's classifier catalog.");
	return { registry, model };
}

export async function evaluate<Q extends Questions>({ model, state, questions, abortSignal }: {
	model: ReturnType<typeof createEvaluator>;
	state: ClassifierContext["state"];
	questions: Q;
	abortSignal?: AbortSignal;
	maxRetries?: 0;
}) {
	abortSignal?.throwIfAborted();
	const result = await model.registry.classify(model.model, {
		state, questions: prepareQuestions(questions),
	}, { signal: abortSignal });
	abortSignal?.throwIfAborted();
	// Never surface provider error bodies: they can echo private input or keys.
	if (result.stopReason !== "stop") throw new Error("OpenRouter Jev classification failed.");
	for (const [id, question] of Object.entries(questions)) {
		const answer = result.answers[id];
		if (question.type === "boolean") {
			if (answer?.type !== "bool" || !Number.isFinite(answer.probability) || answer.probability < 0 || answer.probability > 1) {
				throw new Error("OpenRouter Jev returned an invalid boolean answer.");
			}
		} else if (answer?.type !== "choice" || !Object.hasOwn(question.criteria, answer.choice)) {
			throw new Error("OpenRouter Jev returned an invalid route.");
		}
	}
	return {
		answers: result.answers as { [K in keyof Q]: Answer<Q[K]> },
		usage: { inputTokens: result.usage?.input, outputTokens: result.usage?.output },
	};
}
