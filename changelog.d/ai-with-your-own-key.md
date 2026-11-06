### Added
#### The AI assistant works with your own Anthropic or OpenAI key (2026-11-01)

The AI panel was switched off while its server was being built. It now works with an API key you
paste in the panel: pick Anthropic (Claude) or OpenAI, paste the key, and the assistant builds and
edits models, and reviews results, as it was designed to. The key is kept only in this browser and
sent only to that provider (api.anthropic.com or api.openai.com), never to Stabileo; usage is
billed to your account with the provider. "Forget key" removes it. A proposal from the model is
still a draft: it is checked against the model's rules before it reaches the canvas, and the model
is solved only when you press Apply. Without a key the panel asks for one instead of showing
greyed-out controls. This is interim: when Stabileo's own AI service opens, the panel will use it
and a key will no longer be needed.
