# Exercise Library Source

NextSet ships with a small editable starter library and can import a larger
public exercise list later.

Recommended source:

- `yuhonas/free-exercise-db`
- URL: `https://github.com/yuhonas/free-exercise-db`
- Raw JSON: `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json`
- License: Unlicense/public-domain-style, inherited from the original
  `wrkout/exercises.json` data.

Import policy:

- Store source metadata on each imported exercise.
- Keep imports idempotent by `source` and `source_id`.
- Normalize primary muscle, secondary muscles, equipment, category, and notes.
- Keep every exercise editable because public datasets vary in quality and naming.

Fallback/reference sources:

- `wrkout/exercises.json`: original Unlicense dataset.
- Kinetic Place exercise repositories: MIT-licensed structured exercise data.
- wger API: mature API, but content licensing can require attribution per entry.
