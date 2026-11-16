# Keep documentation in sync with code

Every code change must update the documentation it affects, in the same change. A change is not done while related docs are stale.

- User-facing manual: `docs/site/` (published on samuelba.dev). Update it when behavior, configuration, environment variables, defaults, ports, volumes, Docker images, ingestion sources, authentication, the MCP server or the UI changes.
- Environment variables: keep `.env.sample` and `docs/site/reference/configuration.md` consistent with the code.
- Developer docs: `README.md`, `DEVELOPMENT.md` and `docs/internal/` when setup, architecture or workflows change.
- Removed or renamed features, options or endpoints must be removed or renamed in the docs too.
- Before finishing, search the docs for the names you changed (`grep -rn <name> docs/ README.md DEVELOPMENT.md .env.sample`) and fix every stale reference.
- If no docs need updating, say so explicitly in the summary of the change.
