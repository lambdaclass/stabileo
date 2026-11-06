### Fixed
#### The re-check notice explains each result change in German, French and Turkish (2026-11-04)

- Fix #1404: the notice that lists the result changes since a project was last solved showed each
  change's title and explanation in English to German, French and Turkish readers, because the
  registry (`result-changes.json`) held only English, Spanish and Portuguese and the notice chose
  among those three. Every entry now carries all six of the app's languages, the notice follows the
  app's language, and the registry is refused if an entry lacks any of them.
