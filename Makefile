PY = cd pipeline && uv run python -I

FONTS = app/node_modules/@fontsource-variable
SPECTRAL = app/node_modules/@fontsource/spectral/files

.PHONY: extract kb overlap dev build preview

extract:   ## extract local books in resources/ into sources/extracted (gitignored)
	$(PY) extract.py

kb:        ## compile and validate content/ into app/public/kb
	$(PY) build_kb.py

overlap:   ## flag generated text too close to local sources (maintainers only)
	$(PY) overlap_check.py

dev: kb
	cd app && bun run dev

build: kb  ## landing at /, app at /app/, assembled in dist/ for the Worker
	cd app && BASE_PATH=/app/ bun run build
	rm -rf dist && mkdir -p dist/fonts
	cp -R landing/. dist/
	cp -R app/dist dist/app
	cp app/public/icon.svg dist/
	cp $(SPECTRAL)/spectral-latin-400-normal.woff2 $(SPECTRAL)/spectral-latin-400-italic.woff2 \
	   $(SPECTRAL)/spectral-latin-500-normal.woff2 $(SPECTRAL)/spectral-latin-500-italic.woff2 \
	   $(FONTS)/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-wght-normal.woff2 dist/fonts/

preview: build  ## run the Worker locally against dist/ (needs worker/.dev.vars)
	cd worker && bun run dev
