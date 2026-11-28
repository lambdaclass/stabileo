type Handler = () => void;
type Handlers = Record<'handlePDelta' | 'handlePDelta3D' | 'handleBuckling' | 'handleBuckling3D', Handler>;

export function dispatchSecondOrder(id: 'buckling' | 'pdelta', space: boolean, handlers: Handlers): void {
  const selected = id === 'buckling'
    ? (space ? handlers.handleBuckling3D : handlers.handleBuckling)
    : (space ? handlers.handlePDelta3D : handlers.handlePDelta);
  selected();
}
