# User Authorization

- Use read-only MCP operations without requesting confirmation. This includes search, list, get, fetch, describe, and status endpoints.
- Modify source code and tests in the current working tree without requesting confirmation.
- Continue to request confirmation before MCP or API operations that create, update, delete, submit, merge, deploy, publish, or otherwise change external state, unless the user explicitly authorizes that operation.
