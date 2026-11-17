### Performance
#### Copy a new detailing for undo from the objects it was written with (2026-11-17)

The first undo entry or autosave after a detailing run copied every bar
through the model's reactive proxies before serialising it. The copy is now
taken from the plain objects the detailing was written or restored with. A
part that arrives another way is copied as before.
