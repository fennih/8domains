PY = cd pipeline && uv run python -I

# The private study content when cloned into content/, otherwise the public placeholder set.
CONTENT ?= $(if $(wildcard content/outline.json),content,example-content)

FONTS = app/node_modules/@fontsource-variable
SPECTRAL = app/node_modules/@fontsource/spectral/files

.PHONY: extract kb overlap dev build preview audio-segments audio-lexicon audio-audition audio audio-check audio-push

extract:   ## extract local books in resources/ into sources/extracted (gitignored)
	$(PY) extract.py

kb:        ## compile and validate $(CONTENT) into app/public/kb
	cd pipeline && KB_CONTENT=$(abspath $(CONTENT)) uv run python -I build_kb.py

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
	cp $(SPECTRAL)/spectral-latin-400-normal.woff2 $(SPECTRAL)/spectral-latin-500-normal.woff2 \
	   $(FONTS)/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-wght-normal.woff2 dist/fonts/

preview: build  ## run the Worker locally against dist/ (needs worker/.dev.vars)
	cd worker && bun run migrate && bun run dev

# Narration (local only, never in CI): Kokoro TTS in audio/, its own uv project. ONLY=d3 or ONLY=3.6 narrows a run.
# AUDIO_LANG=it narrates the translations in <content>/narration/it (not LANG: that is the shell locale)
# with OmniVoice, in the audio/mlx uv project. REDO=1 makes audio-check drop flagged steps for resynthesis.
AUDIO_LANG ?= en
AUDIO_IT = $(filter it,$(AUDIO_LANG))
AUDIO_RUN = cd audio && AUDIO_CONTENT=$(abspath $(CONTENT)) uv run $(if $(AUDIO_IT),--project mlx)
AUDIO = $(AUDIO_RUN) python -I build_audio.py --lang $(AUDIO_LANG)
ONLY_ARG = $(if $(ONLY),--only $(ONLY))

audio-segments: kb  ## narration text per story step, from the compiled KB
	cd app && bun scripts/story-segments.ts public/kb ../build/audio/segments.json

audio-lexicon: audio-segments  ## fail on any technical token without a deliberate pronunciation
	$(AUDIO) lexicon --guesses $(ONLY_ARG)

audio-audition: audio-segments  ## local page with one clip per lexicon entry and guessed word
	$(AUDIO) audition

audio: audio-segments  ## synthesize narration into build/audio/out and $(CONTENT)/audio manifests
	$(AUDIO) synth $(ONLY_ARG)
	$(MAKE) kb

audio-check:  ## transcribe synthesized steps with Whisper and flag drift from the text
	$(AUDIO_RUN) $(if $(AUDIO_IT),,--group check) python -I build_audio.py --lang $(AUDIO_LANG) check $(ONLY_ARG) $(if $(REDO),--redo)

audio-push:  ## upload new narration files of every language to R2 (needs wrangler login)
	$(AUDIO) push
