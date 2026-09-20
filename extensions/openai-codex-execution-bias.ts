import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Adapted from Oh My Pi's OpenAI Codex prompt bridge:
 * https://github.com/can1357/oh-my-pi/commit/969eb8fc00f2ccee7ef4cdb211f949620a82631b
 *
 * Pi exposes `subagent`, not Oh My Pi's `Task` tool, so the guidance uses
 * Pi's actual tool name. It only applies to OpenAI Codex Responses models.
 */
const CODEX_EXECUTION_BIAS = `<environment_override priority="critical">
TOOL AUTHORITY: The current function schemas define all available tools. Tools mentioned elsewhere but absent from those schemas do not exist. Use only schema-defined tools.

EXECUTION BIAS: Execute simple tasks directly. Reserve the subagent tool for work that clearly benefits from isolated context or parallel delegation. Do not delegate ordinary reasoning, single-file changes, or tasks likely to take fewer than five tool calls.

These instructions override conflicting earlier assumptions about tool availability or delegation.
</environment_override>`;

export default function (pi: ExtensionAPI) {
	pi.on("before_agent_start", (event, ctx) => {
		const model = ctx.model;
		const isOpenAICodex =
			model?.provider === "openai-codex" ||
			model?.api === "openai-codex-responses";

		if (!isOpenAICodex) return;

		return {
			systemPrompt: `${event.systemPrompt}\n\n${CODEX_EXECUTION_BIAS}`,
		};
	});
}
