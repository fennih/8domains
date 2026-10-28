# 8Domains

Free, open source study app for the CISSP® exam: a knowledge base mapped to the eight domains of the ISC2 2024 exam outline, flashcards with spaced repetition, scenario questions and a study path, served as a scrollable mobile-first feed. Static site, works offline, no account, no tracking.

Live: https://8domains.valerio.fyi

## Run

Requires [uv](https://docs.astral.sh/uv/) and [bun](https://bun.sh).

```sh
make dev      # compile content/ and start the app
make build    # production build in app/dist
```

## Contribute content

Content lives in `content/` as Markdown + YAML. Read [content/AUTHORING.md](content/AUTHORING.md), then run `make kb` to validate.

## License

Code: MIT ([LICENSE](LICENSE)). Content in `content/`: CC BY-SA 4.0 ([LICENSE-CONTENT](LICENSE-CONTENT)).
CISSP® is a registered certification mark of ISC2, Inc. This project is not affiliated with, endorsed by or sponsored by ISC2.

`content/outline.json` follows the numbering and domain weights of the ISC2 CISSP Certification Exam Outline (effective April 15, 2024); objective and topic titles are written in this project's own words.
