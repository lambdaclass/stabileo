export interface Element3DMetadata {
  localYx?: number;
  localYy?: number;
  localYz?: number;
  rollAngle?: number;
}

export function pickElement3DMetadata(source: Element3DMetadata): Element3DMetadata {
  const metadata: Element3DMetadata = {};
  if (source.localYx !== undefined) metadata.localYx = source.localYx;
  if (source.localYy !== undefined) metadata.localYy = source.localYy;
  if (source.localYz !== undefined) metadata.localYz = source.localYz;
  if (source.rollAngle !== undefined) metadata.rollAngle = source.rollAngle;
  return metadata;
}

export function hasExplicitLocalY(source: Element3DMetadata): boolean {
  return source.localYx !== undefined && source.localYy !== undefined && source.localYz !== undefined;
}
