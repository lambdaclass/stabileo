import type ts from 'typescript';

export function resultSites(sources: string[], options: ts.CompilerOptions): { diagnostic: Set<string>; record: Set<string>; map: Set<string> };
