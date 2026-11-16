### Fixed
#### Keep main registry languages and current tool answers valid (2026-11-15)

- Preserve the six required result-change registry languages from main. Research-only Hungarian notices use English when either the title or explanation is unavailable; include Hungarian translations for the merged snow messages.
- Keep calculator and batch tool results tied to the current tool and inputs. Cached answers invalidate queued and running work, and late successes or failures cannot replace the current answer or clear its pending state.
