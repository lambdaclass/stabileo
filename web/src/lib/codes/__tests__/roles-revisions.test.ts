import { describe, it, expect } from 'vitest';
import { teAt } from '../../i18n/engine-text';
import { shippedLocales } from '../../i18n/store.svelte';
import {
  DESIGN_ONLY_ROLES, LOAD_AFFECTING_ROLES, REGULATION_ROLES, ROLE_CATALOG,
  bindRole, bindingLabel, defaultRegulations, isLoadAffecting, migrateRegulations,
  optionLabel,
  optionsForRole, allOptionsForRole, availabilityOf, optionIsAvailable,
  pendingRequiresLoadRegeneration, pendingRoles, regulationStamps,
  roleUsable, unsetBinding, validateStack, type ProjectRegulations,
} from '../roles';
import {
  REVISION_STAGES, applyChange, bump, bumpPreserving, consequenceOf, dependenciesOf,
  dependsOn, downstreamOf, emptyRevisions, freshness, stamp,
} from '../revisions';

// ─── Catalogue ───────────────────────────────────────────────────

describe('regulation catalogue', () => {
  it('has no duplicate rendered label within a role, in ANY shipped locale', () => {
    // Both CIRSOC 201 adapters were labelled "CIRSOC 201" and a user could not tell them
    // apart. Asserting on the RENDERED label in every locale is the real requirement:
    // uniqueness of the key pair would not catch a translation that dropped {edition}.
    for (const locale of shippedLocales()) {
      for (const role of REGULATION_ROLES) {
        const labels = optionsForRole(role).map((o) => teAt(optionLabel(o), locale));
        expect(new Set(labels).size, `role ${role} in ${locale}: ${labels.join(' | ')}`)
          .toBe(labels.length);
      }
    }
  });

  it('names every catalogued concrete edition distinctly, with the edition in the label', () => {
    // The label-uniqueness invariant is a property of the WHOLE catalogue, including the
    // reserved CIRSOC 201-2005 entry: a reserved option that renders identically to a live
    // one would start colliding the day it is switched on. Asserted over
    // `allOptionsForRole`, which is what the invariant covers.
    for (const locale of ['en', 'es']) {
      const labels = allOptionsForRole('concrete').map((o) => teAt(optionLabel(o), locale));
      expect(labels, locale).toContain('CIRSOC 201 (2025)');
      expect(labels, locale).toContain('CIRSOC 201 (2005)');
      expect(new Set(labels).size, locale).toBe(labels.length);
    }
  });

  it('offers ONLY the available concrete edition for selection', () => {
    // CIRSOC 201-2005 is reserved, not offered: its official text is not supplied, so its
    // rules are not implemented and no other edition's rules are substituted for it.
    // Offering it would mean either a dead control or a mislabelled result.
    const offered = optionsForRole('concrete').filter((o) => o.regulation === 'cirsoc-201');
    expect(offered.map((o) => o.edition)).toEqual(['2025']);
    for (const o of offered) expect(availabilityOf(o)).toBe('AVAILABLE');
    // Reserved metadata survives, so a future sourced adapter is a catalogue edit.
    const reserved = allOptionsForRole('concrete')
      .find((o) => o.regulation === 'cirsoc-201' && o.edition === '2005');
    expect(reserved).toBeDefined();
    expect(availabilityOf(reserved!)).toBe('UNAVAILABLE_SOURCE');
    expect(reserved!.noteKey).toBe('regulations.note.editionTextNotSupplied');
  });

  it('exposes no unavailable option in ANY role selector', () => {
    // Generic: the filter is a property of the catalogue layer, not of CIRSOC.
    for (const role of REGULATION_ROLES) {
      for (const o of optionsForRole(role)) {
        expect(optionIsAvailable(o), `${role}/${o.adapterId}`).toBe(true);
      }
    }
  });

  it('refuses to bind an unavailable option rather than binding it silently', () => {
    expect(() => bindRole('concrete', 'cirsoc-2005'))
      .toThrow(/UNAVAILABLE_SOURCE|cannot be bound/);
  });

  it('offers a seismic role, so CIRSOC 103 is not a hardcoded tab', () => {
    const seismic = optionsForRole('seismic');
    expect(seismic.length).toBeGreaterThan(0);
    expect(seismic.some((o) => o.nameKey === 'regulations.name.inpres103')).toBe(true);
  });

  it('offers a steel role including CIRSOC 301, honestly unsupported', () => {
    const steel = optionsForRole('steel');
    const c301 = steel.find((o) => o.nameKey === 'regulations.name.cirsoc301');
    expect(c301).toBeDefined();
    expect(c301!.maturity).toBe('UNSUPPORTED');
  });

  it('never marks an unimplemented option as validated', () => {
    for (const o of ROLE_CATALOG) {
      if (o.maturity === 'UNSUPPORTED') expect(o.noteKey, o.adapterId).toBeTruthy();
    }
  });

  it('has a unique adapter id everywhere', () => {
    const ids = ROLE_CATALOG.map((o) => o.adapterId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('classifies load-affecting and design-only roles disjointly', () => {
    for (const r of LOAD_AFFECTING_ROLES) expect(isLoadAffecting(r)).toBe(true);
    for (const r of DESIGN_ONLY_ROLES) expect(isLoadAffecting(r)).toBe(false);
    expect(LOAD_AFFECTING_ROLES.some((r) => DESIGN_ONLY_ROLES.includes(r))).toBe(false);
  });
});

// ─── Bindings ────────────────────────────────────────────────────

describe('role bindings', () => {
  it('seeds a new project with the editions in force', () => {
    const r = defaultRegulations();
    expect(r.concrete.adapterId).toBe('cirsoc');
    expect(teAt(bindingLabel(r.concrete), 'en')).toBe('CIRSOC 201 (2025)');
    expect(r.basis.adapterId).toBe('cirsoc101-2025-basis');
    expect(r.wind.adapterId).toBe('cirsoc102-2025');
    expect(r.concrete.state).toBe('applied');
  });

  it('leaves unseeded roles unset rather than guessing', () => {
    const r = defaultRegulations();
    expect(r.steel.state).toBe('unset');
    expect(r.seismic.adapterId).toBeNull();
  });

  it('refuses to bind an adapter to the wrong role', () => {
    expect(() => bindRole('steel', 'cirsoc')).toThrow(/not an option for role/);
  });

  it('copies the name key so a stored project stays readable', () => {
    // Was written against 'cirsoc-2005', which can no longer be bound. The property under
    // test is the label template, not the edition, so an available option demonstrates it.
    const b = bindRole('concrete', 'cirsoc');
    expect(b.nameKey).toBe('regulations.name.cirsoc201');
    expect(teAt(bindingLabel(b), 'en')).toBe('CIRSOC 201 (2025)');
    expect(teAt(bindingLabel(b), 'es')).toBe('CIRSOC 201 (2025)');
    expect(b.edition).toBe('2025');
  });

  it('marks a new binding pending, not applied', () => {
    expect(bindRole('wind', 'cirsoc102-2025').state).toBe('pending');
  });

  it('marks a binding needing settings as incomplete', () => {
    expect(bindRole('wind', 'cirsoc102-2025').configComplete).toBe(false);
    expect(bindRole('concrete', 'cirsoc').configComplete).toBe(true);
  });
});

// ─── Compatibility ───────────────────────────────────────────────

describe('stack compatibility', () => {
  const withRole = (base: ProjectRegulations, role: keyof ProjectRegulations, id: string) =>
    ({ ...base, [role]: { ...bindRole(role, id), state: 'applied' as const, configComplete: true } });

  function complete(): ProjectRegulations {
    const r = defaultRegulations();
    for (const role of REGULATION_ROLES) {
      if (r[role].adapterId) {
        r[role] = { ...r[role], configComplete: true, adoption: 'national', state: 'applied' };
      }
    }
    return r;
  }

  it('accepts an all-CIRSOC stack', () => {
    expect(validateStack(complete()).ok).toBe(true);
  });

  it('PERMITS CIRSOC loads with Eurocode concrete, but warns', () => {
    // A real thing an engineer may do deliberately; they must own it, not be blocked.
    const r = complete();
    r.concrete = { ...bindRole('concrete', 'eurocode'), configComplete: true, state: 'applied' };
    const v = validateStack(r);
    // Eurocode concrete is UNSUPPORTED here, so it errors on maturity — the family mix
    // itself is only a warning.
    expect(v.problems.some((p) => p.key === 'regulations.problem.materialFamilyDiffers')).toBe(true);
    expect(v.problems.find((p) => p.key === 'regulations.problem.materialFamilyDiffers')!.severity)
      .toBe('warning');
  });

  it('REFUSES an unsupported adapter, because there is nothing behind it', () => {
    const r = withRole(complete(), 'steel', 'cirsoc301-2018');
    const v = validateStack(r);
    expect(v.ok).toBe(false);
    expect(v.problems.some((p) => p.key === 'regulations.problem.unsupportedAdapter')).toBe(true);
  });

  it('REFUSES basis and loads from different families', () => {
    // CIRSOC combination factors on EN 1991 characteristic values is a different
    // reliability level, not a conservative approximation.
    const r = complete();
    r.loads = { ...bindRole('loads', 'en1991-1-1'), configComplete: true, state: 'applied' };
    const v = validateStack(r);
    expect(v.ok).toBe(false);
    const p = v.problems.find((x) => x.key === 'regulations.problem.basisLoadsFamilyMismatch');
    expect(p?.severity).toBe('error');
    expect(p?.roles).toEqual(['basis', 'loads']);
  });

  it('REFUSES a seismic binding with no basis to combine it into', () => {
    const r = complete();
    r.seismic = { ...bindRole('seismic', 'inpres103-2018'), configComplete: true, state: 'applied' };
    r.basis = unsetBinding('basis');
    expect(validateStack(r).problems.some((p) => p.key === 'regulations.problem.seismicNeedsBasis'))
      .toBe(true);
  });

  it('warns about incomplete configuration and unstated adoption', () => {
    const r = defaultRegulations();
    r.wind = bindRole('wind', 'cirsoc102-2025');   // requiresConfig, adoption unstated
    const v = validateStack(r);
    expect(v.problems.some((p) => p.key === 'regulations.problem.configIncomplete')).toBe(true);
    expect(v.problems.some((p) => p.key === 'regulations.problem.adoptionUnstated')).toBe(true);
  });

  it('reports a role usable only when bound, supported and configured', () => {
    const r = complete();
    expect(roleUsable(r, 'concrete')).toBe(true);
    expect(roleUsable(r, 'steel')).toBe(false);          // unset
    r.wind = bindRole('wind', 'cirsoc102-2025');          // incomplete
    expect(roleUsable(r, 'wind')).toBe(false);
  });
});

describe('pending changes', () => {
  it('detects a pending load-affecting change', () => {
    const r = defaultRegulations();
    r.wind = bindRole('wind', 'cirsoc102-2025');
    expect(pendingRoles(r)).toEqual(['wind']);
    expect(pendingRequiresLoadRegeneration(r)).toBe(true);
  });

  it('does not demand load regeneration for a design-only change', () => {
    // The concrete role is design-only whatever it is bound to. A re-bind of the same
    // available adapter is still a pending change, which is what this asserts.
    const r = defaultRegulations();
    r.concrete = bindRole('concrete', 'cirsoc');
    expect(pendingRoles(r)).toEqual(['concrete']);
    expect(pendingRequiresLoadRegeneration(r)).toBe(false);
  });
});

describe('provenance stamps', () => {
  it('stamps every bound role with name, edition and maturity', () => {
    const s = regulationStamps(defaultRegulations());
    const roles = s.map((x) => x.role);
    expect(roles).toContain('concrete');
    expect(roles).toContain('wind');
    expect(roles).not.toContain('steel');   // unset
    const conc = s.find((x) => x.role === 'concrete')!;
    expect(teAt(conc.label, 'en')).toBe('CIRSOC 201 (2025)');
    expect(conc.maturity).toBe('VALIDATED');
  });

  it('carries the legal instrument where the registry knows one', () => {
    const conc = regulationStamps(defaultRegulations()).find((x) => x.role === 'concrete')!;
    expect(conc.inForce).toMatch(/11\/2026/);
  });
});

// ─── Migration ───────────────────────────────────────────────────

describe('migration from the CIRSOC-specific v1 shape', () => {
  it('maps the three edition fields onto role bindings', () => {
    const m = migrateRegulations({
      version: 1, concreteEdition: '2005', loadEdition: '2025', windEdition: '2005',
      jurisdiction: { name: 'CABA', basis: 'adopted' },
      concrete: { maxAggregateSizeMm: 19, shotcrete: false },
    });
    // A v1 project naming a 2005 edition is bound to the edition IN FORCE and told, because
    // none of the 2005 texts are supplied and their rules are therefore not implemented. No
    // migration workflow is offered: results stored under 2005 came from rules the app no
    // longer applies, so re-running is the only honest outcome. This holds for the load and
    // wind roles exactly as it does for concrete — 101-2005 and 102-2005 are reserved, and
    // binding one would mean a project labelled 2005 running the 2025 rules.
    expect(m.stored.roles.concrete.adapterId).toBe('cirsoc');
    expect(m.stored.roles.concrete.edition).toBe('2025');
    const withdrawn = m.notices.filter(
      (n) => n.key === 'regulations.migration.editionWithdrawn');
    expect(withdrawn.map((n) => n.params?.role)).toEqual(['concrete', 'wind']);
    for (const n of withdrawn) expect(n.params?.edition).toBe('2005');
    expect(m.stored.roles.basis.adapterId).toBe('cirsoc101-2025-basis');
    expect(m.stored.roles.wind.adapterId).toBe('cirsoc102-2025');
    expect(m.stored.roles.wind.edition).toBe('2025');
    expect(m.stored.roles.concrete.jurisdiction).toBe('CABA');
    expect(m.stored.roles.concrete.adoption).toBe('adopted');
  });

  it('unsets a stored role bound to an edition that has since been withdrawn', () => {
    // The role-shaped loader path, distinct from the v1 path above.
    const m = migrateRegulations({
      version: 2,
      roles: { concrete: { adapterId: 'cirsoc-2005', state: 'applied' } },
    });
    expect(m.stored.roles.concrete.adapterId).toBeNull();
    expect(m.stored.roles.concrete.state).toBe('unset');
    expect(m.notices.map((n) => n.key))
      .toContain('regulations.migration.editionWithdrawn');
  });

  it('rescues the aggregate size for the MATERIAL to adopt, not the regulation', () => {
    // The value belongs to the concrete mixture; the regulation panel must not own it.
    const m = migrateRegulations({ version: 1, concrete: { maxAggregateSizeMm: 19 } });
    expect(m.rescuedAggregateMm).toBe(19);
    expect(m.notices.some((n) => n.key === 'regulations.migration.aggregateMoved')).toBe(true);
  });

  it('round-trips the role shape', () => {
    const original = defaultRegulations();
    original.seismic = { ...bindRole('seismic', 'inpres103-2018'), configComplete: true };
    const wire = JSON.parse(JSON.stringify({ version: 2, roles: original }));
    const back = migrateRegulations(wire).stored.roles;
    expect(back.seismic.adapterId).toBe('inpres103-2018');
    expect(teAt(bindingLabel(back.concrete), 'en')).toBe('CIRSOC 201 (2025)');
  });

  it('defaults a missing or corrupt payload without throwing', () => {
    expect(migrateRegulations(undefined).stored.roles.concrete.adapterId).toBe('cirsoc');
    expect(migrateRegulations('nonsense').stored.roles.concrete.adapterId).toBe('cirsoc');
  });

  it('drops an unknown adapter id rather than trusting it', () => {
    const back = migrateRegulations({
      version: 2, roles: { ...defaultRegulations(), concrete: { adapterId: 'made-up' } },
    }).stored.roles;
    expect(back.concrete.adapterId).toBeNull();
  });
});

// ─── Revision graph ──────────────────────────────────────────────

describe('revision dependency graph', () => {
  it('knows what each stage consumes', () => {
    expect(dependenciesOf('analysis')).toEqual(['combination']);
    expect(dependenciesOf('design')).toContain('analysis');
    expect(dependenciesOf('design')).toContain('materialSpec');
    expect(dependenciesOf('regulationConfig')).toEqual([]);
  });

  it('propagates transitively from a regulation change to documents', () => {
    const d = downstreamOf('regulationConfig');
    for (const s of ['loadDefinition', 'generatedLoad', 'combination', 'analysis',
      'design', 'reinforcement', 'detailing', 'document']) {
      expect(d, s).toContain(s);
    }
  });

  it('does NOT put analysis downstream of materialSpec', () => {
    // Changing the concrete grade does not move the forces in a linear elastic model.
    // This edge is what makes an aggregate-size change cost a detailing re-run, not a solve.
    expect(downstreamOf('materialSpec')).not.toContain('analysis');
    expect(dependsOn('analysis', 'materialSpec')).toBe(false);
    expect(dependsOn('reinforcement', 'materialSpec')).toBe(true);
  });

  it('returns stages in dependency order', () => {
    const d = downstreamOf('generatedLoad');
    expect(d.indexOf('combination')).toBeLessThan(d.indexOf('analysis'));
    expect(d.indexOf('analysis')).toBeLessThan(d.indexOf('design'));
  });

  it('bumps a stage and everything after it', () => {
    const r = bump(emptyRevisions(), 'combination');
    expect(r.combination).toBe(1);
    expect(r.analysis).toBe(1);
    expect(r.document).toBe(1);
    expect(r.loadDefinition).toBe(0);       // upstream untouched
    expect(r.materialSpec).toBe(0);
  });

  it('preserves an unaffected subtree when asked', () => {
    const r = bumpPreserving(emptyRevisions(), 'design',
      ['loadDefinition', 'generatedLoad', 'combination', 'analysis']);
    expect(r.design).toBe(1);
    expect(r.reinforcement).toBe(1);
    expect(r.analysis).toBe(0);
  });

  it('refuses to preserve a stage that directly depends on the bumped one', () => {
    // Preserving it would leave a stale result presented as current.
    expect(() => bumpPreserving(emptyRevisions(), 'design', ['reinforcement']))
      .toThrow(/depends on it directly/);
  });
});

describe('freshness', () => {
  it('reports absent for output that was never produced', () => {
    expect(freshness(null, emptyRevisions()).state).toBe('absent');
  });

  it('reports fresh immediately after production', () => {
    const rev = emptyRevisions();
    expect(freshness(stamp('design', rev), rev).state).toBe('fresh');
  });

  it('reports stale, and names what moved', () => {
    const rev = emptyRevisions();
    const s = stamp('design', rev);
    const after = bump(rev, 'combination');
    const f = freshness(s, after);
    expect(f.state).toBe('stale');
    expect(f.changed).toContain('analysis');
  });

  it('stays fresh when an unrelated stage moves', () => {
    const rev = emptyRevisions();
    const s = stamp('analysis', rev);
    const after = bump(rev, 'materialSpec');
    expect(freshness(s, after).state).toBe('fresh');
  });

  it('goes stale when the stage itself is bumped', () => {
    const rev = emptyRevisions();
    const s = stamp('detailing', rev);
    expect(freshness(s, bump(rev, 'detailing')).state).toBe('stale');
  });
});

describe('change consequences — the honest answer to "why did my results go away?"', () => {
  it('a load-regulation change requires a new solve', () => {
    const c = consequenceOf('loadRegulation');
    expect(c.requiresSolve).toBe(true);
    expect(c.invalidated).toContain('analysis');
    expect(c.invalidated).toContain('document');
  });

  it('a design-regulation change preserves the forces and does NOT require a solve', () => {
    const c = consequenceOf('designRegulation');
    expect(c.requiresSolve).toBe(false);
    expect(c.preserved).toContain('analysis');
    expect(c.invalidated).toContain('design');
    expect(c.invalidated).toContain('detailing');
    expect(c.invalidated).not.toContain('analysis');
  });

  it('a detailing-only change preserves even the design', () => {
    // Aggregate size changes whether bars fit, not what the section can carry.
    const c = consequenceOf('detailingSpec');
    expect(c.requiresSolve).toBe(false);
    expect(c.preserved).toContain('design');
    expect(c.preserved).toContain('analysis');
    expect(c.invalidated).toEqual(['reinforcement', 'detailing', 'document']);
  });

  it('a manual reinforcement edit invalidates only detailing and documents', () => {
    const c = consequenceOf('reinforcementEdit');
    expect(c.invalidated).toEqual(['detailing', 'document']);
    expect(c.requiresSolve).toBe(false);
  });

  it('every consequence carries an i18n explanation key', () => {
    for (const k of ['loadRegulation', 'designRegulation', 'materialSpec',
      'detailingSpec', 'loadEdit', 'reinforcementEdit'] as const) {
      expect(consequenceOf(k).explanationKey).toMatch(/^revisions\.consequence\./);
    }
  });

  it('applyChange moves the vector exactly as the consequence says', () => {
    const { revisions, consequence } = applyChange(emptyRevisions(), 'detailingSpec');
    expect(consequence.requiresSolve).toBe(false);
    expect(revisions.analysis).toBe(0);
    expect(revisions.design).toBe(0);
    expect(revisions.reinforcement).toBe(1);
    expect(revisions.detailing).toBe(1);
    expect(revisions.document).toBe(1);
  });

  it('applyChange for a load regulation bumps everything downstream', () => {
    const { revisions } = applyChange(emptyRevisions(), 'loadRegulation');
    expect(revisions.regulationConfig).toBe(1);
    expect(revisions.analysis).toBe(1);
    expect(revisions.document).toBe(1);
  });

  it('covers every stage in REVISION_STAGES', () => {
    expect(REVISION_STAGES.length).toBe(10);
    const rev = emptyRevisions();
    for (const s of REVISION_STAGES) expect(rev[s]).toBe(0);
  });
});
