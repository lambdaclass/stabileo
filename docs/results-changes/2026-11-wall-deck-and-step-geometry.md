# CAD wall connections, gravity deck cover and snow step edges

## Refuse disconnected CAD wall ends near beams

Draft generation refuses a disconnected wall end within the CAD snap tolerance of a beam. The [CAD wall and beam alignment change](2026-11-cad-beam-alignment-and-adjacent-snow.md#require-aligned-cad-wall-and-beam-joints) describes the current alignment and bearing requirements.

## Check independent deck clearance within the overlap

Separately supported beam bays can retain their floor load beneath a pitched shell. The clearance certificate evaluates the clipped plan intersection at the physical deck elevations. A low shell corner outside the intersection cannot exclude the bay. Regenerate affected panel gravity loads.

## Use certified gap strips to shelter rafters

Member cover uses the same certified footprints as area cover, including the gap strip and its attached roof elevation. A lower rafter beneath the strip receives sheltered loading. Saved panel derivations can identify older shell gravity and bounded gaps even when the snapshot omits the gravity mode. Regenerate affected panel gravity loads.

## Evaluate drift on short shared roof step edges

Modeled step drift evaluates shared edges with positive overlap above geometric floating-point roundoff. The same overlap test serves coincident and separated edges. Each pair then uses its measured separation and the existing drift and transfer checks. Regenerate affected snow cases and solve again.
