# 8Domains

Free, open source study app for the CISSP® exam: a knowledge base mapped to the eight domains of the ISC2 2024 exam outline, flashcards with spaced repetition, scenario questions and a study path, served as a scrollable mobile-first feed. Works offline, no ads, no tracking.

Live: https://8domains.valerio.fyi (open preview: create a free account on the landing page). Study progress stays on your device.

## Run

Requires [uv](https://docs.astral.sh/uv/) and [bun](https://bun.sh).

```sh
make dev      # compile content/ and start the app (no sign-in)
make build    # landing + app (under /app/) in dist/
make preview  # run the Cloudflare Worker locally against dist/
```

## Hosting

`worker/` is a Cloudflare Worker that serves `dist/` and requires a [Clerk](https://clerk.com) session for everything under `/app/`. For `make preview`, put development keys in `worker/.dev.vars` (gitignored):

```sh
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
APP_ORIGIN=http://localhost:8787
SIGN_IN_URL=https://<your-instance>.accounts.dev/sign-in
```

and build with `VITE_CLERK_PUBLISHABLE_KEY` set to the same publishable key. To self-host without accounts, set `AUTH_DISABLED=true` on the Worker and build without the key.

## Contribute content

Content lives in `content/` as Markdown + YAML. Read [content/AUTHORING.md](content/AUTHORING.md), then run `make kb` to validate.

## License

Code: MIT ([LICENSE](LICENSE)). Content in `content/`: CC BY-SA 4.0 ([LICENSE-CONTENT](LICENSE-CONTENT)).
CISSP® is a registered certification mark of ISC2, Inc. This project is not affiliated with, endorsed by or sponsored by ISC2.

`content/outline.json` follows the numbering and domain weights of the ISC2 CISSP Certification Exam Outline (effective April 15, 2024); objective and topic titles are written in this project's own words.
