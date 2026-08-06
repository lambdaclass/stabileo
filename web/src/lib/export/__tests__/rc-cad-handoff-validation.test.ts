/**
 * What the two validation layers REFUSE.
 *
 * A validator that only ever sees valid input is untested. Each case below starts from the real
 * production manifest and mutates exactly one thing, so the assertion is about that mutation
 * and not about the rest of the document.
 *
 * The cases are ordered by what they protect:
 *
 *   1. the schema validator's own honesty — it must refuse a schema it would under-enforce;
 *   2. shape;
 *   3. identity and references;
 *   4. geometry;
 *   5. the three claims that would make the manifest dishonest.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { buildFootingCadHandoffV2 } from '../../store/rc-cad-export';
import {
  validateRcCadHandoffV2, validateRcCadHandoffV2Schema, validateRcCadHandoffV2Semantics,
  RC_CAD_HANDOFF_V2_SCHEMA_DOC,
} from '../rc-cad-handoff-v2-validate';
import { assertSupportedSchema, validateAgainstSchema } from '../json-schema-subset';
import { validateRcCadHandoffSemantics } from '../rc-cad-handoff-semantics';
import type { RcCadHandoffV2 } from '../rc-cad-handoff-v2-types';
import { runProductionChain, keyTranslate } from './rc-cad-chain';

let valid: RcCadHandoffV2;

beforeAll(async () => {
  await runProductionChain();
  const out = buildFootingCadHandoffV2(1, keyTranslate);
  if (!out.ok) throw new Error(`export refused: ${JSON.stringify(out.refusals)}`);
  valid = out.handoff;
}, 180_000);

/** A deep clone with one mutation applied, so no case can leak into another. */
function mutate(fn: (d: RcCadHandoffV2) => void): RcCadHandoffV2 {
  const copy = JSON.parse(JSON.stringify(valid)) as RcCadHandoffV2;
  fn(copy);
  return copy;
}

const semanticRules = (d: unknown) => validateRcCadHandoffV2Semantics(d).map((v) => v.rule);

describe('the schema validator refuses to under-enforce', () => {
  it('accepts the shipped schema, so every keyword in it is actually checked', () => {
    expect(() => assertSupportedSchema(RC_CAD_HANDOFF_V2_SCHEMA_DOC)).not.toThrow();
  });

  it('throws on a keyword it does not implement rather than ignoring it', () => {
    // The failure mode this guards: someone adds `maxItems`, this file never learns to check
    // it, and the constraint is silently unenforced while every test still passes.
    expect(() => assertSupportedSchema({ type: 'array', maxItems: 3 }))
      .toThrow(/unsupported keyword "maxItems"/);
  });

  it('throws on a permissive additionalProperties', () => {
    expect(() => assertSupportedSchema({ type: 'object', additionalProperties: { type: 'string' } }))
      .toThrow(/additionalProperties must be false/);
  });

  it('throws on an unresolvable $ref instead of passing the value', () => {
    expect(() => validateAgainstSchema({}, { $ref: '#/$defs/nope' }))
      .toThrow(/unresolvable \$ref/);
  });

  it('rejects a non-finite number where a number is required', () => {
    // JSON cannot carry NaN, but an in-memory document built by a producer can, and a validator
    // that accepted it would let a coordinate through that no CAD kernel can use.
    const v = validateAgainstSchema({ x: Number.NaN }, {
      type: 'object', additionalProperties: false,
      required: ['x'], properties: { x: { type: 'number' } },
    });
    expect(v).toHaveLength(1);
    expect(v[0].message).toContain('non-finite');
  });

  it('enforces the conditional that makes a NOT_EVALUATED reason mandatory', () => {
    const bad = mutate((d) => {
      const c = d.checks.find((x) => x.evaluationStatus === 'NOT_EVALUATED')!;
      delete c.notEvaluatedReason;
    });
    const paths = validateRcCadHandoffV2Schema(bad).map((v) => v.message);
    expect(paths.some((m) => m.includes('notEvaluatedReason'))).toBe(true);
  });
});

describe('schema rejection', () => {
  it('rejects a wrong schema name or version', () => {
    // A V2 document claiming V1's name, or V1's version. Both are refused: the two fields are
    // checked independently, so a mismatch cannot be resolved by trusting whichever the reader
    // happened to read first.
    expect(validateRcCadHandoffV2Schema(mutate((d) => {
      (d as { schema: string }).schema = 'RcCadHandoffV1';
    })).length).toBeGreaterThan(0);
    expect(validateRcCadHandoffV2Schema(mutate((d) => {
      (d as { schemaVersion: number }).schemaVersion = 1;
    })).length).toBeGreaterThan(0);
  });

  it('rejects an unknown property, so a typo is never silently carried', () => {
    const v = validateRcCadHandoffV2Schema(mutate((d) => {
      (d.subject as unknown as Record<string, unknown>).enitityId = 7;
    }));
    expect(v.some((x) => x.message.includes('unexpected property "enitityId"'))).toBe(true);
  });

  it('rejects a missing required block', () => {
    const v = validateRcCadHandoffV2Schema(mutate((d) => {
      delete (d as Partial<RcCadHandoffV2>).assembly;
    }));
    expect(v.some((x) => x.message.includes('"assembly"'))).toBe(true);
  });

  it('rejects imperial or unstated units and a Y-up frame', () => {
    expect(validateRcCadHandoffV2Schema(mutate((d) => {
      (d.units as unknown as Record<string, unknown>).length = 'ft';
    })).length).toBeGreaterThan(0);
    expect(validateRcCadHandoffV2Schema(mutate((d) => {
      (d.coordinateSystem as unknown as Record<string, unknown>).up = 'Y';
    })).length).toBeGreaterThan(0);
  });

  it('rejects a non-positive bar diameter or box dimension', () => {
    expect(validateRcCadHandoffV2Schema(mutate((d) => {
      d.reinforcement.bars[0].diameterMm = 0;
    })).length).toBeGreaterThan(0);
    expect(validateRcCadHandoffV2Schema(mutate((d) => {
      d.concrete.bodies[0].shape.height = -0.5;
    })).length).toBeGreaterThan(0);
  });

  it('rejects an unsupported-condition code that is not a stable identifier', () => {
    const v = validateRcCadHandoffV2Schema(mutate((d) => {
      d.unsupported[0].code = 'not a code';
    }));
    expect(v.some((x) => x.message.includes('pattern'))).toBe(true);
  });

  it('rejects an interface that is not declared internal', () => {
    expect(validateRcCadHandoffV2Schema(mutate((d) => {
      (d.concrete.interfaces[0] as unknown as Record<string, unknown>).exposure = 'exposed';
    })).length).toBeGreaterThan(0);
  });
});

describe('semantic rejection — identity and references', () => {
  it('rejects a duplicated body, bar or check id', () => {
    expect(semanticRules(mutate((d) => {
      d.concrete.bodies[1].bodyId = d.concrete.bodies[0].bodyId;
    }))).toContain('unique.bodyId');
    expect(semanticRules(mutate((d) => {
      d.reinforcement.bars[1].id = d.reinforcement.bars[0].id;
    }))).toContain('unique.barId');
    expect(semanticRules(mutate((d) => {
      d.checks[1].checkId = d.checks[0].checkId;
    }))).toContain('unique.checkId');
  });

  it('rejects a bar claiming a family that does not exist', () => {
    expect(semanticRules(mutate((d) => {
      d.reinforcement.bars[0].familyId = 'family:invented';
    }))).toContain('resolve.bar.family');
  });

  it('rejects a family listing a bar that does not exist', () => {
    expect(semanticRules(mutate((d) => {
      d.assembly.families[0].barIds.push('bar:ghost');
    }))).toContain('resolve.family.bar');
  });

  it('rejects a bar that belongs to no family', () => {
    // A bar with no stated purpose in a document whose whole point is stating the purpose.
    expect(semanticRules(mutate((d) => {
      const f = d.assembly.families.find((x) => x.kind === 'columnDowel')!;
      f.barIds = f.barIds.slice(1);
    }))).toContain('family.coverage');
  });

  it('rejects a check referencing an unknown requirement, body or interface', () => {
    expect(semanticRules(mutate((d) => {
      d.checks[0].requirementIds = ['req:ghost'];
    }))).toContain('resolve.check.requirement');
    expect(semanticRules(mutate((d) => {
      d.checks[0].scope = { bodyIds: ['body:ghost'] };
    }))).toContain('resolve.check.body');
    expect(semanticRules(mutate((d) => {
      d.checks[2].scope!.interfaceIds = ['iface:ghost'];
    }))).toContain('resolve.check.interface');
  });

  it('rejects a finding naming a bar that is not in the document', () => {
    // The CLEAR-SPACING check, not the collision one: V2's collision check has zero findings —
    // the starter hooks no longer interpenetrate — so there is nothing there to mutate. The four
    // mat/starter spacing findings are the ones that exist, and they are exactly the findings V1
    // could not carry, because one bar of each pair was outside its scope.
    expect(semanticRules(mutate((d) => {
      const spacing = d.checks.find((c) => c.checkKind === 'barClearSpacing')!;
      expect(spacing.findings!.length).toBe(4);
      spacing.findings![0].barIdA = 'bar:ghost';
    }))).toContain('resolve.finding.bar');
  });

  it('rejects a mark whose stated quantity disagrees with its bar list', () => {
    expect(semanticRules(mutate((d) => {
      d.reinforcement.marks[0].quantity += 1;
    }))).toContain('mark.quantityMatchesBars');
  });
});

describe('semantic rejection — the interface', () => {
  it('rejects an interface whose participants are not real bodies', () => {
    expect(semanticRules(mutate((d) => {
      d.concrete.interfaces[0].participants.aboveBodyId = 'body:ghost';
    }))).toContain('interface.participant');
  });

  it('rejects an interface that joins a body to itself', () => {
    expect(semanticRules(mutate((d) => {
      const i = d.concrete.interfaces[0];
      i.participants.aboveBodyId = i.participants.belowBodyId;
    }))).toContain('interface.distinct');
  });

  it('rejects an interface plane that is not where the two solids meet', () => {
    // A contact declared at the wrong elevation is not a contact, and every cover measurement
    // scoped to it would be taken against a surface that does not exist.
    expect(semanticRules(mutate((d) => {
      d.concrete.interfaces[0].geometry.elevation += 0.05;
    }))).toContain('interface.elevation');
  });

  it('rejects intentional passage naming a bar that does not exist', () => {
    expect(semanticRules(mutate((d) => {
      d.concrete.interfaces[0].intentionalBarPassage!.barIds = ['bar:ghost'];
    }))).toContain('passage.bar');
  });

  it('rejects an empty intentional-passage declaration', () => {
    expect(semanticRules(mutate((d) => {
      d.concrete.interfaces[0].intentionalBarPassage!.barIds = [];
    }))).toContain('passage.nonEmpty');
  });
});

describe('semantic rejection — geometry', () => {
  it('rejects a non-finite coordinate anywhere', () => {
    expect(semanticRules(mutate((d) => {
      d.concrete.bodies[0].shape.centre.z = Number.NaN;
    }))).toContain('body.centre');
    expect(semanticRules(mutate((d) => {
      d.reinforcement.bars[0].segments[0].start.x = Number.POSITIVE_INFINITY;
    }))).toContain('segment.point');
  });

  it('rejects a box that is not a solid', () => {
    expect(semanticRules(mutate((d) => {
      d.concrete.bodies[0].shape.B = 0;
    }))).toContain('body.dimension');
  });

  it('rejects a non-positive bar diameter or cutting length', () => {
    expect(semanticRules(mutate((d) => {
      d.reinforcement.bars[0].diameterMm = -16;
    }))).toContain('bar.diameter');
    expect(semanticRules(mutate((d) => {
      d.reinforcement.bars[0].cuttingLength = 0;
    }))).toContain('bar.cuttingLength');
  });

  it('rejects an arc that drops its centre without declaring the approximation', () => {
    // THE exactness rule. Silence here would be a claim of exactness the data cannot support,
    // and the deviation is the full sagitta — measured at 5,9 mm on a Ø8 90° bend.
    expect(semanticRules(mutate((d) => {
      const bar = d.reinforcement.bars.find((b) => b.segments.some((s) => s.kind === 'arc'))!;
      delete bar.segments.find((s) => s.kind === 'arc')!.centre;
    }))).toContain('segment.arcClaim');
  });

  it('rejects an arc that has an exact centre yet claims to be approximated', () => {
    expect(semanticRules(mutate((d) => {
      const bar = d.reinforcement.bars.find((b) => b.segments.some((s) => s.kind === 'arc'))!;
      bar.segments.find((s) => s.kind === 'arc')!.arcApproximated = true;
    }))).toContain('segment.arcClaim');
  });

  it('rejects a straight segment carrying arc data', () => {
    expect(semanticRules(mutate((d) => {
      const s = d.reinforcement.bars[0].segments.find((x) => x.kind === 'straight')!;
      s.radius = 0.05;
    }))).toContain('segment.straightWithArcData');
  });
});

describe('semantic rejection — the dishonest claims', () => {
  /**
   * The two completeness rules are V1's and are tested against V1.
   *
   * They are not dead: an old V1 document on disk still goes through them. They are simply
   * UNREACHABLE from a V2 document, because V2's completeness enum has no
   * `completeFootingReinforcement` member and its assembly kind is never `footingTransferCage` —
   * which is why V2's own rules below check the V2 equivalents instead. Asserting them here
   * against a V1-shaped literal keeps the V1 coverage the freeze promised.
   */
  it('rejects a V1 complete-footing-reinforcement claim while the mats are unmodelled', () => {
    const v1Doc = {
      assembly: {
        kind: 'footingTransferCage',
        completeness: 'completeFootingReinforcement',
        descriptionKey: 'k', families: [],
      },
      unsupported: [{ code: 'FOOTING_MAT_GEOMETRY_NOT_MODELED', text: 'x' }],
      reinforcement: { bars: [], marks: [] },
      concrete: { bodies: [], interfaces: [] },
      requirements: { cover: [], clearSpacing: [] },
      checks: [],
    };
    expect(validateRcCadHandoffSemantics(v1Doc).map((v) => v.rule))
      .toContain('completeness.contradiction');
  });

  it('V2 refuses the equivalent claim through its own rules', () => {
    // The V2 shape of the same dishonesty: saying the mats are here while carrying none.
    expect(semanticRules(mutate((d) => {
      d.assembly.families = d.assembly.families.filter((fam) => !fam.kind.startsWith('footing'));
      d.reinforcement.bars = d.reinforcement.bars.filter(
        (b) => !d.assembly.families.every((fam) => !fam.barIds.includes(b.id)));
    }))).toContain('assembly.completenessClaimsMats');
  });

  it('rejects a V1 transfer cage that omits the mat condition', () => {
    // Also V1's rule, and also unreachable from V2: it fires on `kind === footingTransferCage`,
    // which V2 never is. Dropping the condition and keeping `partialConnectionOnly` would still
    // read, to anyone who did not know the schema, as the footing's whole reinforcement.
    const v1Doc = {
      assembly: {
        kind: 'footingTransferCage', completeness: 'partialConnectionOnly',
        descriptionKey: 'k', families: [],
      },
      unsupported: [],
      reinforcement: { bars: [], marks: [] },
      concrete: { bodies: [], interfaces: [] },
      requirements: { cover: [], clearSpacing: [] },
      checks: [],
    };
    expect(validateRcCadHandoffSemantics(v1Doc).map((v) => v.rule))
      .toContain('completeness.missingCondition');
  });

  it('V2 refuses a mat-modelled status with no mat families to back it', () => {
    // The V2 equivalent: the statuses claim MODELED while nothing carries the bars.
    expect(semanticRules(mutate((d) => {
      d.assembly.families = d.assembly.families.filter((fam) => !fam.kind.startsWith('footing'));
    }))).toContain('statuses.matModeledWithoutFamilies');
  });

  it('rejects a footing cover requirement applied to the column stub', () => {
    const stubId = valid.concrete.bodies.find((b) => b.role === 'supportedColumn')!.bodyId;
    expect(semanticRules(mutate((d) => {
      d.requirements.cover[0].appliesToBodyIds.push(stubId);
    }))).toContain('cover.notOnColumnStub');
    expect(semanticRules(mutate((d) => {
      d.requirements.cover[0].measurementScope.withinBodyId = stubId;
    }))).toContain('cover.notOnColumnStub');
  });

  it('rejects a cover requirement that does not exclude the internal interface', () => {
    // Without the exclusion a consumer measuring "cover" measures to the column, and every
    // dowel fails a check it was never subject to.
    expect(semanticRules(mutate((d) => {
      d.requirements.cover[0].measurementScope.excludeInterfaceIds = [];
    }))).toContain('cover.excludesInterface');
  });

  it('rejects a containment PASS where Stabileo did not evaluate containment', () => {
    expect(semanticRules(mutate((d) => {
      const c = d.checks.find((x) => x.checkKind === 'reinforcementContainment')!;
      c.evaluationStatus = 'EVALUATED';
      c.authority = 'stabileo';
      delete c.notEvaluatedReason;
      delete c.notEvaluatedCode;
      c.consumerObservationPolicy = 'MAY_CROSS_CHECK';
      c.findings = [{ findingId: 'finding:invented', severity: 'ok' }];
    }))).toContain('containment.notEvaluatedInThisRelease');
  });

  it('rejects findings attached to a check that was not evaluated', () => {
    expect(semanticRules(mutate((d) => {
      const c = d.checks.find((x) => x.evaluationStatus === 'NOT_EVALUATED')!;
      c.findings = [{ findingId: 'finding:invented', severity: 'ok' }];
    }))).toContain('check.noFindingsWhenNotEvaluated');
  });

  it('rejects Stabileo authority on a check Stabileo did not run', () => {
    expect(semanticRules(mutate((d) => {
      d.checks.find((x) => x.evaluationStatus === 'NOT_EVALUATED')!.authority = 'stabileo';
    }))).toContain('check.authorityWithoutEvaluation');
  });

  it('rejects a cross-check invitation where there is no verdict to compare against', () => {
    expect(semanticRules(mutate((d) => {
      d.checks.find((x) => x.evaluationStatus === 'NOT_EVALUATED')!
        .consumerObservationPolicy = 'MAY_CROSS_CHECK';
    }))).toContain('check.noCrossCheckWithoutVerdict');
  });

  it('rejects a NOT_EVALUATED check whose reason is blank', () => {
    expect(semanticRules(mutate((d) => {
      d.checks.find((x) => x.evaluationStatus === 'NOT_EVALUATED')!.notEvaluatedReason = '   ';
    }))).toContain('check.reasonRequired');
  });

  it('rejects a concrete component with no cover check of its own', () => {
    expect(semanticRules(mutate((d) => {
      d.checks = d.checks.filter((c) => c.checkId !== 'check:concreteCover:column:1');
    }))).toContain('cover.perBodyCheck');
  });
});

describe('the combined gate', () => {
  it('reports ok only when both layers are clean', () => {
    expect(validateRcCadHandoffV2(valid).ok).toBe(true);
    const broken = validateRcCadHandoffV2(mutate((d) => {
      // A V2-reachable contradiction: the verdict says buildable while blockers are named.
      d.statuses.constructible = true;
    }));
    expect(broken.ok).toBe(false);
    expect(broken.semantic.length).toBeGreaterThan(0);
  });

  it('survives a document that is not an object at all', () => {
    expect(validateRcCadHandoffV2Semantics(null).map((v) => v.rule)).toContain('document.object');
    expect(validateRcCadHandoffV2Schema('nope').length).toBeGreaterThan(0);
  });
});
