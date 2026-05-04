# Cinema Tickets JavaScript

Pure JavaScript implementation of the cinema ticket purchase exercise.

## Run

This project uses a small CLI rather than a browser UI. A CLI keeps the exercise dependency-free, makes the service easy to run in any Node environment, and fits the core domain workflow: submit account and ticket counts, then see payment and seat reservation values.

Run the default sample purchase:

```sh
npm start
```

Run a custom purchase:

```sh
npm run purchase -- --account-id=1 --adult=2 --child=1 --infant=1
```

Show CLI help:

```sh
npm run purchase -- --help
```

## Test

```sh
npm test
```
