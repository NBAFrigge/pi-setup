import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { basename } from "node:path";

export default function (pi: ExtensionAPI) {
	let requestFooterRender: (() => void) | undefined;
	let rpcActiveAgents = 0;
	let statusRequestSequence = 0;
	let lensAvailable = false;
	let lensSequence = -1;
	let lensHasSnapshot = false;
	const lensFiles = new Map<string, { errors: number; warnings: number; truncated: boolean }>();
	const foregroundCalls = new Map<string, number>();
	const eventUnsubscribers: Array<() => void> = [];

	const renderFooter = () => requestFooterRender?.();
	const formatTokens = (tokens: number): string => {
		if (tokens < 1000) return `${tokens}`;
		if (tokens < 10_000) return `${(tokens / 1000).toFixed(1)}k`;
		if (tokens < 1_000_000) return `${Math.round(tokens / 1000)}k`;
		if (tokens < 10_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
		return `${Math.round(tokens / 1_000_000)}M`;
	};
	const estimatedLaunchCount = (args: unknown): number => {
		if (!args || typeof args !== "object") return 0;
		const input = args as Record<string, unknown>;
		if (typeof input.action === "string") return 0;
		if (typeof input.agent === "string") return 1;
		if (typeof input.workflowScript !== "string" && typeof input.workflowScriptPath !== "string" && typeof input.workflow !== "string") return 0;

		const preflight = input.preflight as { lanes?: unknown[] } | undefined;
		return Math.max(1, preflight?.lanes?.length ?? 1);
	};

	const updateLensDiagnostics = (payload: unknown) => {
		if (!payload || typeof payload !== "object") return;
		const event = payload as { v?: unknown; seq?: unknown; files?: unknown };
		if (event.v !== 1 || typeof event.seq !== "number" || event.seq <= lensSequence || !Array.isArray(event.files)) return;

		lensSequence = event.seq;
		lensHasSnapshot = true;
		for (const item of event.files) {
			if (!item || typeof item !== "object") continue;
			const file = item as { path?: unknown; diagnostics?: unknown; truncated?: unknown };
			if (typeof file.path !== "string" || !Array.isArray(file.diagnostics)) continue;

			let errors = 0;
			let warnings = 0;
			for (const diagnostic of file.diagnostics) {
				if (!diagnostic || typeof diagnostic !== "object") continue;
				const severity = (diagnostic as { severity?: unknown }).severity;
				if (severity === "error") errors++;
				if (severity === "warning") warnings++;
			}
			lensFiles.set(file.path, { errors, warnings, truncated: file.truncated === true });
		}
		renderFooter();
	};

	const refreshSubagentCount = () => {
		const sequence = ++statusRequestSequence;
		const requestId = `minimal-footer-${Date.now()}-${sequence}`;
		let unsubscribe: (() => void) | undefined;
		unsubscribe = pi.events.on(`subagents:rpc:v1:reply:${requestId}`, (payload: unknown) => {
			unsubscribe?.();
			if (sequence !== statusRequestSequence || !payload || typeof payload !== "object") return;

			const reply = payload as { success?: boolean; data?: { fleet?: { totalActive?: unknown } } };
			const total = reply.data?.fleet?.totalActive;
			if (reply.success === true && typeof total === "number" && Number.isFinite(total)) {
				rpcActiveAgents = Math.max(0, Math.floor(total));
				renderFooter();
			}
		});

		pi.events.emit("subagents:rpc:v1:request", {
			version: 1,
			requestId,
			method: "status",
			params: {},
			source: { extension: "minimal-footer" },
		});
	};

	eventUnsubscribers.push(
		pi.events.on("subagents:rpc:v1:ready", refreshSubagentCount),
		pi.events.on("subagent:async-started", refreshSubagentCount),
		pi.events.on("subagent:async-complete", refreshSubagentCount),
		pi.events.on("pilens:diagnostics", updateLensDiagnostics),
	);

	pi.registerShortcut("ctrl+shift+l", {
		description: "Toggle expanded Pi Lens diagnostics",
		handler: async (ctx) => {
			if (!ctx.isIdle()) {
				ctx.ui.notify("Pi Lens can be expanded when the agent is idle.", "info");
				return;
			}
			if (!pi.getCommands().some((command) => command.name === "lens-widget-toggle")) {
				ctx.ui.notify("Pi Lens is not available in this session.", "warning");
				return;
			}
			pi.sendUserMessage("/lens-widget-toggle", { expandPromptTemplates: true });
		},
	});

	pi.on("tool_execution_start", (event) => {
		if (event.toolName !== "subagent") return;
		const count = estimatedLaunchCount(event.args);
		if (count === 0) return;
		foregroundCalls.set(event.toolCallId, count);
		renderFooter();
	});

	pi.on("tool_execution_end", (event) => {
		if (!foregroundCalls.delete(event.toolCallId)) return;
		renderFooter();
		refreshSubagentCount();
	});

	pi.on("session_start", async (_event, ctx) => {
		if (ctx.mode !== "tui") return;

		lensAvailable = pi.getCommands().some((command) => command.name === "lens-widget-toggle");
		let repo = basename(ctx.cwd);
		try {
			const result = await pi.exec("git", ["rev-parse", "--show-toplevel"], {
				cwd: ctx.cwd,
				timeout: 2000,
			});
			const root = result.stdout.trim();
			if (result.code === 0 && root) repo = basename(root);
		} catch {
			// Keep the current directory name outside a Git repository.
		}

		ctx.ui.setFooter((tui, theme, footerData) => {
			requestFooterRender = () => tui.requestRender();
			const unsubscribeBranch = footerData.onBranchChange(requestFooterRender);

			return {
				dispose() {
					unsubscribeBranch();
					requestFooterRender = undefined;
				},
				invalidate() {},
				render(width: number): string[] {
					const branch = footerData.getGitBranch();
					const context = ctx.getContextUsage();
					const usedTokens = context?.tokens == null ? "?" : formatTokens(context.tokens);
					const totalTokens = context?.contextWindow || ctx.model?.contextWindow;
					const usage = `${usedTokens}/${totalTokens ? formatTokens(totalTokens) : "?"}`;
					const model = ctx.model ? `${ctx.model.id}:${pi.getThinkingLevel()}` : "no-model";
					const left = [branch ? `${repo}:${branch}` : repo, model, usage].join("  ");
					const extensionStatuses = footerData.getExtensionStatuses();
					const remoteOnline = extensionStatuses.has("remote-pi:relay");
					const foregroundAgents = Array.from(foregroundCalls.values()).reduce((sum, count) => sum + count, 0);
					const activeAgents = Math.max(rpcActiveAgents, foregroundAgents);
					const rightParts: string[] = [];

					if (lensAvailable) {
						const totals = Array.from(lensFiles.values()).reduce(
							(sum, file) => ({
								errors: sum.errors + file.errors,
								warnings: sum.warnings + file.warnings,
								truncated: sum.truncated || file.truncated,
							}),
							{ errors: 0, warnings: 0, truncated: false },
						);
						const lspFailed = extensionStatuses.get("pi-lens-lsp")?.includes("LSP Failed") === true;
						let lensStatus = "on";
						if (lspFailed) lensStatus = "fail";
						else if (lensHasSnapshot && totals.errors === 0 && totals.warnings === 0) lensStatus = "ok";
						else if (lensHasSnapshot) {
							const counts = [totals.errors > 0 ? `${totals.errors}E` : "", totals.warnings > 0 ? `${totals.warnings}W` : ""]
								.filter(Boolean)
								.join("/");
							lensStatus = `${counts || "ok"}${totals.truncated ? "+" : ""}`;
						}
						rightParts.push(`lens:${lensStatus}`);
					}
					if (activeAgents > 0) rightParts.push(`agents:${activeAgents}`);
					if (remoteOnline) rightParts.push("remote:on");

					if (rightParts.length === 0) {
						return [truncateToWidth(theme.fg("dim", left), width, theme.fg("dim", "..."))];
					}

					const right = rightParts.join("  ");
					const availableLeft = width - visibleWidth(right) - 2;
					if (availableLeft <= 0) {
						return [truncateToWidth(theme.fg("dim", right), width, theme.fg("dim", "..."))];
					}

					const fittedLeft = truncateToWidth(left, availableLeft, "...");
					const padding = " ".repeat(width - visibleWidth(fittedLeft) - visibleWidth(right));
					return [theme.fg("dim", fittedLeft + padding + right)];
				},
			};
		});
		refreshSubagentCount();
	});

	pi.on("session_shutdown", () => {
		for (const unsubscribe of eventUnsubscribers) unsubscribe();
		foregroundCalls.clear();
		lensFiles.clear();
		requestFooterRender = undefined;
	});
}
