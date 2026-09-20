# pi setup

Configuration for [pi](https://github.com/earendil-works/pi-coding-agent), my coding-agent harness.
Lives at `~/.pi/agent`.

## Contents

- `config.yml` — tool approval defaults
- `settings.json` — provider/model defaults and installed packages
- `mcp.json` — MCP server registrations
- `web-search.json` — web-search/fetch routing config
- `AGENTS.md` — global agent authorization rules
- `agents/` — custom subagent definitions
- `prompts/` — reusable prompt templates
- `extensions/` — TypeScript extensions + permission-system config

## Excluded (see `.gitignore`)

Secrets and transient data are intentionally not tracked: `auth.json`,
`models-store.json`, `sessions/`, `missions/`, `run-history.jsonl`, caches,
extension logs, `node_modules/`, and the `bin/` binaries.

## Restore

Clone into `~/.pi/agent`, then re-authenticate and reinstall packages:

```sh
pi   # sign in again to regenerate auth.json / models-store.json
```
