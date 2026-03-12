<script lang="ts">
  import { modelStore, resultsStore, uiStore, verificationStore } from '../../lib/store';
  import type { SolverDiagnostic } from '../../lib/engine/types';
  import { verifyElement, classifyElement, REBAR_DB, computeJointPsiFromModel } from '../../lib/engine/codes/argentina/cirsoc201';
  import type { ElementVerification, VerificationInput } from '../../lib/engine/codes/argentina/cirsoc201';
  import { generateCrossSectionSvg, generateBeamElevationSvg, generateColumnElevationSvg, generateJointDetailSvg, generateSlabReinforcementSvg, designSlabReinforcement } from '../../lib/engine/reinforcement-svg';
  import type { SlabDesignResult } from '../../lib/engine/reinforcement-svg';
  import { checkCrackWidth, checkDeflection } from '../../lib/engine/codes/argentina/serviceability';
  import type { CrackResult, DeflectionResult } from '../../lib/engine/codes/argentina/serviceability';
  import { computeQuantities } from '../../lib/engine/quantity-takeoff';
  import type { QuantitySummary } from '../../lib/engine/quantity-takeoff';
  import { verifySteelElement } from '../../lib/engine/codes/argentina/cirsoc301';
  import type { SteelVerification, SteelVerificationInput, SteelDesignParams } from '../../lib/engine/codes/argentina/cirsoc301';
  import { generateInteractionDiagram, generateInteractionSvg } from '../../lib/engine/codes/argentina/interaction-diagram';
  import type { DiagramParams } from '../../lib/engine/codes/argentina/interaction-diagram';
  import { isDesignCheckAvailable, checkSteelMembers, checkRcMembers, checkEc2Members, checkEc3Members, checkTimberMembers, checkMasonryMembers, checkCfsMembers, checkBoltGroups, checkWeldGroups, checkSpreadFootings } from '../../lib/engine/wasm-solver';
  import { t } from '../../lib/i18n';

  /** Normative code options for design checks */
  type NormativeCode = 'cirsoc' | 'aci-aisc' | 'eurocode' | 'nds' | 'masonry' | 'cfs';

  const normativeOptions: { value: NormativeCode; label: string; wasmKeys: string[] }[] = [
    { value: 'cirsoc', label: 'CIRSOC 201/301', wasmKeys: [] },
    { value: 'aci-aisc', label: 'ACI 318 / AISC 360', wasmKeys: ['rcMembers', 'steelMembers'] },
    { value: 'eurocode', label: 'Eurocode 2/3', wasmKeys: ['ec2Members', 'ec3Members'] },
    { value: 'nds', label: 'NDS (Madera)', wasmKeys: ['timberMembers'] },
    { value: 'masonry', label: 'Mampostería', wasmKeys: ['masonryMembers'] },
    { value: 'cfs', label: 'CFS (Conformado en frío)', wasmKeys: ['cfsMembers'] },
  ];

  let { verifications = $bindable([]) }: { verifications: ElementVerification[] } = $props();
  let expandedId = $state<number | null>(null);
  let expandedSteelId = $state<number | null>(null);
  let rebarFy = $state(420);    // MPa — default ADN 420
  let cover = $state(0.025);    // m — default 2.5cm
  let stirrupDia = $state(8);   // mm
  let verifyError = $state<string | null>(null);
  let exposure = $state<'interior' | 'exterior'>('interior');
  let selectedNormative = $state<NormativeCode>('cirsoc');

  /** Whether the selected normative code has its WASM checks compiled */
  const selectedNormativeAvailable = $derived(() => {
    const opt = normativeOptions.find(o => o.value === selectedNormative);
    if (!opt || opt.wasmKeys.length === 0) return true; // CIRSOC uses JS, always available
    return opt.wasmKeys.every(k => isDesignCheckAvailable(k));
  });

  const isCirsocSelected = $derived(selectedNormative === 'cirsoc');

  // Store serviceability results per element
  let crackResults = $state<Map<number, CrackResult>>(new Map());
  let deflectionResults = $state<Map<number, DeflectionResult>>(new Map());
  let quantities = $state<QuantitySummary | null>(null);

  // Steel verification results (CIRSOC 301)
  let steelVerifications = $state<SteelVerification[]>([]);

  // Element lengths for elevation views
  let elementLengthMap = $state<Map<number, number>>(new Map());

  // Slab reinforcement results
  let slabDesigns = $state<Array<{ quadId: number; spanX: number; spanZ: number; thickness: number; fc: number; designX: SlabDesignResult; designZ: SlabDesignResult }>>([]);

  // Story drift results
  interface StoryDriftResult {
    level: number;      // floor elevation (m)
    height: number;     // story height (m)
    driftX: number;     // max lateral displacement X (m)
    driftZ: number;     // max lateral displacement Z (m)
    ratioX: number;     // drift ratio Δ/h
    ratioZ: number;
    status: 'ok' | 'warn' | 'fail';
  }
  let storyDrifts = $state<StoryDriftResult[]>([]);
  const driftLimit = 0.015; // CIRSOC 103 §5.2.8: 0.015 for RC, 0.020 for steel

  // Detail view tabs
  type DetailSection = 'verification' | 'detailing' | 'schedule' | 'slabs' | 'drift' | 'connections';
  let activeSection = $state<DetailSection>('verification');

  const results = $derived(resultsStore.results3D);
  const hasResults = $derived(results !== null);
  const hasEnvelope = $derived(resultsStore.hasCombinations3D);

  interface EnvelopeSolicitations {
    Mu: number; Vu: number; Nu: number;
    Muy: number; Vz: number; Tu: number;
  }

  /** Get max absolute solicitations for an element across all combination results */
  function getEnvelopeSolicitations(elemId: number): EnvelopeSolicitations | null {
    const envelope = resultsStore.fullEnvelope3D;
    if (!envelope) return null;

    const envForces = envelope.maxAbsResults3D.elementForces.find(ef => ef.elementId === elemId);
    if (!envForces) return null;

    return {
      Mu: Math.max(Math.abs(envForces.mzStart), Math.abs(envForces.mzEnd)),
      Vu: Math.max(Math.abs(envForces.vyStart), Math.abs(envForces.vyEnd)),
      Nu: Math.max(Math.abs(envForces.nStart), Math.abs(envForces.nEnd)),
      Muy: Math.max(Math.abs(envForces.myStart), Math.abs(envForces.myEnd)),
      Vz: Math.max(Math.abs(envForces.vzStart), Math.abs(envForces.vzEnd)),
      Tu: Math.max(Math.abs(envForces.mxStart), Math.abs(envForces.mxEnd)),
    };
  }

  /** Build generic check payload from model data for WASM-based design checks */
  function buildWasmCheckPayload() {
    if (!results) return null;
    const members: any[] = [];
    for (const ef of results.elementForces) {
      const elem = modelStore.elements.get(ef.elementId);
      if (!elem) continue;
      const sec = modelStore.sections.get(elem.sectionId);
      const mat = modelStore.materials.get(elem.materialId);
      const nI = modelStore.nodes.get(elem.nodeI);
      const nJ = modelStore.nodes.get(elem.nodeJ);
      if (!sec || !mat || !nI || !nJ) continue;
      const dx = nJ.x - nI.x, dy = nJ.y - nI.y, dz = (nJ.z ?? 0) - (nI.z ?? 0);
      const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
      members.push({
        elementId: ef.elementId,
        length: L,
        section: { b: sec.b, h: sec.h, a: sec.a, iz: sec.iz, iy: sec.iy, profileName: sec.profileName },
        material: { e: mat.e, fy: mat.fy, fu: mat.fu, rho: mat.rho },
        forces: {
          nStart: ef.nStart, nEnd: ef.nEnd,
          vyStart: ef.vyStart, vyEnd: ef.vyEnd,
          vzStart: ef.vzStart, vzEnd: ef.vzEnd,
          mzStart: ef.mzStart, mzEnd: ef.mzEnd,
          myStart: ef.myStart, myEnd: ef.myEnd,
          mxStart: ef.mxStart, mxEnd: ef.mxEnd,
        },
      });
    }
    return { members };
  }

  // Store WASM-based verification results for non-CIRSOC codes
  let wasmCheckResults = $state<any[] | null>(null);

  function runVerification() {
    verifyError = null;
    wasmCheckResults = null;
    if (!results) {
      verifyError = t('pro.solveFirst');
      return;
    }

    // If non-CIRSOC code selected, dispatch to WASM
    if (!isCirsocSelected) {
      const payload = buildWasmCheckPayload();
      if (!payload) { verifyError = t('pro.solveFirst'); return; }
      let checkResult: any = null;
      try {
        switch (selectedNormative) {
          case 'aci-aisc':
            checkResult = checkRcMembers(payload) ?? checkSteelMembers(payload);
            break;
          case 'eurocode':
            checkResult = checkEc2Members(payload) ?? checkEc3Members(payload);
            break;
          case 'nds':
            checkResult = checkTimberMembers(payload);
            break;
          case 'masonry':
            checkResult = checkMasonryMembers(payload);
            break;
          case 'cfs':
            checkResult = checkCfsMembers(payload);
            break;
        }
      } catch (e: any) {
        verifyError = e.message || t('pro.wasmCheckError');
        return;
      }
      if (checkResult && Array.isArray(checkResult.members)) {
        wasmCheckResults = checkResult.members;
      } else if (checkResult) {
        wasmCheckResults = [checkResult];
      } else {
        verifyError = t('pro.wasmCheckUnavailable');
      }
      return;
    }

    const verifs: ElementVerification[] = [];
    const useEnvelope = hasEnvelope;
    const lengths = new Map<number, number>();

    for (const ef of results.elementForces) {
      const elem = modelStore.elements.get(ef.elementId);
      if (!elem) continue;

      // Compute element length
      const nodeI = modelStore.nodes.get(elem.nodeI);
      const nodeJ = modelStore.nodes.get(elem.nodeJ);
      if (!nodeI || !nodeJ) continue;
      const dx = nodeJ.x - nodeI.x;
      const dy = nodeJ.y - nodeI.y;
      const dz = (nodeJ.z ?? 0) - (nodeI.z ?? 0);
      const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
      lengths.set(ef.elementId, L);

      const section = modelStore.sections.get(elem.sectionId);
      const material = modelStore.materials.get(elem.materialId);
      if (!section || !material) continue;

      // Only verify concrete sections (need b and h)
      if (!section.b || !section.h) continue;
      // Need f'c from material
      const fc = material.fy;
      if (!fc || fc > 80) continue; // skip if no f'c or if it's steel (fy > 80 MPa means it's steel)

      // Classify as beam, column, or wall (reuse nodeI/nodeJ from above)
      const elemType = classifyElement(
        nodeI.x, nodeI.y, nodeI.z ?? 0,
        nodeJ.x, nodeJ.y, nodeJ.z ?? 0,
        section.b, section.h,
      );

      // Extract max solicitations — from envelope if available, otherwise from single result
      let MuMax: number, VuMax: number, NuMax: number;
      let MuyMax = 0, VzMax = 0, TuMax = 0;
      const envSol = useEnvelope ? getEnvelopeSolicitations(ef.elementId) : null;
      if (envSol) {
        MuMax = envSol.Mu;
        VuMax = envSol.Vu;
        NuMax = envSol.Nu;
        MuyMax = envSol.Muy;
        VzMax = envSol.Vz;
        TuMax = envSol.Tu;
      } else {
        MuMax = Math.max(Math.abs(ef.mzStart), Math.abs(ef.mzEnd));
        VuMax = Math.max(Math.abs(ef.vyStart), Math.abs(ef.vyEnd));
        NuMax = Math.max(Math.abs(ef.nStart), Math.abs(ef.nEnd));
        MuyMax = Math.max(Math.abs(ef.myStart), Math.abs(ef.myEnd));
        VzMax = Math.max(Math.abs(ef.vzStart), Math.abs(ef.vzEnd));
        TuMax = Math.max(Math.abs(ef.mxStart), Math.abs(ef.mxEnd));
      }

      // Unsupported length for columns/walls = element length
      const isVertical = elemType === 'column' || elemType === 'wall';
      const Lu = isVertical ? L : undefined;

      // For slender columns: extract M1 (smaller) and M2 (larger) end moments with sign
      let M1: number | undefined;
      let M2: number | undefined;
      if (isVertical) {
        const mzI = ef.mzStart;
        const mzJ = ef.mzEnd;
        if (Math.abs(mzI) >= Math.abs(mzJ)) {
          M2 = Math.abs(mzI);
          // M1 positive if same curvature (same sign), negative if reverse
          M1 = Math.sign(mzI) === Math.sign(mzJ) ? Math.abs(mzJ) : -Math.abs(mzJ);
        } else {
          M2 = Math.abs(mzJ);
          M1 = Math.sign(mzI) === Math.sign(mzJ) ? Math.abs(mzI) : -Math.abs(mzI);
        }
      }

      // Auto-compute Ψ from model topology for columns
      let psiA: number | undefined;
      let psiB: number | undefined;
      if (isVertical) {
        const psi = computeJointPsiFromModel(
          ef.elementId,
          modelStore.nodes as Map<number, { id: number; x: number; y: number; z?: number }>,
          modelStore.elements as Map<number, { id: number; nodeI: number; nodeJ: number; materialId: number; sectionId: number; hingeStart: boolean; hingeEnd: boolean }>,
          modelStore.sections as Map<number, { id: number; iz: number; iy?: number; b?: number; h?: number }>,
          modelStore.materials as Map<number, { id: number; e: number }>,
          modelStore.supports as Map<number, { nodeId: number; type?: string }>,
        );
        psiA = psi.psiA;
        psiB = psi.psiB;
      }

      const input: VerificationInput = {
        elementId: ef.elementId,
        elementType: elemType,
        Mu: MuMax,
        Vu: VuMax,
        Nu: NuMax,
        b: section.b,
        h: section.h,
        fc,
        fy: rebarFy,
        cover,
        stirrupDia,
        Muy: isVertical ? MuyMax : undefined,
        Vz: VzMax > 0.01 ? VzMax : undefined,
        Tu: TuMax > 0.001 ? TuMax : undefined,
        Lu,
        M1,
        M2,
        psiA,
        psiB,
      };

      verifs.push(verifyElement(input));
    }

    // Steel verification (CIRSOC 301) — elements with fy > 80 MPa
    const steelVerifs: SteelVerification[] = [];
    for (const ef of results.elementForces) {
      const elem = modelStore.elements.get(ef.elementId);
      if (!elem) continue;

      const section = modelStore.sections.get(elem.sectionId);
      const material = modelStore.materials.get(elem.materialId);
      if (!section || !material) continue;

      // Steel: fy > 80 MPa
      if (!material.fy || material.fy <= 80) continue;

      const nodeI = modelStore.nodes.get(elem.nodeI);
      const nodeJ = modelStore.nodes.get(elem.nodeJ);
      if (!nodeI || !nodeJ) continue;

      const dx = nodeJ.x - nodeI.x;
      const dy = nodeJ.y - nodeI.y;
      const dz = (nodeJ.z ?? 0) - (nodeI.z ?? 0);
      const elementLength = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (elementLength <= 0) continue;

      // Extract solicitations
      let NuMax: number, MuzMax: number, MuyMax: number, VuMax: number;
      const envSol = useEnvelope ? getEnvelopeSolicitations(ef.elementId) : null;
      if (envSol) {
        NuMax = envSol.Nu;
        MuzMax = envSol.Mu;
        MuyMax = envSol.Muy;
        VuMax = envSol.Vu;
      } else {
        NuMax = Math.max(Math.abs(ef.nStart), Math.abs(ef.nEnd));
        MuzMax = Math.max(Math.abs(ef.mzStart), Math.abs(ef.mzEnd));
        MuyMax = Math.max(Math.abs(ef.myStart), Math.abs(ef.myEnd));
        VuMax = Math.max(Math.abs(ef.vyStart), Math.abs(ef.vyEnd));
      }

      const sdp: SteelDesignParams = {
        Fy: material.fy,
        Fu: material.fu ?? material.fy * 1.25,
        E: material.e,
        A: section.a,
        Iz: section.iz,
        Iy: section.iy,
        h: section.h ?? 0.3,
        b: section.b ?? 0.15,
        tw: section.tw ?? (section.b ? section.b / 10 : 0.01),
        tf: section.tf ?? (section.b ? section.b / 15 : 0.01),
        L: elementLength,
        Lb: elementLength,
        J: section.j ?? 0,
      };

      const steelInput: SteelVerificationInput = {
        elementId: ef.elementId,
        Nu: NuMax,
        Muy: MuyMax,
        Muz: MuzMax,
        Vu: VuMax,
        params: sdp,
      };

      steelVerifs.push(verifySteelElement(steelInput));
    }
    steelVerifications = steelVerifs;

    // Check if there are any verifiable elements (including quads/plates for slabs)
    const hasQuads = results.quadStresses && results.quadStresses.length > 0;
    if (verifs.length === 0 && steelVerifs.length === 0 && !hasQuads) {
      verifyError = t('pro.noVerifiableElems');
      return;
    }

    // Serviceability checks (crack width for beams)
    const newCracks = new Map<number, CrackResult>();
    const newDefl = new Map<number, DeflectionResult>();
    for (const v of verifs) {
      if (v.elementType === 'beam') {
        // Service moment ≈ Mu / 1.4 (approximate unfactoring)
        const Ms = v.Mu / 1.4;
        const crack = checkCrackWidth(
          v.b, v.h, v.flexure.d,
          v.flexure.AsProv, Ms,
          v.cover, v.flexure.barDia, v.flexure.barCount,
          exposure,
        );
        newCracks.set(v.elementId, crack);

        // Deflection check: get max displacement from results
        const elem = modelStore.elements.get(v.elementId);
        if (elem) {
          const nodeI = modelStore.nodes.get(elem.nodeI);
          const nodeJ = modelStore.nodes.get(elem.nodeJ);
          if (nodeI && nodeJ) {
            const dx = nodeJ.x - nodeI.x;
            const dy = nodeJ.y - nodeI.y;
            const dz = (nodeJ.z ?? 0) - (nodeI.z ?? 0);
            const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
            // Get max vertical displacement from either end node
            const di = results!.displacements.find(d => d.nodeId === elem.nodeI);
            const dj = results!.displacements.find(d => d.nodeId === elem.nodeJ);
            const maxDisp = Math.max(
              Math.abs(di?.uy ?? 0), Math.abs(dj?.uy ?? 0),
              Math.abs(di?.uz ?? 0), Math.abs(dj?.uz ?? 0),
            );
            if (L > 0 && maxDisp > 0) {
              newDefl.set(v.elementId, checkDeflection(L, maxDisp));
            }
          }
        }
      }
    }
    crackResults = newCracks;
    deflectionResults = newDefl;

    // Store lengths for elevation views
    elementLengthMap = lengths;

    // Compute material quantities
    quantities = computeQuantities(verifs, lengths);

    // Design slab reinforcement from quad stresses
    const slabResults: typeof slabDesigns = [];
    if (results.quadStresses && results.quadStresses.length > 0) {
      // Group quads by unique geometry (spanX × spanZ × thickness)
      const processedGeom = new Set<string>();
      for (const qs of results.quadStresses) {
        const quad = modelStore.quads.get(qs.elementId);
        if (!quad) continue;
        const mat = modelStore.materials.get(quad.materialId);
        if (!mat) continue;
        const fc = mat.fy ?? 30;

        // Compute span from node positions
        const qNodes = quad.nodes.map(nid => modelStore.nodes.get(nid)).filter(Boolean) as Array<{x:number;y:number;z?:number}>;
        if (qNodes.length < 4) continue;
        const xVals = qNodes.map(n => n.x);
        const zVals = qNodes.map(n => n.z ?? 0);
        const spanX = Math.max(...xVals) - Math.min(...xVals);
        const spanZ = Math.max(...zVals) - Math.min(...zVals);
        if (spanX < 0.1 || spanZ < 0.1) continue;

        // Deduplicate by approximate geometry
        const key = `${spanX.toFixed(1)}_${spanZ.toFixed(1)}_${quad.thickness.toFixed(2)}`;
        if (processedGeom.has(key)) continue;
        processedGeom.add(key);

        const designX = designSlabReinforcement(qs.mx, quad.thickness, fc, rebarFy, cover, 'X');
        const designZ = designSlabReinforcement(qs.my, quad.thickness, fc, rebarFy, cover, 'Z');
        slabResults.push({
          quadId: qs.elementId, spanX, spanZ,
          thickness: quad.thickness, fc,
          designX, designZ,
        });
      }
    }
    slabDesigns = slabResults;

    // ─── Story drift computation ───
    const drifts: StoryDriftResult[] = [];
    if (results) {
      // Group nodes by Y elevation (story level)
      const yTol = 0.05; // 5cm tolerance
      const yLevels: number[] = [];
      for (const [, node] of modelStore.nodes) {
        const y = node.y;
        if (!yLevels.some(lv => Math.abs(lv - y) < yTol)) {
          yLevels.push(y);
        }
      }
      yLevels.sort((a, b) => a - b);

      if (yLevels.length >= 2) {
        // For each level (except base), compute max lateral drift
        for (let i = 1; i < yLevels.length; i++) {
          const level = yLevels[i];
          const prevLevel = yLevels[i - 1];
          const storyH = level - prevLevel;
          if (storyH < 0.1) continue;

          // Find max horizontal displacements at this level and previous
          let maxUxCur = 0, maxUzCur = 0;
          let maxUxPrev = 0, maxUzPrev = 0;
          for (const d of results.displacements) {
            const node = modelStore.nodes.get(d.nodeId);
            if (!node) continue;
            if (Math.abs(node.y - level) < yTol) {
              maxUxCur = Math.max(maxUxCur, Math.abs(d.ux));
              maxUzCur = Math.max(maxUzCur, Math.abs(d.uz));
            } else if (Math.abs(node.y - prevLevel) < yTol) {
              maxUxPrev = Math.max(maxUxPrev, Math.abs(d.ux));
              maxUzPrev = Math.max(maxUzPrev, Math.abs(d.uz));
            }
          }
          const deltaX = Math.abs(maxUxCur - maxUxPrev);
          const deltaZ = Math.abs(maxUzCur - maxUzPrev);
          const ratioX = deltaX / storyH;
          const ratioZ = deltaZ / storyH;
          const maxRatio = Math.max(ratioX, ratioZ);

          drifts.push({
            level,
            height: storyH,
            driftX: deltaX,
            driftZ: deltaZ,
            ratioX,
            ratioZ,
            status: maxRatio > driftLimit ? 'fail' : maxRatio > driftLimit * 0.8 ? 'warn' : 'ok',
          });
        }
      }
    }
    storyDrifts = drifts;

    verifications = verifs;

    // Update global verification store for 3D color mapping
    verificationStore.setConcrete(verifs);
    verificationStore.setSteel(steelVerifs);

    // Collect all diagnostics from verifications and push to results store
    const allDiags: SolverDiagnostic[] = [];
    for (const v of verifs) {
      if (v.diagnostics) allDiags.push(...v.diagnostics);
    }
    for (const sv of steelVerifs) {
      if (sv.diagnostics) allDiags.push(...sv.diagnostics);
    }
    for (const [, cr] of newCracks) {
      if (cr.diagnostics) allDiags.push(...cr.diagnostics);
    }
    for (const [, dr] of newDefl) {
      if (dr.diagnostics) allDiags.push(...dr.diagnostics);
    }
    if (allDiags.length > 0) {
      resultsStore.addDiagnostics(allDiags, true);
    }
  }

  // ─── Connection checks (Bolt/Weld/Footing) ────────────────

  // Bolt group
  let boltDia = $state(20);      // mm
  let boltGrade = $state<'4.6' | '8.8' | '10.9'>('8.8');
  let boltCount = $state(4);
  let boltGauge = $state(60);    // mm
  let boltPitch = $state(80);    // mm
  let boltShearForce = $state(100); // kN
  let boltTensionForce = $state(0); // kN
  let boltResult = $state<any | null>(null);

  function handleBoltCheck() {
    try {
      boltResult = checkBoltGroups({
        diameter: boltDia,
        grade: boltGrade,
        count: boltCount,
        gauge: boltGauge,
        pitch: boltPitch,
        shearForce: boltShearForce,
        tensionForce: boltTensionForce,
      });
    } catch (e: any) {
      verifyError = `Bulones: ${e.message ?? 'Error'}`;
    }
  }

  // Weld group
  let weldType = $state<'fillet' | 'groove'>('fillet');
  let weldSize = $state(6);      // mm
  let weldLength = $state(200);  // mm
  let weldElectrode = $state(490); // MPa (E70xx)
  let weldShear = $state(100);   // kN
  let weldResult = $state<any | null>(null);

  function handleWeldCheck() {
    try {
      weldResult = checkWeldGroups({
        type: weldType,
        size: weldSize,
        length: weldLength,
        electrodeStrength: weldElectrode,
        shearForce: weldShear,
      });
    } catch (e: any) {
      verifyError = `Soldadura: ${e.message ?? 'Error'}`;
    }
  }

  // Spread footing
  let footB = $state(1.5);       // m
  let footL = $state(1.5);       // m
  let footH = $state(0.5);       // m
  let footFc = $state(25);       // MPa
  let footSigmaAdm = $state(200); // kPa
  let footNu = $state(500);      // kN
  let footMu = $state(50);       // kN·m
  let footResult = $state<any | null>(null);

  function handleFootingCheck() {
    try {
      footResult = checkSpreadFootings({
        width: footB,
        length: footL,
        depth: footH,
        fc: footFc,
        allowableBearing: footSigmaAdm,
        axialLoad: footNu,
        moment: footMu,
      });
    } catch (e: any) {
      verifyError = `Fundación: ${e.message ?? 'Error'}`;
    }
  }

  function toggleExpand(id: number) {
    expandedId = expandedId === id ? null : id;
  }

  function toggleSteelExpand(id: number) {
    expandedSteelId = expandedSteelId === id ? null : id;
  }

  /** Activate verification color map on 3D model */
  function showOnModel() {
    resultsStore.diagramType = 'verification';
  }

  /** Select element in 3D viewport when clicking verification row */
  function selectElementInViewport(elementId: number) {
    uiStore.selectElement(elementId, false);
  }

  function statusIcon(s: 'ok' | 'fail' | 'warn'): string {
    if (s === 'ok') return '✓';
    if (s === 'fail') return '✗';
    return '⚠';
  }

  function statusClass(s: 'ok' | 'fail' | 'warn'): string {
    if (s === 'ok') return 'status-ok';
    if (s === 'fail') return 'status-fail';
    return 'status-warn';
  }

  function fmtNum(n: number): string {
    if (Math.abs(n) < 0.01) return '0';
    return n.toFixed(2);
  }

  const countOk = $derived(verifications.filter(v => v.overallStatus === 'ok').length + steelVerifications.filter(v => v.overallStatus === 'ok').length);
  const countFail = $derived(verifications.filter(v => v.overallStatus === 'fail').length + steelVerifications.filter(v => v.overallStatus === 'fail').length);
  const countWarn = $derived(verifications.filter(v => v.overallStatus === 'warn').length + steelVerifications.filter(v => v.overallStatus === 'warn').length);

  // Rebar schedule: group by identical reinforcement design and track element IDs
  interface RebarScheduleEntry {
    sectionName: string;
    elementType: 'beam' | 'column' | 'wall';
    elementIds: number[];
    b: number; h: number;
    mainBars: string;
    stirrups: string;
    totalAsPerElem: number; // cm² per element
  }
  const rebarSchedule = $derived.by(() => {
    const groups = new Map<string, RebarScheduleEntry>();
    for (const v of verifications) {
      const mainBars = v.column ? v.column.bars : v.flexure.bars;
      const stirrups = `eØ${v.shear.stirrupDia} c/${(v.shear.spacing * 100).toFixed(0)}`;
      // Group by identical reinforcement: same type + dimensions + bars + stirrups
      const key = `${v.elementType}_${(v.b*100).toFixed(0)}x${(v.h*100).toFixed(0)}_${mainBars}_${stirrups}`;
      const existing = groups.get(key);
      if (existing) {
        existing.elementIds.push(v.elementId);
      } else {
        const sec = modelStore.sections.get(
          modelStore.elements.get(v.elementId)?.sectionId ?? 0
        );
        groups.set(key, {
          sectionName: sec?.name ?? `${(v.b*100).toFixed(0)}×${(v.h*100).toFixed(0)}`,
          elementType: v.elementType,
          elementIds: [v.elementId],
          b: v.b, h: v.h,
          mainBars,
          stirrups,
          totalAsPerElem: v.column ? v.column.AsProv : v.flexure.AsProv,
        });
      }
    }
    return Array.from(groups.values());
  });

  // Find a beam-column joint pair for the joint detail drawing
  const jointDetail = $derived.by(() => {
    const beams = verifications.filter(v => v.elementType === 'beam');
    const cols = verifications.filter(v => v.elementType === 'column' || v.elementType === 'wall');
    if (beams.length === 0 || cols.length === 0) return null;
    const beam = beams[0];
    const col = cols[0];
    return {
      beamB: beam.b, beamH: beam.h,
      colB: col.b, colH: col.h,
      cover: beam.cover,
      beamBars: beam.flexure.bars,
      colBars: col.column?.bars ?? `${col.flexure.barCount} Ø${col.flexure.barDia}`,
      stirrupDia: col.shear.stirrupDia,
      stirrupSpacing: col.shear.spacing,
    };
  });

  // Grouped schedule entries by element type
  const beamEntries = $derived(rebarSchedule.filter(e => e.elementType === 'beam'));
  const colEntries = $derived(rebarSchedule.filter(e => e.elementType === 'column'));
  const wallEntries = $derived(rebarSchedule.filter(e => e.elementType === 'wall'));

  /** Get support type for an element end node */
  function getSupportType(nodeId: number): 'fixed' | 'pinned' | 'free' {
    const sup = modelStore.supports.get(nodeId);
    if (!sup) return 'free';
    if (sup.type === 'fixed') return 'fixed';
    return 'pinned';
  }
</script>

<div class="pro-verif">
  <div class="pro-verif-header">
    <div class="pro-verif-title-row">
      <div class="pro-verif-title">{t('pro.normativeVerif')}</div>
      <select bind:value={selectedNormative} class="pro-sel normative-sel">
        {#each normativeOptions as opt}
          <option value={opt.value}>{opt.label}</option>
        {/each}
      </select>
    </div>
    {#if !isCirsocSelected && !selectedNormativeAvailable()}
      <div class="pro-wasm-notice">
        {t('pro.wasmNotice').replace('{code}', normativeOptions.find(o => o.value === selectedNormative)?.label ?? '')}
      </div>
    {/if}
    <div class="pro-verif-params">
      <label>{t('pro.rebarSteel')}: <select bind:value={rebarFy} class="pro-sel">
        <option value={420}>ADN 420</option>
        <option value={500}>ADN 500</option>
      </select></label>
      <label>{t('pro.coverLabel')}:
        <select bind:value={cover} class="pro-sel">
          <option value={0.020}>2.0 cm</option>
          <option value={0.025}>2.5 cm</option>
          <option value={0.030}>3.0 cm</option>
          <option value={0.035}>3.5 cm</option>
          <option value={0.040}>4.0 cm</option>
          <option value={0.050}>5.0 cm</option>
        </select>
      </label>
      <label>{t('pro.stirrupLabel')}:
        <select bind:value={stirrupDia} class="pro-sel">
          {#each REBAR_DB.filter(r => r.diameter <= 12) as r}
            <option value={r.diameter}>{r.label}</option>
          {/each}
        </select>
      </label>
      <label>{t('pro.exposureLabel')}:
        <select bind:value={exposure} class="pro-sel">
          <option value="interior">{t('pro.interior')}</option>
          <option value="exterior">{t('pro.exterior')}</option>
        </select>
      </label>
    </div>
    <button class="pro-verify-btn" onclick={runVerification} disabled={!hasResults || (!isCirsocSelected && !selectedNormativeAvailable())}>
      {t('pro.verifyElements')}
    </button>
    {#if hasEnvelope}
      <span class="pro-env-badge">{t('pro.envelopeActive')}</span>
    {/if}
    {#if verifyError}
      <div class="pro-verify-error">{verifyError}</div>
    {/if}
  </div>

  {#if verifications.length > 0 || steelVerifications.length > 0 || slabDesigns.length > 0}
    <div class="pro-verif-summary">
      <span class="status-ok">{countOk} ✓</span>
      <span class="status-warn">{countWarn} ⚠</span>
      <span class="status-fail">{countFail} ✗</span>
      {#if quantities}
        <span class="qty-badge">H°: {quantities.totalConcreteVolume.toFixed(2)} m³</span>
        <span class="qty-badge">Acero: {quantities.totalSteelWeight.toFixed(0)} kg ({quantities.steelRatio.toFixed(0)} kg/m³)</span>
      {/if}
      <button class="pro-show-model-btn" onclick={showOnModel} title={t('pro.showOnModel')}>
        {t('pro.showOnModel')}
      </button>
    </div>

    <!-- Section tabs -->
    <div class="section-tabs">
      <button class:active={activeSection === 'verification'} onclick={() => activeSection = 'verification'}>{t('pro.verificationTab')}</button>
      <button class:active={activeSection === 'detailing'} onclick={() => activeSection = 'detailing'}>{t('pro.detailingTab')}</button>
      <button class:active={activeSection === 'schedule'} onclick={() => activeSection = 'schedule'}>{t('pro.scheduleTab')}</button>
      {#if slabDesigns.length > 0}
        <button class:active={activeSection === 'slabs'} onclick={() => activeSection = 'slabs'}>{t('pro.slabsTab')}</button>
      {/if}
      {#if storyDrifts.length > 0}
        <button class:active={activeSection === 'drift'} onclick={() => activeSection = 'drift'}>Drift{#if storyDrifts.some(d => d.status === 'fail')} ✗{/if}</button>
      {/if}
      <button class:active={activeSection === 'connections'} onclick={() => activeSection = 'connections'}>{t('pro.connectionsTab')}</button>
    </div>

    <!-- ═══ VERIFICATION TAB ═══ -->
    {#if activeSection === 'verification'}
      {#if verifications.length > 0}
        <div class="pro-section-label">{t('pro.cirsoc201')}</div>
      {/if}
      <div class="pro-verif-table-wrap">
        {#if verifications.length > 0}
        <table class="pro-verif-table">
          <thead>
            <tr>
              <th>Elem</th>
              <th>Tipo</th>
              <th>Mu</th>
              <th>Vu</th>
              <th>Nu</th>
              <th>As req</th>
              <th>As prov</th>
              <th>Estribos</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each verifications as v}
              <tr class={statusClass(v.overallStatus)} onclick={() => { toggleExpand(v.elementId); selectElementInViewport(v.elementId); }} style="cursor:pointer">
                <td class="col-id">{v.elementId}</td>
                <td class="col-type">{v.elementType === 'beam' ? t('pro.beam') : v.elementType === 'wall' ? t('pro.wall') : t('pro.column')}</td>
                <td class="col-num">{fmtNum(v.Mu)}</td>
                <td class="col-num">{fmtNum(v.Vu)}</td>
                <td class="col-num">{fmtNum(v.Nu)}</td>
                <td class="col-num">{v.column ? v.column.AsTotal.toFixed(1) : v.flexure.AsReq.toFixed(1)}</td>
                <td class="col-num">{v.column ? v.column.AsProv.toFixed(1) : v.flexure.AsProv.toFixed(1)}{#if !v.column && v.flexure.isDoublyReinforced && v.flexure.AsComp}<br><span style="font-size:0.65rem;color:#4a90d9">+{v.flexure.AsComp.toFixed(1)} A's</span>{/if}</td>
                <td class="col-stirrup">eØ{v.shear.stirrupDia} c/{(v.shear.spacing * 100).toFixed(0)}</td>
                <td class="col-status"><span class={statusClass(v.overallStatus)}>{statusIcon(v.overallStatus)}</span></td>
              </tr>
              {#if expandedId === v.elementId}
                <tr class="detail-row">
                  <td colspan="9">
                    <div class="detail-panel">
                      <!-- Cross section SVG -->
                      <div class="detail-svg">
                        {@html generateCrossSectionSvg({
                          b: v.b, h: v.h, cover: v.cover,
                          flexure: v.flexure, shear: v.shear,
                          column: v.column, isColumn: v.elementType === 'column' || v.elementType === 'wall',
                        })}
                      </div>

                      <!-- Elevation SVG -->
                      {#if v.elementType === 'beam'}
                        {@const elemLen = elementLengthMap.get(v.elementId) ?? 3}
                        {@const elem = modelStore.elements.get(v.elementId)}
                        <div class="detail-svg">
                          {@html generateBeamElevationSvg({
                            length: elemLen, h: v.h, cover: v.cover,
                            flexure: v.flexure, shear: v.shear,
                            supportI: elem ? getSupportType(elem.nodeI) : 'pinned',
                            supportJ: elem ? getSupportType(elem.nodeJ) : 'pinned',
                          })}
                        </div>
                      {:else if v.column && (v.elementType === 'column' || v.elementType === 'wall')}
                        {@const elemLen = elementLengthMap.get(v.elementId) ?? 3}
                        <div class="detail-svg">
                          {@html generateColumnElevationSvg({
                            height: elemLen, b: v.b, h: v.h, cover: v.cover,
                            column: v.column, shear: v.shear,
                          })}
                        </div>
                      {/if}

                      {#if v.column}
                        {@const diagParams = {
                          b: v.b, h: v.h, fc: v.fc, fy: rebarFy,
                          cover: v.cover + stirrupDia / 2000 + v.flexure.barDia / 2000,
                          AsProv: v.column.AsProv ?? v.flexure.AsProv,
                          barCount: v.column.barCount ?? v.flexure.barCount,
                          barDia: v.flexure.barDia,
                        } satisfies DiagramParams}
                        {@const diagram = generateInteractionDiagram(diagParams)}
                        <div class="detail-svg interaction-diagram">
                          {@html generateInteractionSvg(diagram, { Nu: v.Nu, Mu: v.Mu }, 280, 350)}
                        </div>
                      {/if}

                      <div class="detail-memo">
                        <div class="memo-section">
                          <div class="memo-title">{t('pro.flexure')}</div>
                          {#each v.flexure.steps as step}<div class="memo-step">{step}</div>{/each}
                        </div>
                        <div class="memo-section">
                          <div class="memo-title">{t('pro.shear')}</div>
                          {#each v.shear.steps as step}<div class="memo-step">{step}</div>{/each}
                        </div>
                        {#if v.column}
                          <div class="memo-section">
                            <div class="memo-title">{t('pro.flexoCompression')}</div>
                            {#each v.column.steps as step}<div class="memo-step">{step}</div>{/each}
                          </div>
                        {/if}
                        {#if v.torsion}
                          <div class="memo-section">
                            <div class="memo-title">{t('pro.torsion')} {v.torsion.neglect ? t('pro.torsionNeglect') : ''}</div>
                            {#each v.torsion.steps as step}<div class="memo-step">{step}</div>{/each}
                          </div>
                        {/if}
                        {#if v.biaxial}
                          <div class="memo-section">
                            <div class="memo-title">{t('pro.biaxialBresler')}</div>
                            {#each v.biaxial.steps as step}<div class="memo-step">{step}</div>{/each}
                          </div>
                        {/if}
                        {#if v.slender}
                          <div class="memo-section">
                            <div class="memo-title">{t('pro.slenderness')} {v.slender.isSlender ? t('pro.slenderCol') : t('pro.shortCol')}</div>
                            {#each v.slender.steps as step}<div class="memo-step">{step}</div>{/each}
                          </div>
                        {/if}
                        {#if crackResults.get(v.elementId)}
                          {@const cr = crackResults.get(v.elementId)!}
                          <div class="memo-section">
                            <div class="memo-title">{t('pro.cracking')} <span class={statusClass(cr.status)}>{statusIcon(cr.status)}</span></div>
                            {#each cr.steps as step}<div class="memo-step">{step}</div>{/each}
                          </div>
                        {/if}
                        {#if deflectionResults.get(v.elementId)}
                          {@const dr = deflectionResults.get(v.elementId)!}
                          <div class="memo-section">
                            <div class="memo-title">{t('pro.deflection')} <span class={statusClass(dr.status)}>{statusIcon(dr.status)}</span></div>
                            {#each dr.steps as step}<div class="memo-step">{step}</div>{/each}
                          </div>
                        {/if}
                      </div>
                    </div>
                  </td>
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
        {/if}
      </div>
      {#if steelVerifications.length > 0}
        <div class="pro-section-label">{t('pro.cirsoc301')}</div>
        <div class="pro-verif-table-wrap">
          <table class="pro-verif-table">
            <thead><tr><th>Elem</th><th>Nu</th><th>Muz</th><th>Muy</th><th>Vu</th><th>{t('pro.interaction')}</th><th></th></tr></thead>
            <tbody>
              {#each steelVerifications as sv}
                <tr class={statusClass(sv.overallStatus)} onclick={() => toggleSteelExpand(sv.elementId)} style="cursor:pointer">
                  <td class="col-id">{sv.elementId}</td>
                  <td class="col-num">{fmtNum(sv.Nu)}</td>
                  <td class="col-num">{fmtNum(sv.Muz)}</td>
                  <td class="col-num">{fmtNum(sv.Muy)}</td>
                  <td class="col-num">{fmtNum(sv.Vu)}</td>
                  <td class="col-num">{sv.interaction?.ratio != null ? sv.interaction.ratio.toFixed(2) : '—'}</td>
                  <td class="col-status"><span class={statusClass(sv.overallStatus)}>{statusIcon(sv.overallStatus)}</span></td>
                </tr>
                {#if expandedSteelId === sv.elementId}
                  <tr class="detail-row">
                    <td colspan="7">
                      <div class="detail-panel"><div class="detail-memo">
                        {#if sv.tension}<div class="memo-section"><div class="memo-title">{t('pro.tension')} <span class={statusClass(sv.tension.status)}>{statusIcon(sv.tension.status)}</span></div>{#each sv.tension.steps as step}<div class="memo-step">{step}</div>{/each}</div>{/if}
                        {#if sv.compression}<div class="memo-section"><div class="memo-title">{t('pro.compression')} <span class={statusClass(sv.compression.status)}>{statusIcon(sv.compression.status)}</span></div>{#each sv.compression.steps as step}<div class="memo-step">{step}</div>{/each}</div>{/if}
                        {#if sv.flexure}<div class="memo-section"><div class="memo-title">{t('pro.flexure')} <span class={statusClass(sv.flexure.status)}>{statusIcon(sv.flexure.status)}</span></div>{#each sv.flexure.steps as step}<div class="memo-step">{step}</div>{/each}</div>{/if}
                        {#if sv.shear}<div class="memo-section"><div class="memo-title">{t('pro.shear')} <span class={statusClass(sv.shear.status)}>{statusIcon(sv.shear.status)}</span></div>{#each sv.shear.steps as step}<div class="memo-step">{step}</div>{/each}</div>{/if}
                        {#if sv.interaction}<div class="memo-section"><div class="memo-title">{t('pro.interaction')} <span class={statusClass(sv.interaction.status)}>{statusIcon(sv.interaction.status)}</span></div>{#each sv.interaction.steps as step}<div class="memo-step">{step}</div>{/each}</div>{/if}
                      </div></div>
                    </td>
                  </tr>
                {/if}
              {/each}
            </tbody>
          </table>
        </div>
      {/if}

    <!-- ═══ DETAILING TAB ═══ -->
    {:else if activeSection === 'detailing'}
      <div class="detailing-content">
        {#if beamEntries.length > 0}
          <div class="pro-section-label">{t('pro.beamsLabel')}</div>
          <div class="detailing-gallery">
            {#each beamEntries as entry}
              {@const rep = verifications.find(v => v.elementId === entry.elementIds[0])}
              {#if rep}
                {@const elemLen = elementLengthMap.get(rep.elementId) ?? 3}
                {@const elem = modelStore.elements.get(rep.elementId)}
                <div class="gallery-item">
                  <div class="gallery-title">{entry.sectionName} — Elementos {entry.elementIds.join(', ')}</div>
                  <div class="detail-svg">
                    {@html generateCrossSectionSvg({
                      b: rep.b, h: rep.h, cover: rep.cover,
                      flexure: rep.flexure, shear: rep.shear,
                      column: rep.column, isColumn: false,
                    })}
                  </div>
                  <div class="detail-svg">
                    {@html generateBeamElevationSvg({
                      length: elemLen, h: rep.h, cover: rep.cover,
                      flexure: rep.flexure, shear: rep.shear,
                      supportI: elem ? getSupportType(elem.nodeI) : 'pinned',
                      supportJ: elem ? getSupportType(elem.nodeJ) : 'pinned',
                    })}
                  </div>
                </div>
              {/if}
            {/each}
          </div>
        {/if}

        {#if colEntries.length > 0}
          <div class="pro-section-label">{t('pro.columnsLabel')}</div>
          <div class="detailing-gallery">
            {#each colEntries as entry}
              {@const rep = verifications.find(v => v.elementId === entry.elementIds[0])}
              {#if rep && rep.column}
                {@const elemLen = elementLengthMap.get(rep.elementId) ?? 3}
                <div class="gallery-item">
                  <div class="gallery-title">{entry.sectionName} — Elementos {entry.elementIds.join(', ')}</div>
                  <div class="detail-svg">
                    {@html generateCrossSectionSvg({
                      b: rep.b, h: rep.h, cover: rep.cover,
                      flexure: rep.flexure, shear: rep.shear,
                      column: rep.column, isColumn: true,
                    })}
                  </div>
                  <div class="detail-svg">
                    {@html generateColumnElevationSvg({
                      height: elemLen, b: rep.b, h: rep.h, cover: rep.cover,
                      column: rep.column, shear: rep.shear,
                    })}
                  </div>
                </div>
              {/if}
            {/each}
          </div>
        {/if}

        {#if wallEntries.length > 0}
          <div class="pro-section-label">{t('pro.wallsLabel')}</div>
          <div class="detailing-gallery">
            {#each wallEntries as entry}
              {@const rep = verifications.find(v => v.elementId === entry.elementIds[0])}
              {#if rep && rep.column}
                {@const elemLen = elementLengthMap.get(rep.elementId) ?? 3}
                <div class="gallery-item">
                  <div class="gallery-title">{entry.sectionName} — Elementos {entry.elementIds.join(', ')}</div>
                  <div class="detail-svg">
                    {@html generateCrossSectionSvg({
                      b: rep.b, h: rep.h, cover: rep.cover,
                      flexure: rep.flexure, shear: rep.shear,
                      column: rep.column, isColumn: true,
                    })}
                  </div>
                  <div class="detail-svg">
                    {@html generateColumnElevationSvg({
                      height: elemLen, b: rep.b, h: rep.h, cover: rep.cover,
                      column: rep.column, shear: rep.shear,
                    })}
                  </div>
                </div>
              {/if}
            {/each}
          </div>
        {/if}

        <!-- Joint detail -->
        {#if jointDetail}
          <div class="pro-section-label">{t('pro.jointDetail')}</div>
          <div class="detailing-gallery">
            <div class="gallery-item">
              <div class="detail-svg">
                {@html generateJointDetailSvg(jointDetail)}
              </div>
              <div class="joint-notes">
                <div class="memo-step">{t('pro.jointAnchor')}</div>
                <div class="memo-step">{t('pro.jointStirrup')} eØ{jointDetail.stirrupDia} c/{(jointDetail.stirrupSpacing * 100).toFixed(0)} (CIRSOC 201 §21.5)</div>
                <div class="memo-step">{t('pro.jointLd')}</div>
                <div class="memo-step">{t('pro.jointConfined')}</div>
              </div>
            </div>
          </div>
        {/if}
      </div>

    <!-- ═══ SCHEDULE TAB ═══ -->
    {:else if activeSection === 'schedule'}
      <div class="pro-section-label">{t('pro.scheduleTitle')}</div>
      <div class="pro-verif-table-wrap">
        <table class="pro-verif-table">
          <thead>
            <tr>
              <th>{t('pro.thSectionName')}</th>
              <th>{t('pro.thType')}</th>
              <th>{t('pro.thElements')}</th>
              <th>b×h</th>
              <th>{t('pro.thMainBars')}</th>
              <th>{t('pro.thStirrups')}</th>
              <th>{t('pro.thAsPerElem')}</th>
            </tr>
          </thead>
          <tbody>
            {#each rebarSchedule as entry}
              <tr>
                <td style="color:#4ecdc4">{entry.sectionName}</td>
                <td class="col-type">{entry.elementType === 'beam' ? t('pro.elemTypeBeam') : entry.elementType === 'wall' ? t('pro.elemTypeWall') : t('pro.elemTypeColumn')}</td>
                <td class="col-elems" title={entry.elementIds.join(', ')}>{entry.elementIds.length === 1 ? entry.elementIds[0] : `${entry.elementIds.length} elem. (${entry.elementIds.join(', ')})`}</td>
                <td class="col-num">{(entry.b * 100).toFixed(0)}×{(entry.h * 100).toFixed(0)}</td>
                <td class="col-stirrup">{entry.mainBars}</td>
                <td class="col-stirrup">{entry.stirrups}</td>
                <td class="col-num">{entry.totalAsPerElem.toFixed(1)} cm²</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      {#if quantities}
        <div class="pro-section-label">{t('pro.materialsSummary')}</div>
        <div class="schedule-summary">
          <div class="schedule-item">
            <span class="schedule-label">{t('pro.totalConcrete')}</span>
            <span class="schedule-value">{quantities.totalConcreteVolume.toFixed(2)} m³</span>
          </div>
          <div class="schedule-item">
            <span class="schedule-label">{t('pro.totalSteel')}</span>
            <span class="schedule-value">{quantities.totalSteelWeight.toFixed(0)} kg</span>
          </div>
          <div class="schedule-item">
            <span class="schedule-label">{t('pro.globalRatio')}</span>
            <span class="schedule-value">{quantities.steelRatio.toFixed(1)} kg/m³</span>
          </div>
          {#if slabDesigns.length > 0}
            {@const totalSlabArea = slabDesigns.reduce((s, d) => s + d.spanX * d.spanZ, 0)}
            {@const totalSlabVol = slabDesigns.reduce((s, d) => s + d.spanX * d.spanZ * d.thickness, 0)}
            <div class="schedule-item">
              <span class="schedule-label">{t('pro.slabTotalArea')}</span>
              <span class="schedule-value">{totalSlabArea.toFixed(1)} m²</span>
            </div>
            <div class="schedule-item">
              <span class="schedule-label">{t('pro.slabConcrete')}</span>
              <span class="schedule-value">{totalSlabVol.toFixed(2)} m³</span>
            </div>
          {/if}
        </div>
      {/if}

    <!-- ═══ SLABS TAB ═══ -->
    {:else if activeSection === 'slabs'}
      <div class="pro-section-label">{t('pro.slabReinfTitle')}</div>
      {#each slabDesigns as slab, i}
        <div class="slab-card">
          <div class="slab-header">{t('pro.slabPanelN').replace('{n}', String(i + 1))} — {slab.spanX.toFixed(1)}×{slab.spanZ.toFixed(1)} m, e={( slab.thickness * 100).toFixed(0)} cm, f'c={slab.fc} MPa</div>
          <div class="slab-detail-row">
            <div class="detail-svg">
              {@html generateSlabReinforcementSvg({
                spanX: slab.spanX, spanZ: slab.spanZ,
                thickness: slab.thickness,
                mxDesign: slab.designX.Mu, mzDesign: slab.designZ.Mu,
                barsX: slab.designX.bars, barsZ: slab.designZ.bars,
                asxProv: slab.designX.AsProv, aszProv: slab.designZ.AsProv,
              })}
            </div>
            <div class="slab-memo">
              <div class="memo-section">
                <div class="memo-title">{t('pro.dirX')}</div>
                <div class="memo-step">Mu = {slab.designX.Mu.toFixed(2)} kN·m/m</div>
                <div class="memo-step">d = {(slab.designX.d * 100).toFixed(1)} cm</div>
                <div class="memo-step">As,req = {slab.designX.AsReq.toFixed(2)} cm²/m</div>
                <div class="memo-step">As,min = {slab.designX.AsMin.toFixed(2)} cm²/m {t('pro.shrinkageLabel')}</div>
                <div class="memo-step">{t('pro.adopted')} {slab.designX.bars} → As,prov = {slab.designX.AsProv.toFixed(2)} cm²/m</div>
              </div>
              <div class="memo-section">
                <div class="memo-title">{t('pro.dirZ')}</div>
                <div class="memo-step">Mu = {slab.designZ.Mu.toFixed(2)} kN·m/m</div>
                <div class="memo-step">d = {(slab.designZ.d * 100).toFixed(1)} cm</div>
                <div class="memo-step">As,req = {slab.designZ.AsReq.toFixed(2)} cm²/m</div>
                <div class="memo-step">As,min = {slab.designZ.AsMin.toFixed(2)} cm²/m {t('pro.shrinkageLabel')}</div>
                <div class="memo-step">{t('pro.adopted')} {slab.designZ.bars} → As,prov = {slab.designZ.AsProv.toFixed(2)} cm²/m</div>
              </div>
            </div>
          </div>
        </div>
      {/each}
      {#if slabDesigns.length === 0}
        <div class="pro-empty">{t('pro.noSlabs')}</div>
      {/if}

    {:else if activeSection === 'drift'}
      <!-- ═══ STORY DRIFT TAB ═══ -->
      <div class="pro-section-label">{t('pro.driftTitle')}</div>
      <div class="drift-limit-note">{t('pro.driftLimit')}: Δ/h ≤ {driftLimit} (hormigón armado)</div>
      <div class="pro-verif-table-wrap">
        <table class="pro-verif-table">
          <thead>
            <tr>
              <th>Nivel (m)</th>
              <th>h piso (m)</th>
              <th>Δx (mm)</th>
              <th>Δz (mm)</th>
              <th>Δx/h</th>
              <th>Δz/h</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each storyDrifts as d}
              <tr class={d.status === 'fail' ? 'status-fail' : d.status === 'warn' ? 'status-warn' : ''}>
                <td class="col-num">{d.level.toFixed(2)}</td>
                <td class="col-num">{d.height.toFixed(2)}</td>
                <td class="col-num">{(d.driftX * 1000).toFixed(2)}</td>
                <td class="col-num">{(d.driftZ * 1000).toFixed(2)}</td>
                <td class="col-num">{d.ratioX < 0.0001 ? '<0.0001' : d.ratioX.toFixed(4)}</td>
                <td class="col-num">{d.ratioZ < 0.0001 ? '<0.0001' : d.ratioZ.toFixed(4)}</td>
                <td class="col-status"><span class={'status-' + d.status}>{d.status === 'ok' ? '✓' : d.status === 'fail' ? '✗' : '⚠'}</span></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if storyDrifts.length === 0}
        <div class="pro-empty">{t('pro.noDriftDetected')}</div>
      {/if}

    {:else if activeSection === 'connections'}
      <!-- ═══ CONNECTIONS TAB ═══ -->
      <div class="pro-section-label">{t('pro.connectionsTitle')}</div>

      <!-- Bolt group check -->
      <details class="conn-details">
        <summary class="conn-summary">{t('pro.boltGroupTitle')}</summary>
        <div class="conn-panel">
          <div class="conn-form">
            <label class="conn-label">∅ (mm): <input type="number" class="adv-num" bind:value={boltDia} min={6} max={36} step={2} /></label>
            <label class="conn-label">{t('pro.grade')}: <select class="pro-sel" bind:value={boltGrade}><option value="4.6">4.6</option><option value="8.8">8.8</option><option value="10.9">10.9</option></select></label>
            <label class="conn-label">n: <input type="number" class="adv-num" bind:value={boltCount} min={1} max={50} /></label>
            <label class="conn-label">g (mm): <input type="number" class="adv-num" bind:value={boltGauge} min={30} max={200} /></label>
            <label class="conn-label">p (mm): <input type="number" class="adv-num" bind:value={boltPitch} min={40} max={300} /></label>
          </div>
          <div class="conn-form">
            <label class="conn-label">V (kN): <input type="number" class="adv-num" bind:value={boltShearForce} min={0} step={10} /></label>
            <label class="conn-label">T (kN): <input type="number" class="adv-num" bind:value={boltTensionForce} min={0} step={10} /></label>
            <button class="adv-btn-sm" onclick={handleBoltCheck}>{t('pro.verify')}</button>
          </div>
          {#if boltResult}
            <div class="conn-result" class:fail={boltResult.ratio >= 1}>
              <span>{t('pro.utilization')}: {((boltResult.ratio ?? 0) * 100).toFixed(0)}%</span>
              {#if boltResult.shearCapacity != null}<span>Vn={boltResult.shearCapacity.toFixed(1)} kN</span>{/if}
              {#if boltResult.tensionCapacity != null}<span>Tn={boltResult.tensionCapacity.toFixed(1)} kN</span>{/if}
              {#if boltResult.status}<span class={'status-' + boltResult.status}>{boltResult.status === 'ok' ? '✓' : '✗'}</span>{/if}
            </div>
          {/if}
        </div>
      </details>

      <!-- Weld group check -->
      <details class="conn-details">
        <summary class="conn-summary">{t('pro.weldGroupTitle')}</summary>
        <div class="conn-panel">
          <div class="conn-form">
            <label class="conn-label">{t('pro.weldType')}:
              <select class="pro-sel" bind:value={weldType}><option value="fillet">{t('pro.fillet')}</option><option value="groove">{t('pro.groove')}</option></select>
            </label>
            <label class="conn-label">a (mm): <input type="number" class="adv-num" bind:value={weldSize} min={3} max={25} /></label>
            <label class="conn-label">L (mm): <input type="number" class="adv-num" bind:value={weldLength} min={20} max={2000} /></label>
            <label class="conn-label">Fexx (MPa): <input type="number" class="adv-num" bind:value={weldElectrode} min={350} max={700} step={10} /></label>
          </div>
          <div class="conn-form">
            <label class="conn-label">V (kN): <input type="number" class="adv-num" bind:value={weldShear} min={0} step={10} /></label>
            <button class="adv-btn-sm" onclick={handleWeldCheck}>{t('pro.verify')}</button>
          </div>
          {#if weldResult}
            <div class="conn-result" class:fail={weldResult.ratio >= 1}>
              <span>{t('pro.utilization')}: {((weldResult.ratio ?? 0) * 100).toFixed(0)}%</span>
              {#if weldResult.capacity != null}<span>Rn={weldResult.capacity.toFixed(1)} kN</span>{/if}
              {#if weldResult.status}<span class={'status-' + weldResult.status}>{weldResult.status === 'ok' ? '✓' : '✗'}</span>{/if}
            </div>
          {/if}
        </div>
      </details>

      <!-- Spread footing check -->
      <details class="conn-details">
        <summary class="conn-summary">{t('pro.footingTitle')}</summary>
        <div class="conn-panel">
          <div class="conn-form">
            <label class="conn-label">B (m): <input type="number" class="adv-num" bind:value={footB} min={0.3} max={5} step={0.1} /></label>
            <label class="conn-label">L (m): <input type="number" class="adv-num" bind:value={footL} min={0.3} max={5} step={0.1} /></label>
            <label class="conn-label">h (m): <input type="number" class="adv-num" bind:value={footH} min={0.2} max={2} step={0.05} /></label>
            <label class="conn-label">f'c (MPa): <input type="number" class="adv-num" bind:value={footFc} min={15} max={50} /></label>
          </div>
          <div class="conn-form">
            <label class="conn-label">σ_adm (kPa): <input type="number" class="adv-num" bind:value={footSigmaAdm} min={50} max={1000} step={10} /></label>
            <label class="conn-label">N (kN): <input type="number" class="adv-num" bind:value={footNu} min={0} step={50} /></label>
            <label class="conn-label">M (kN·m): <input type="number" class="adv-num" bind:value={footMu} min={0} step={10} /></label>
            <button class="adv-btn-sm" onclick={handleFootingCheck}>{t('pro.verify')}</button>
          </div>
          {#if footResult}
            <div class="conn-result" class:fail={footResult.ratio >= 1}>
              <span>{t('pro.utilization')}: {((footResult.ratio ?? 0) * 100).toFixed(0)}%</span>
              {#if footResult.bearingPressure != null}<span>σ={footResult.bearingPressure.toFixed(0)} kPa</span>{/if}
              {#if footResult.punchingRatio != null}<span>{t('pro.punching')}: {(footResult.punchingRatio * 100).toFixed(0)}%</span>{/if}
              {#if footResult.status}<span class={'status-' + footResult.status}>{footResult.status === 'ok' ? '✓' : '✗'}</span>{/if}
            </div>
          {/if}
        </div>
      </details>
    {/if}

  {:else if wasmCheckResults && wasmCheckResults.length > 0}
    <!-- Generic WASM check results display -->
    <div class="pro-verif-wasm">
      <div class="pro-verif-summary">
        <span class="status-ok">{wasmCheckResults.filter((m: any) => m.status === 'ok' || m.ratio < 1).length} ✓</span>
        <span class="status-fail">{wasmCheckResults.filter((m: any) => m.status === 'fail' || m.ratio >= 1).length} ✗</span>
      </div>
      <div class="pro-verif-scroll">
        {#each wasmCheckResults as member}
          <div class="wasm-check-card" class:fail={member.status === 'fail' || member.ratio >= 1}>
            <div class="wasm-check-header">
              <strong>E{member.elementId ?? '?'}</strong>
              {#if member.ratio != null}
                <span class="wasm-ratio" class:fail={member.ratio >= 1}>{(member.ratio * 100).toFixed(0)}%</span>
              {/if}
              {#if member.status}
                <span class="wasm-status">{member.status}</span>
              {/if}
            </div>
            {#if member.checks && Array.isArray(member.checks)}
              <div class="wasm-checks">
                {#each member.checks as check}
                  <div class="wasm-check-line">
                    <span class="wasm-check-name">{check.name ?? check.type ?? ''}</span>
                    {#if check.ratio != null}
                      <span class="wasm-check-ratio" class:fail={check.ratio >= 1}>{(check.ratio * 100).toFixed(0)}%</span>
                    {/if}
                    {#if check.message}<span class="wasm-check-msg">{check.message}</span>{/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {:else if !verifyError}
    <div class="pro-empty">
      {#if hasResults}
        {t('pro.verifyPrompt')}
      {:else}
        {t('pro.solveFirst')}
      {/if}
    </div>
  {/if}
</div>

<style>
  .pro-verif { display: flex; flex-direction: column; height: 100%; }

  .pro-verif-header {
    padding: 8px 10px;
    border-bottom: 1px solid #1a3050;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .pro-verif-title-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .pro-verif-title {
    font-size: 0.8rem;
    font-weight: 600;
    color: #4ecdc4;
  }

  .normative-sel {
    font-size: 0.65rem;
    padding: 3px 6px;
    min-width: 130px;
  }

  .pro-wasm-notice {
    padding: 4px 8px;
    font-size: 0.62rem;
    color: #f0a500;
    background: rgba(240, 165, 0, 0.1);
    border: 1px solid rgba(240, 165, 0, 0.25);
    border-radius: 3px;
  }

  .pro-verif-params {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }

  .pro-verif-params label {
    font-size: 0.62rem;
    color: #888;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .pro-sel {
    padding: 2px 4px;
    background: #0f2840;
    border: 1px solid #1a3050;
    border-radius: 2px;
    color: #ccc;
    font-size: 0.62rem;
    cursor: pointer;
  }

  .pro-verify-btn {
    align-self: flex-start;
    padding: 5px 16px;
    font-size: 0.72rem;
    font-weight: 600;
    color: #fff;
    background: linear-gradient(135deg, #0f7b6c, #0a5a4e);
    border: 1px solid #4ecdc4;
    border-radius: 4px;
    cursor: pointer;
  }

  .pro-verify-btn:hover { background: linear-gradient(135deg, #1a9a8a, #0f7b6c); }
  .pro-verify-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .qty-badge {
    font-size: 0.62rem;
    color: #aaa;
    font-family: monospace;
    margin-left: auto;
  }

  .qty-badge + .qty-badge { margin-left: 8px; }

  .pro-env-badge {
    font-size: 0.6rem;
    color: #4ecdc4;
    background: rgba(78, 205, 196, 0.1);
    padding: 2px 8px;
    border-radius: 3px;
    border: 1px solid rgba(78, 205, 196, 0.3);
  }

  .pro-verify-error {
    padding: 4px 8px;
    font-size: 0.68rem;
    color: #ff8a9e;
    background: rgba(233, 69, 96, 0.1);
    border-radius: 3px;
  }

  .pro-verif-summary {
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 6px 10px;
    font-size: 0.75rem;
    font-weight: 600;
    border-bottom: 1px solid #1a3050;
  }
  .pro-show-model-btn {
    margin-left: auto;
    padding: 3px 10px;
    font-size: 0.65rem;
    font-weight: 600;
    background: linear-gradient(135deg, #2a6a5a, #1a5040);
    color: #ccc;
    border: 1px solid #3a7a6a;
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
  }
  .pro-show-model-btn:hover { background: linear-gradient(135deg, #3a8a7a, #2a6060); color: #fff; }

  .pro-verif-table-wrap { flex: 1; overflow: auto; }

  .pro-verif-table { width: 100%; border-collapse: collapse; font-size: 0.68rem; }
  .pro-verif-table thead { position: sticky; top: 0; z-index: 2; }
  .pro-verif-table th {
    padding: 4px 5px; text-align: left; font-size: 0.56rem; font-weight: 600;
    color: #888; text-transform: uppercase; background: #0a1a30; border-bottom: 1px solid #1a4a7a;
  }
  .pro-verif-table td { padding: 3px 5px; border-bottom: 1px solid #0f2030; color: #ccc; }
  .pro-verif-table tbody tr:hover { background: rgba(78, 205, 196, 0.05); }

  .col-id { width: 30px; color: #666; font-family: monospace; text-align: center; }
  .col-type { font-size: 0.62rem; }
  .col-num { font-family: monospace; text-align: right; font-size: 0.65rem; }
  .col-stirrup { font-family: monospace; font-size: 0.6rem; white-space: nowrap; }
  .col-elems { font-size: 0.58rem; color: #888; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .col-status { text-align: center; font-size: 0.85rem; }

  .status-ok { color: #4ecdc4; }
  .status-fail { color: #e94560; }
  .status-warn { color: #f0a500; }

  .detail-row td { padding: 0 !important; background: #0a1628 !important; }

  .detail-panel {
    display: flex;
    gap: 10px;
    padding: 10px;
    flex-wrap: wrap;
  }

  .detail-svg {
    flex-shrink: 0;
    background: #0f1a30;
    border: 1px solid #1a3050;
    border-radius: 4px;
    padding: 8px;
    overflow: auto;
    max-width: 100%;
  }

  .detail-svg :global(svg) {
    max-width: 100%;
    height: auto;
  }

  .detail-memo {
    flex: 1;
    min-width: 200px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .memo-section {
    background: #0f1a30;
    border: 1px solid #1a3050;
    border-radius: 4px;
    padding: 6px 8px;
  }

  .memo-title {
    font-size: 0.65rem;
    font-weight: 600;
    color: #4ecdc4;
    margin-bottom: 4px;
    text-transform: uppercase;
  }

  .memo-step {
    font-size: 0.62rem;
    color: #aaa;
    font-family: monospace;
    line-height: 1.5;
  }

  .pro-section-label {
    padding: 6px 10px;
    font-size: 0.65rem;
    font-weight: 600;
    color: #4ecdc4;
    text-transform: uppercase;
    border-bottom: 1px solid #1a3050;
    background: rgba(78, 205, 196, 0.05);
  }

  .interaction-diagram {
    flex-shrink: 0;
  }

  .pro-empty {
    text-align: center;
    color: #555;
    font-style: italic;
    padding: 40px 10px;
  }

  /* ─── Section tabs ─── */
  .section-tabs {
    display: flex;
    gap: 0;
    border-bottom: 1px solid #1a3050;
    background: #0a1628;
  }
  .section-tabs button {
    padding: 6px 14px;
    font-size: 0.65rem;
    font-weight: 600;
    color: #666;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
  }
  .section-tabs button:hover { color: #aaa; }
  .section-tabs button.active {
    color: #4ecdc4;
    border-bottom-color: #4ecdc4;
  }

  /* ─── Detailing gallery ─── */
  .detailing-content { flex: 1; overflow: auto; }

  .detailing-gallery {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    padding: 10px;
  }

  .gallery-item {
    background: #0a1628;
    border: 1px solid #1a3050;
    border-radius: 4px;
    padding: 8px;
    min-width: 200px;
    max-width: 500px;
  }

  .gallery-title {
    font-size: 0.62rem;
    font-weight: 600;
    color: #4ecdc4;
    margin-bottom: 6px;
    text-transform: uppercase;
  }

  .joint-notes {
    margin-top: 8px;
    padding: 6px 8px;
    background: #0f1a30;
    border: 1px solid #1a3050;
    border-radius: 3px;
  }

  /* ─── Schedule summary ─── */
  .schedule-summary {
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .schedule-item {
    display: flex;
    justify-content: space-between;
    padding: 5px 10px;
    background: #0f1a30;
    border: 1px solid #1a3050;
    border-radius: 3px;
    font-size: 0.68rem;
  }
  .schedule-label { color: #888; }
  .schedule-value { color: #4ecdc4; font-family: monospace; font-weight: 600; }

  /* ─── Slab cards ─── */
  .slab-card {
    margin: 8px 10px;
    background: #0a1628;
    border: 1px solid #1a3050;
    border-radius: 4px;
    overflow: hidden;
  }
  .slab-header {
    padding: 6px 10px;
    font-size: 0.65rem;
    font-weight: 600;
    color: #4ecdc4;
    background: rgba(78, 205, 196, 0.05);
    border-bottom: 1px solid #1a3050;
  }
  .slab-detail-row {
    display: flex;
    gap: 10px;
    padding: 10px;
    flex-wrap: wrap;
  }
  .slab-memo {
    flex: 1;
    min-width: 180px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .drift-limit-note {
    font-size: 0.65rem;
    color: #8ba;
    padding: 2px 10px 4px;
  }

  /* ─── WASM check results ─── */
  .pro-verif-wasm { padding: 8px; overflow-y: auto; flex: 1; }
  .wasm-check-card { padding: 6px 8px; margin-bottom: 4px; background: #0d1b33; border: 1px solid #1a3a5a; border-radius: 4px; font-size: 0.72rem; }
  .wasm-check-card.fail { border-color: #e94560; }
  .wasm-check-header { display: flex; align-items: center; gap: 8px; }
  .wasm-ratio { font-weight: 700; color: #4ecdc4; }
  .wasm-ratio.fail { color: #e94560; }
  .wasm-status { font-size: 0.65rem; color: #778; }
  .wasm-checks { margin-top: 4px; padding-left: 8px; border-left: 2px solid #1a3a5a; }
  .wasm-check-line { display: flex; gap: 6px; font-size: 0.65rem; color: #aaa; padding: 1px 0; }
  .wasm-check-name { color: #8ab; }
  .wasm-check-ratio { font-weight: 600; color: #4ecdc4; }
  .wasm-check-ratio.fail { color: #e94560; }
  .wasm-check-msg { color: #888; font-size: 0.6rem; }

  /* ── Connections tab ── */
  .conn-details { margin-bottom: 6px; }
  .conn-summary { font-size: 0.72rem; color: #4ecdc4; font-weight: 600; cursor: pointer; padding: 4px 8px; background: #0d1b33; border-radius: 4px; }
  .conn-summary:hover { background: #122644; }
  .conn-panel { padding: 6px 8px; display: flex; flex-direction: column; gap: 6px; }
  .conn-form { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .conn-label { font-size: 0.62rem; color: #888; display: flex; align-items: center; gap: 3px; }
  .conn-label .adv-num { width: 55px; }
  .conn-result { padding: 4px 8px; font-size: 0.68rem; color: #ccc; background: rgba(78, 205, 196, 0.08); border: 1px solid rgba(78, 205, 196, 0.2); border-radius: 4px; display: flex; gap: 10px; flex-wrap: wrap; }
  .conn-result.fail { border-color: #e94560; background: rgba(233, 69, 96, 0.08); }
  .adv-btn-sm { padding: 3px 10px; border: 1px solid #1a4a7a; border-radius: 4px; background: #0f3460; color: #4ecdc4; font-size: 0.68rem; cursor: pointer; }
  .adv-btn-sm:hover { background: #1a4a7a; color: white; }
</style>
