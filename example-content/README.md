# Example content

Placeholder content in the real format, so the app builds and runs without the private study content. `make` uses it whenever `content/` is missing.

- `outline.json`: the eight domains with one objective each
- `d<N>/<objective>-<slug>.md`: one concept per file, flashcards in the frontmatter
- `d<N>/questions.yaml`: scenario questions
- `tables/*.md`: comparison tables

Inline markup: `**bold**`, `==highlight==` (`==g:...==` exam action, `==b:...==` numbers), `++underline++`.
