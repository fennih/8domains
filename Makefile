PY = cd pipeline && uv run python -I

.PHONY: extract kb overlap dev build

extract:   ## extract local books in resources/ into sources/extracted (gitignored)
	$(PY) extract.py

kb:        ## compile and validate content/ into app/public/kb
	$(PY) build_kb.py

overlap:   ## flag generated text too close to local sources (maintainers only)
	$(PY) overlap_check.py

dev: kb
	cd app && bun run dev

build: kb
	cd app && bun run build
