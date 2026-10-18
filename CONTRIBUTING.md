# Contributing

Ideas, bugs and new animals are welcome. Open an issue first for anything bigger than a small fix.

1. Read `AGENTS.md` (layout, decisions) and `STATUS.md`.
2. Put rules in `hooks/core.ts` with a test in `tests/`; keep `hooks/register.tsx` as glue.
3. Run `claude plugin validate .` and `claude plugin test .` until clean.
4. Bump the version in `.claude-plugin/plugin.json`, add a line to `CHANGELOG.md`, and update `README.md` if behaviour changed.
5. Open a pull request saying what changed and how you checked it.
