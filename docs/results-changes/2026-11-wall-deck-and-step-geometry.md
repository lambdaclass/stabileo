# CAD wall connections, gravity deck cover and snow step edges

## Refuse disconnected CAD wall ends near beams

A conforming wall end may snap to an eligible beam interior. If generation leaves an eligible beam within the CAD snap tolerance without a shared joint, the draft is refused and the message identifies the wall quad and beam. A beam already connected through a certified conforming slab edge retains that load path. Regenerate affected CAD drafts and check the intended wall connections before solving.

## Check independent deck clearance within the overlap

Separately supported beam bays can retain their floor load beneath a pitched shell. The clearance certificate evaluates the clipped plan intersection at the physical deck elevations. A low shell corner outside the intersection cannot exclude the bay. Regenerate affected panel gravity loads.

## Use certified gap strips to shelter rafters

Member cover uses the same certified footprints as area cover, including the gap strip and its attached roof elevation. A lower rafter beneath the strip receives sheltered loading. Saved panel derivations can identify older shell gravity and bounded gaps even when the snapshot omits the gravity mode. Regenerate affected panel gravity loads.

## Evaluate drift on short shared roof step edges

Modeled step drift evaluates shared edges with positive overlap above geometric floating-point roundoff. The same overlap test serves coincident and separated edges. Each pair then uses its measured separation and the existing drift and transfer checks. Regenerate affected snow cases and solve again.
