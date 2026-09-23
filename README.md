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

## Install on a new machine

The repo is **private**, so bootstrap with the GitHub CLI (already handles auth),
then run the installer:

```sh
gh repo clone NBAFrigge/pi-setup /tmp/pi-setup && /tmp/pi-setup/install.sh
```

Or, if you use an SSH deploy key:

```sh
git clone git@github.com:NBAFrigge/pi-setup.git /tmp/pi-setup && /tmp/pi-setup/install.sh
```

The installer (`install.sh`) is idempotent and:

1. Checks prerequisites (`git`, `node`, `npm`).
2. Installs the `pi` CLI via npm if it is missing.
3. Backs up any existing `~/.pi/agent` config, then deploys the tracked files.
4. Installs every `npm:` package declared in `settings.json` via `pi install`.

Secrets and transient data are never touched (see **Excluded** above).

Flags:

```sh
./install.sh --dry-run       # print actions, change nothing
./install.sh --no-packages   # deploy config only, skip pi package installs
PI_AGENT_DIR=/custom/path ./install.sh
```

## After install

```sh
pi   # sign in again to regenerate auth.json / models-store.json
```

`auth.json` and `models-store.json` are intentionally not tracked, so you must
re-authenticate once on each new machine.
