# Fagspill: validation of learning question packs

A small, dependency-free JavaScript module for checking question packs before import or publication. It uses the source/question envelope already present in Fjordsprint's learning content.

This is a reusable core component. It does not include a quiz interface, multiplayer sessions, storage or an importer. It does not change the existing Fagdag deployment, participant identities, results or Fjordsprint scoring.

## Run the tests

From the repository root, using Node.js:

```bash
node --test fagspill/question-pack.test.mjs
```

No package installation is needed. The `.mjs` extension declares the module format.

## Use

```js
import { validateQuestionPack } from './question-pack.mjs';

const result = validateQuestionPack(parsedJson);
if (!result.valid) {
  // Present the row-specific errors; do not import the invalid pack.
  console.log(result.issues);
}
```

The function accepts an already parsed JSON-compatible value and returns:

```json
{
  "valid": false,
  "issues": [
    {
      "code": "unknown_source",
      "path": "questions[0].source",
      "row": 1,
      "message": "Spørsmålet viser til en kilde som ikke finnes i pakken."
    }
  ]
}
```

`row` is one-based within the `sources` or `questions` collection; collection-level errors use `null`. `path` identifies the exact field. Error codes are suitable for programmatic handling; messages are in Norwegian. All discovered validation issues are returned together. The function never changes the input, repairs content, fetches URLs or invokes a model.

## Required shape

- A top-level object with nonempty `sources` and `questions` arrays.
- A source has `id`, `title` and `url` strings. IDs are unique. URLs must be absolute HTTP/HTTPS links without embedded credentials, whitespace or control characters.
- A question has a unique string `id`, nonempty `question`, at least two nonempty string `options`, integer `correct` index, nonempty `explanation` and a `source` ID present exactly once in the source collection.
- Correct-answer indexes start at **0**. IDs and source references are compared exactly and case-sensitively; the validator does not trim or rename them.
- Existing extra metadata such as `verified`, `note`, `category`, `mascot`, `course` and `expert` is accepted without introducing a new required version field. Extra metadata is not validated.

The included `examples/example-pack.json` is synthetic. Its example.org URL is a placeholder, not an independently reviewed learning source.

## Limits

Validation establishes structure and internal references. It does not establish that an answer is correct, a source supports the explanation, a URL is reachable, content is safe to render as HTML, or a package has permission for republication. Render user-provided strings as text and perform the relevant content review before publishing a learning pack.

The component performs no I/O and has no runtime AI dependency. File-size limits and JSON parsing belong in the surrounding import flow.
