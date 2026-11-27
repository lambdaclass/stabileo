# Iterable WASM solver tables

WASM object analysis reads solver tables supplied as Maps, Sets of key-value pairs, arrays of pairs or other JavaScript iterables of pairs. Every iterable uses the same checks for pair length, duplicate keys and valid records. Plain object tables remain supported. The decoder reports a parse error for unsupported table shapes or malformed entries.

An intermediate build of PR #2588 treated a Set as a plain object with no enumerable entries. A Set of connectors could therefore produce the same results as omitting the connectors. The corrected decoder preserves the supplied connectors for 2D and 3D object solves, including reusable load sessions, certificates and combinations.

During the same review, opening a legacy 2D project was found to retain the preceding project's drawing plane. A legacy XY project opened after a YZ project could solve with its X load projected away. Opening a 2D project now uses its saved drawing plane or the legacy XY default when the snapshot has no valid plane.
