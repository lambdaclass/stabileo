# PR21 — Estructuras metálicas en modo PRO: auditoría previa

**Fecha:** 2026-08-11
**Rama de trabajo:** `feat/pro-steel-family`
**Commit base:** `542fc6649f2d9a66c9f58fa79042233a051a97bd` (`origin/main`, merge del PR #133)
**Worktree:** `stabileo-branches/stabileo-steel`
**Estado:** informe solamente. No se escribió código de producto.

---

## 0. Verificación del estado real del repositorio

### 0.1 GitHub

`origin` = `https://github.com/lambdaclass/stabileo`.

| Rama | HEAD | Fecha | vs `main` |
|---|---|---|---|
| `origin/main` | `542fc664` — *Merge pull request #133 from fix/pr124-review-round2* | 2026-08-11 18:48 −03 | — |
| `origin/pr/19-rc-cad-constructibility` (**PR19**) | `dffd29b7` | 2026-08-10 | +159 / −52 |
| `origin/feat/pro-visual-system` (**PR20 = PR #125**) | `7c23faf2` | 2026-08-11 | +73 / −12 |

Ninguna de las dos contiene `main`. Ambas están detrás.

PR abiertos:

| # | Rama | Estado | Título |
|---|---|---|---|
| 134 | `perf/3d-viewport-perf-instrument` | ready | perf(3d): viewport perf HUD |
| 132 | `audit/basic-advanced-features` | draft | test(engine): advanced analyses vs closed form |
| 131 | `feat/edu-workspace` | draft | Education workspace |
| **125** | **`feat/pro-visual-system`** | **draft** | **PR20 — PRO UI and design workflow** |
| 122 | `fix/audit-wave-followup-2` | ready | fix(landing) |
| 97 | `fix/pr79-review-followups` | ready | review follow-ups [16] |
| **90** | **`pr/19-rc-cad-constructibility`** | **ready** | **[19] RC detail CAD constructibility review** |
| 67 | `fix/quickwins-batch-a` | draft | correctness quick-wins |
| 61 | `chore/dead-code-purge` | draft | dead code purge |
| 32 | `solver-audit-gap-analysis` | ready | solver audit |

No hay ninguna rama ni PR abierto relacionado con acero. `feat/pro-steel-family` es la primera.

### 0.2 Aislamiento respecto de PR19 y PR20

Worktrees existentes y su rama:

```
stabileo                  qa/main-plus-pr19-cad
stabileo-basic-education  audit/basic-advanced-features
stabileo-edu              feat/edu-workspace
stabileo-landing          feat/pro-visual-system   ← PR20, con cambios sin commitear
stabileo-pr18             pr/18-rc-slabs-walls-foundations
stabileo-pr19-cad         pr/19-rc-cad-constructibility   ← PR19
stabileo-steel            feat/pro-steel-family    ← NUEVO, base origin/main
```

El worktree de acero se creó con `git worktree add -b feat/pro-steel-family … origin/main`.
No comparte árbol de trabajo con PR19 ni con PR20; git impide además tener la misma rama
checkouteada en dos worktrees. `stabileo-landing` (PR20) tiene modificaciones locales sin
commitear — **no se tocaron**.

Nota operativa: `stabileo-landing` corre previews en el puerto 4173. Cualquier E2E que se
lance desde `stabileo-steel` tiene que usar otro puerto o asegurarse de que el preview
ajeno esté apagado, o Playwright testea el bundle equivocado.

### 0.3 Decisión de base

**PR21 se basa en `origin/main`, no en PR20.** Razones:

1. PR20 no está listo y no contiene `main` (12 commits atrás).
2. El selector de familias de diseño (`design-families.ts`) — la superficie más
   directamente afectada — **sólo existe en PR20**. Basar en PR20 heredaría 73 commits
   en revisión.
3. `main` ya contiene todo lo que la primera vertical slice necesita: el rol `steel`
   en el catálogo de reglamentos, el seam `DesignCodeAdapter`, el modelo de capacidades
   de cinco facetas, el modelo de madurez, y el catálogo de perfiles IRAM.

El coste es un conflicto previsible en `ProPanel.svelte` / `ProRibbon.svelte` cuando PR20
entre. Está acotado y se detalla en §13.

---

## 1. Arquitectura actual del modo PRO

### 1.1 Navegación y panel derecho

```
App.svelte
└── ProPanel.svelte  (1238 LOC)
    ├── tabGroups: 4 grupos × 13 pestañas
    │     Geometría   nodes · elements · shells
    │     Propiedades materials · sections
    │     Condiciones supports · constraints · loads
    │     Análisis    advanced · results · design · connections · diagnostics
    ├── activeTab ← uiStore.proActiveTab   (tipo: string suelto, ui.svelte.ts:268)
    └── {#if activeTab === 'design'} → ProRcWorkflowTab
```

`ProRcWorkflowTab.svelte` es el punto de entrada único al diseño y es un layout de cuatro
piezas:

```
<details> Reglamentos del proyecto → ProjectRegulationsPanel
<details> Detallado               → DetailingWorkflow
<details> Losas/tabiques/fundac.  → FloorFamiliesPanel
<ProDesignTab/>                    (tabla de vigas y columnas)
```

`ProVerificationTab.svelte` (2431 LOC) es una superficie **paralela y anterior**: tiene su
propio selector de código normativo, corre sus propias verificaciones y **es el único lugar
donde hoy aparece acero**. No está en la lista de pestañas de `ProPanel` en `main`; se llega
por otras rutas. Es deuda: dos superficies que responden la misma pregunta.

En PR20 se agrega `ProRibbon.svelte` (721 LOC) con cuatro *stages* — `model`, `conditions`,
`analyse`, `design` — y un mapa `TAB_STAGE`. El stage `design` tiene un solo grupo, `rc`, con
dos comandos: `design` y `connections`. Ahí es donde entraría una entrada metálica.

### 1.2 Stores

| Store | Archivo | LOC aprox. | Rol |
|---|---|---|---|
| `modelStore` | `store/model.svelte.ts` | 145 KB | nodos, elementos, materiales, secciones, apoyos, cargas; CRUD; `reinforcementTransaction` |
| `uiStore` | `store/ui.svelte.ts` | 47 KB | herramienta, selección, `proActiveTab`, toasts |
| `resultsStore` | `store/results.svelte.ts` | 34 KB | resultados 2D/3D, `perCombo3D`, `governing3D`, `diagramType` |
| `verificationStore` | `store/verification.svelte.ts` | 21 KB | **contexts**, outcomes, baseline, estados de display, revisiones |
| `designRunStore` | `store/design-run.svelte.ts` | 14 KB | los tres comandos + *Diseñar todo* |
| `detailingStore` | `store/detailing.svelte.ts` | 61 KB | assemblies, barras, documentos |
| `regulationsStore` | `store/regulations.svelte.ts` | 12 KB | stack de reglamentos por rol |
| `tabManager`, `fileOps` | `tabs.svelte.ts`, `file.ts` | 21 / 39 KB | proyectos, autosave, import/export |

### 1.3 La cadena de diseño

```
resultsStore.perCombo3D
   │
   ├─ computeStationDemands()                    engine/verification-service.ts
   │      → Map<elementId, ElementDesignDemands>
   │
   ├─ buildAllMemberContexts()                   engine/design/member-context.ts
   │      → Map<elementId, MemberContext>        ← verificationStore.setDemandData()
   │
   ├─ runCirsocDesign() → baseline               (acero requerido, memos, P-M)
   │
   └─ runDesign(adapter, contexts)               engine/design/candidate-search.ts
          → DesignRunSummary { outcomes: Map<id, MemberDesignOutcome> }
                │
                ├─ VERIFIED + accepted → modelStore.reinforcementTransaction()
                └─ detailingStore.generate() → assemblies → DocumentModel
```

---

## 2. Tipos y modelos de datos relevantes

### 2.1 Modelo estructural (`store/model.svelte.ts`)

```ts
interface Material {
  id; name; e; nu; rho;
  fy?: number;                 // ← MPa. Para hormigón ESTO ES f'c.
  maxAggregateSizeMm?; spacingMarginMm?; shotcrete?;   // todos propiedades del hormigón
}

interface Section {
  id; name; a; iz; b?; h?;
  shape?: 'I'|'H'|'U'|'L'|'RHS'|'CHS'|'rect'|'generic'|'T'|'invL'|'C';
  tw?; tf?; t?; tl?; iy?; j?; rotation?; polygon?; holes?; canonical?;
}

interface Element extends Element3DMetadata {
  id; type: 'frame'|'truss'; nodeI; nodeJ; materialId; sectionId;
  releaseI; releaseJ; jointI?; jointJ?;
  reinforcement?: ProvidedReinforcement;    // ← única "solución de diseño" que el modelo sabe llevar
}
```

**Ni `Material` ni `Section` ni `Element` tienen un campo de familia de material.**
Ese es el hueco central de esta auditoría.

### 2.2 Contrato de diseño (`engine/design/outcome.ts`)

```ts
type DesignOutcomeKind =
  | 'VERIFIED' | 'SECTION_INADEQUATE' | 'DEMAND_UNAVAILABLE'
  | 'SEARCH_EXHAUSTED' | 'UNSUPPORTED';

interface MemberDesignOutcome {
  elementId;
  elementType: 'beam' | 'column' | 'wall';        // ← acoplado a familia geométrica RC
  codeId; codeVersion; outcome;
  accepted?: ProvidedReinforcement;               // ← acoplado a hormigón armado
  certificate?: DesignCertificate;
  finalGeometryCertificate?; provisional?; limiting; reasons;
  sectionAdvice?; axes?; searchStats;
}
```

`assertOutcomeInvariants()` es un guardián en runtime, no sólo un tipo: lanza si un
`VERIFIED` no trae certificado, si un no-`VERIFIED` trae armadura asignada, si un
`SECTION_INADEQUATE` no agotó la envolvente, etc. **Este es el activo más valioso del
repositorio para lo que queremos hacer y hay que preservarlo intacto.**

### 2.3 Madurez y capacidades (`lib/codes/`)

- `maturity.ts` — `VALIDATED | IMPLEMENTED_PROVISIONAL | UNSUPPORTED`.
  `deriveMaturity()` **no permite** llegar a `VALIDATED` sin al menos un benchmark
  `external`. `isProducible()` deja generar y exportar lo provisional, siempre etiquetado.
  `PROVISIONAL_DRAWING_NOTE` es la nota obligatoria en planos.
- `capability.ts` — matriz de 24 capacidades × 5 facetas (`verify`, `generate`,
  `coordinate`, `document`, `gate`). `gate` es lo que impide que "no pude verificar punzonado"
  se convierta en "planta completa". Las 24 claves son todas de hormigón.
- `roles.ts` — stack de reglamentos por rol. **El rol `steel` ya existe** con dos opciones,
  ambas `UNSUPPORTED`: `cirsoc301-2018` y `eurocode3`.

### 2.4 Documento (`engine/detailing/document-model.ts`)

`DocumentModel` = una sola descripción de lo que se emite, de la que PDF, DXF y XLSX son
proyecciones. Lleva `readiness` (`REVIEW_DRAFT → FOR_REVIEW → REVIEWED → ISSUED →
SUPERSEDED`), `regulations`, `refs` (cláusulas), `assemblies`, `certificates`,
`familyCertificates`, `openConflicts`, `maturity`, `assumptions`.

`DocumentAssembly` lleva `bars: BarPath[]`, `laps`, `fusions`, `conflicts`. Es **hormigón
armado de punta a punta**.

---

## 3. Dónde se decide la familia estructural

Hay **cuatro** nociones distintas de "familia", ninguna de ellas de material:

| # | Noción | Dónde | Valores | Cómo se decide |
|---|---|---|---|---|
| 1 | Tipo de miembro | `codes/argentina/cirsoc201.ts:1379` `classifyElement()` | `beam` / `column` / `wall` | pura geometría: si `dz > √(dx²+dy²)` es vertical; si además `max(b,h)/min(b,h) > 3` es tabique |
| 2 | Familia de corrida de diseño (**sólo PR20**) | `engine/design/design-families.ts` | `column` `beam` `slab` `wall` `footing` | selección del usuario en `DesignFamilyPanel.svelte`; por defecto todo menos fundaciones |
| 3 | Familia de piso | `engine/detailing/family-record.ts:56` `FloorFamily` | `slab` / `wall` / `footing` | por entidad modelada |
| 4 | Tipo de assembly | `engine/detailing/assembly.ts:46` | `beamLine` / `columnStack` | agrupamiento por línea/pila |

`classifyElement()` es puramente geométrica y **no tiene nada de hormigón**: una columna
metálica se clasifica correctamente como `column`. Es reutilizable tal cual.

La decisión #2 es la que el usuario ve como "selector de familias". Es una lista literal
`['column','beam','slab','wall','footing']` sin dimensión de material.

---

## 4. Dónde se decide el código y el material

### 4.1 El código: bien resuelto, un solo lugar

```
regulationsStore.concreteDesignCode()        ← binding del rol 'concrete'
   → designRunStore.adapter() = getDesignCode(id)
   → registro DesignCodeAdapter               engine/design/code-adapter.ts
```

El comentario en `design-run.svelte.ts:62-70` documenta que esto *fue* un problema
(tres fuentes en desacuerdo) y que se arregló: Project Regulations es la única fuente.
Cuando no hay código utilizable, `adapter()` devuelve `undefined` y el comando falla con
`design.error.noAdapter` en vez de elegir un default. **Este patrón hay que repetirlo
literalmente para el rol `steel`.**

`DesignCodeId = 'cirsoc' | 'cirsoc-2005' | 'aci-aisc' | 'eurocode' | 'nds' | 'masonry' | 'cfs'`.
**No hay id para CIRSOC 301.**

### 4.2 El material: no se decide en ningún lado — se adivina, cuatro veces

Éste es el hallazgo principal.

| Lugar | Línea | Regla | Efecto |
|---|---|---|---|
| `engine/auto-verify.ts` | 75 | `if (!fc \|\| fc > 80) continue` | el chequeo RC salta el acero |
| `engine/verification-service.ts` | 279 | `if (!material.fy \|\| material.fy <= 80) continue` | el chequeo de acero salta el hormigón |
| `engine/design/adapters/cirsoc201-adapter.ts` | 108 | `if (ctx.material.fc > 80) → 'notConcrete'` | el adaptador rechaza |
| `engine/design/member-context.ts` | 180-182 | `const fc = mat?.fy` — **sin ningún control de familia** | el contexto se construye igual |

Cuatro umbrales mágicos independientes sobre el mismo número. El número `80` no está
declarado en ninguna constante compartida.

**Y la información existe, pero se tira:**

```ts
// lib/data/material-presets.ts
interface MaterialPreset {
  category: 'acero' | 'hormigon' | 'madera' | 'aluminio';   // ← existe
  ...
}
```

```ts
// components/pro/ProMaterialsTab.svelte:29
function addPreset(p: MaterialPreset) {
  modelStore.addMaterial({ name: p.name, e: p.e, nu: p.nu, rho: p.rho, fy: p.fy });
  //                        ← p.category NO se copia
}
// idem components/tables/MaterialsTable.svelte:32
```

La sección también lo sabe y también se pierde:

```ts
// lib/data/section-catalog.ts
FAMILY_CLASSIFICATION.IPE = { ..., material: 'hot-rolled-steel', ... }
FAMILY_CLASSIFICATION.RHS = { ..., material: 'cold-formed-steel', ... }
```

`Section` no persiste ese campo.

### 4.3 Evidencia empírica del comportamiento actual

Probe ejecutado en este worktree (`vitest`, luego borrado; reproducible tal cual):

```ts
const md = {
  nodes:    Map[1→(0,0,0), 2→(6,0,0)],
  elements: Map[1→{nodeI:1,nodeJ:2,sectionId:1,materialId:1,type:'frame'}],
  sections: Map[1→{name:'IPE 300', b:0.15, h:0.30}],
  materials:Map[1→{name:'Acero A572 Gr50', fy:345}],
  supports: Map[1→{nodeId:1,type:'pinned'}],
};
const ctxs = buildAllMemberContexts(md, { demands, stations });   // demandas completas
const o = designMember(getDesignCode('cirsoc'), ctxs.get(1));
```

Resultado:

```
ctxs.size                → 1                       // el miembro de acero SÍ entra
ctxs.get(1).material.fc  → 345                     // su fy se leyó como f'c = 345 MPa
ctxs.get(1).elementType  → 'beam'

o.outcome   → 'DEMAND_UNAVAILABLE'
o.limiting  → ['missingMaterial']
o.reasons   → ['design.reason.notConcrete']
o.accepted  → undefined      ✅ nunca se le asigna armadura
o.certificate → undefined    ✅ nunca se certifica
```

Lectura:

- ✅ **Lo seguro está a salvo.** Un miembro metálico nunca recibe armadura ni certificado.
  El seam `validateInputs` lo frena.
- ❌ **Pero está mal reportado.** Con demandas perfectamente disponibles, el resultado es
  `DEMAND_UNAVAILABLE` — el mismo cajón que "todavía no resolviste". El usuario ve
  *"Demanda no disponible"* sobre un miembro cuya demanda está disponible.
- ❌ **Contamina los conteos.** El miembro entra en `verificationStore.contexts`, por lo
  tanto en `providedSummary.total`, en `providedSummary.unavailable` y en
  `DesignRunSummary.demandUnavailable`. Una nave metálica con dos columnas de hormigón
  reporta "2 verificadas de 300".
- ❌ **El pórtico metálico se modela internamente como una sección rectangular
  0,15 × 0,30 m de hormigón H-345.** No produce daño hoy porque el adaptador rechaza antes,
  pero es una representación falsa esperando a que alguien la consuma.

---

## 5. Cómo se generan los outcomes y los estados

`candidate-search.ts :: designMember()` — cinco compuertas en orden:

1. `adapter.unsupported(ctx)` → `UNSUPPORTED`
2. `adapter.validateInputs(ctx)` → `UNSUPPORTED` si sólo `unsupportedCheck`, si no `DEMAND_UNAVAILABLE`
3. `ctx.orientationSuspect` → `SEARCH_EXHAUSTED` con `memberOrientationSuspect`
4. `adapter.createGenerator(ctx)` nulo → `UNSUPPORTED`
5. búsqueda acotada → `VERIFIED` / `SECTION_INADEQUATE` / `SEARCH_EXHAUSTED`

Cada retorno pasa por `assertOutcomeInvariants()`.

Estados de presentación, en un eje distinto (`verification.svelte.ts:391`):

```
DisplayStatus = 'ok' | 'warn' | 'fail' | 'unavailable' | 'stale'
```

`getDisplayStatus()` es **provided-first**: lee la armadura que el miembro *tiene*, no la que
el código *requiere*. El comentario del código dice que leer el baseline era el bug de
confianza real (el visor quedaba verde después de que el usuario debilitara la armadura).

Utilización siempre `demand/capacity`; `utilizationStatus()` con banda de aviso en 0,95 y
falla en 1,00.

---

## 6. Cómo llegan los resultados al DocumentModel

```
designRunStore.publishOutcomes()
   └─ modelStore.reinforcementTransaction(api => api.setReinforcement(id, o.accepted))
   └─ detailingStore.generate()  (si autoGenerate)
         └─ run-detailing.ts (100 KB) → DetailingAssembly[]
               · bars: BarPath[], laps, fusions, joints, conflicts
               · FloorFamilyDesignRecord[] para losas/tabiques/fundaciones
         └─ buildDocumentModel({ assemblies, laps, certificates, revision, regulations })
               · documentReadiness() decide REVIEW_DRAFT..ISSUED por evidencia
               · certificateFreshness() compara hash de armadura certificada vs actual
```

El `DocumentModel` es un cuello de botella deliberado: *"cualquier cosa ausente del modelo
no puede aparecer en una salida"*. Es exactamente el lugar correcto para que el acero
entre — y exactamente el lugar donde hoy no cabe, porque `DocumentAssembly` es barras.

---

## 7. Cómo lo consumen 3D, planos, planilla e informe

| Consumidor | Archivo | Fuente | ¿Acero? |
|---|---|---|---|
| Visor 3D — mapa de color `verification` | `lib/viewport3d/results-sync.ts:456-467` | `verificationStore.getDisplayStatus()` + `getDisplayRatio()` | **no** — un miembro metálico queda `unavailable` (gris) |
| Visor 3D — etiquetas | `results-sync.ts:481-521` | idem | no |
| Planos | `engine/detailing/document-render.ts` (58 KB), `drawings.ts`, `family-drawings.ts` | `DocumentModel` | no |
| Planilla de despiece | `document-render.ts` (XLSX) + `bar-marks.ts` | `DocumentModel` | no |
| Informe de cálculo | `engine/pro-report.ts` | verificaciones + `quantity-takeoff.ts` | no |
| Cómputo | `engine/quantity-takeoff.ts` | `AsProv`, separación de estribos → kg de acero **de armadura** / m³ de hormigón | no |
| Tabla CIRSOC 301 | `ProVerificationTab.svelte:1417-1450` | `runSteelVerification()` | **sí — y es el problema, ver §8** |

`verificationStore.getBaselineStatus()` (línea 459) sí consulta `steelMap` como tercer
fallback, pero sólo lo usan reportes legacy; el visor 3D usa `getDisplayStatus`, que no.

---

## 8. Capacidad metálica ya existente en el repositorio — auditoría

Hay **cinco** implementaciones de acero en el repo. Ninguna está conectada al flujo de
diseño PRO, y una de ellas presenta resultados como verificados sin autoridad detrás.

### 8.1 `web/src/lib/engine/codes/argentina/cirsoc301.ts` — 769 LOC, **VIVO Y PELIGROSO**

Contenido: `checkSteelTension` (D2), `checkSteelCompression` (E3, con Fe/Fcr),
`checkSteelFlexure` (F2, con Lp/Lr y reducción por pandeo lateral-torsional),
`checkSteelShear` (G2, con Cv), `checkSteelInteraction` (H1), y `verifySteelElement()`
que los orquesta. Base declarada: AISC 360 LRFD.

Problemas encontrados:

1. **Cero tests.** `grep -rl "verifySteelElement\|checkSteelFlexure" --include="*.test.ts"`
   → vacío. No hay benchmark externo, ni fixture a mano, ni test de propiedad.
2. **No está en el modelo de madurez.** No hay `MaturityRecord`, no hay `ClauseRef`, no hay
   `CapabilityMatrix`, no está registrado como `DesignCodeAdapter`. Vive fuera de toda la
   infraestructura de honestidad que el proyecto construyó para el hormigón.
3. **Se presenta como verificado.** `ProVerificationTab.svelte:1417` renderiza una tabla
   con `statusIcon(sv.overallStatus)` → `'✓'` verde. Sin etiqueta de madurez, sin banner
   provisional, sin nota. Un usuario ve un tilde verde sobre un cálculo sin un solo test.
   **Esto viola hoy, en `main`, la restricción "no presentar acero como verificado si no
   existe la autoridad".**
4. **Inventa geometría en silencio** (`verification-service.ts:330-333`):
   ```ts
   tw: section.tw ?? (section.b ? section.b / 10 : 0.01),
   tf: section.tf ?? (section.b ? section.b / 15 : 0.01),
   Fu: material.fu ?? material.fy * 1.25,
   ```
   Espesores de alma y ala inventados como fracciones del ancho, y una resistencia a
   rotura inventada como 1,25 fy. Nada de esto se declara al usuario.
5. **`Lb = L` cableado** (`verification-service.ts:332`). No hay modelo de longitud no
   arriostrada. Para una viga metálica el pandeo lateral-torsional es normalmente el estado
   límite que gobierna, y se está asumiendo la hipótesis más desfavorable sin decirlo — o
   la más favorable, si el usuario esperaba arriostramientos.
6. **Accesibilidad por debajo del estándar del resto del PRO.** `statusIcon()` devuelve
   un glifo suelto; no hay texto, ni `sr-only`, ni `aria-label`. Compárese con
   `OutcomeBadge.svelte`, que documenta explícitamente *"cada estado lleva un GLIFO y
   TEXTO, nunca color solo"*.

### 8.2 `engine/src/postprocess/steel_check.rs` (Rust/WASM) — inaccesible en la práctica

AISC 360 LRFD en Rust, con `check_ledger` (registro de chequeos evaluados/no evaluados).
Hermanos: `ec3_check.rs`, `cfs_check.rs`, `connection_check.rs`.
Exportado en `engine/src/lib.rs:1011` como `check_steel_members`, con binding en
`wasm-solver.ts:870`.

**Pero `web/src/lib/wasm` está en `.gitignore` y no existe tras un clone o un worktree
nuevo.** `checkSteelMembers()` devuelve `null` salvo que el usuario corra `npm run wasm`.
Único consumidor: el desplegable de código normativo de `ProVerificationTab` (`aci-aisc`,
`eurocode`, `cfs`). **Fuera de alcance de PR21 por la restricción de no tocar Rust.**

### 8.3 `engine/design-check-results.ts :: normalizeCirsoc301` / `normalizeWasmSteel` — muerto

Existen, están testeados (`__tests__/design-check-results.test.ts`), y **ningún código de
aplicación los llama**. Es un seam de normalización listo y sin conectar. `normalizeCirsoc301`
emite `elementType: 'other'` con el comentario *"Steel classification not available in
CIRSOC 301 results"*.

### 8.4 `engine/connection-design.ts` — 271 LOC, sin tests

CIRSOC 301 Cap. J: bulones (tabla J.3.2 con grados 4.6/5.6/8.8/10.9), soldadura de filete
(tabla J.2.4), aplastamiento. Consumido por `ProConnectionsTab.svelte`. Sin tests, sin
madurez declarada.

### 8.5 Catálogo de perfiles — **el mejor activo, y está impecable**

`lib/data/section-catalog.ts` + `iram-wf.ts`, `iram-hp-m.ts`, `iram-c.ts`, `iram-tees.ts`,
`iram-mc.ts`, `iram-angles.ts`, `iram-tubes.ts`, `steel-profiles.ts`.

15 familias con clasificación completa:

```ts
FamilyClassification {
  standard: string;                    // 'IRAM-IAS U 500-215-6', 'EN 10365', 'DIN 1025-1'
  standardsBody: 'DIN'|'CEN'|'IRAM-IAS'|'ASTM/AISC';
  country: string;
  material: 'hot-rolled-steel' | 'cold-formed-steel';
  series: 'i-beam'|'channel'|'tee'|'angle'|'hollow';
  fidelity: 'exact' | 'nominalDimensions' | 'propertiesOnly';
}
```

La honestidad ya está incorporada: la familia W declara `nominalDimensions` con la
desviación medida (mediana 0,65 %, p90 2,3 %, peor 5,5 %) y explica por qué la fuente es
internamente inconsistente. MC declara `propertiesOnly` — no hay contorno, no hay tensión
detallada.

Licencias: `steel-profiles.ts` atribuye correctamente eurocodepy (MIT, © 2026 Paulo Cachim).
Los IRAM son tabulaciones propias. **Sin problemas de licencia.**

### 8.6 El rol `steel` en el catálogo de reglamentos — ya existe, y hoy da error

```ts
// lib/codes/roles.ts:221
{ adapterId: 'cirsoc301-2018', role: 'steel', regulation: 'cirsoc-301',
  edition: '2018', nameKey: 'regulations.name.cirsoc301', family: 'cirsoc',
  maturity: 'UNSUPPORTED', requiresConfig: false,
  noteKey: 'regulations.note.textAvailableNotImplemented' }
```

Como no declara `availability`, por defecto es `AVAILABLE` → `optionsForRole('steel')` lo
ofrece y `bindRole()` lo acepta. Pero `validateStack()` entonces emite
`regulations.problem.unsupportedAdapter` con severidad **error**, y `roleUsable()` devuelve
`false`. Test existente que lo fija: `roles-revisions.test.ts:180`.

Consecuencia: **hoy el usuario puede seleccionar CIRSOC 301 y lo único que obtiene es un
error rojo en el stack de reglamentos.** Cambiar eso es una decisión de producto que hay que
tomar explícitamente (§10).

Los textos de CIRSOC 301-2018 **sí están en el repo**: `docs/codes/CIRSOC/markdown/cirsoc-301-2018/`
con los capítulos B, C, D (tracción), E (compresión), F (flexión), G (corte), H (interacción),
J (uniones), L (servicio) y ocho apéndices. Es decir, el `noteKey` es exacto: texto
disponible, no implementado.

---

## 9. Qué es reutilizable y qué está mal acoplado

### 9.1 Reutilizable tal cual, sin tocar

| Pieza | Por qué |
|---|---|
| `classifyElement()` | pura geometría |
| `computeStationDemands()` / `ElementDesignDemands` | demandas por estación y combinación, agnósticas de material |
| `resolveDesignAxes()` / `design-axes.ts` | selección de eje gobernante |
| `runOrientationDiagnostic()` | diagnóstico de orientación |
| `member-grouping.ts` | agrupar por elevación, plano, línea, conectividad, sección, material |
| `codes/capability.ts` | 5 facetas — genérico, sólo hay que sumar claves |
| `codes/maturity.ts` | genérico, y `deriveMaturity()` es justo la salvaguarda que necesitamos |
| `codes/roles.ts` | el rol `steel` ya está |
| `codes/regulation.ts`, `message.ts` | `ClauseRef`, `EngineMessage` |
| `data/section-catalog.ts` + IRAM | catálogo metálico completo con fidelidad declarada |
| `OutcomeBadge.svelte` | glifo + texto + `sr-only`; el patrón a seguir |
| `design-view.ts` (filtros, orden, `nextFailingId`) | agnóstico de material salvo columnas |
| `DesignTable.svelte`, `DesignFilterBar.svelte` | tabla y filtros genéricos |
| Visor 3D completo | el mapa de color lee `DisplayStatus`, que es agnóstico |

### 9.2 Genérico en el nombre, hormigón en el fondo

| Pieza | Acoplamiento concreto |
|---|---|
| `MemberContext` | `material: CodeMaterials { fc, fy, cover, stirrupDia, maxAggregateSize }` — hormigón puro |
| `MemberDesignOutcome` | `accepted?: ProvidedReinforcement`, `elementType: beam\|column\|wall` |
| `DesignCertificate` | genérico salvo `rebarHash` |
| `DesignCodeAdapter` | `verify(ctx, rebar: ProvidedReinforcement)`, `detailingLimits()` con `ld`/`ldh`/`lapSplice`/`rhoMin`/`rhoMax` |
| `CodeCapabilities` | `beams.{flexure,shear,torsion,regions,curtailment,anchorage}`, `columns.{...,ties}` |
| `CAPABILITY_KEYS` | 24 claves, todas de hormigón armado |
| `LimitingConstraint` | `barFit`, `barSpacing`, `cover`, `congestion`, `tieSpacing`, `minSteel`, `maxSteel` |
| `DESIGN_FAMILIES` (PR20) | `column beam slab wall footing` — sin eje de material |
| `DocumentAssembly` | `bars: BarPath[]`, `laps`, `fusions` |
| `quantity-takeoff.ts` | kg de armadura / m³ de hormigón |

### 9.3 Directamente mal acoplado (defectos)

| # | Defecto | Ubicación | Severidad |
|---|---|---|---|
| D1 | La familia de material no se persiste; se adivina con `fy > 80` en cuatro lugares independientes | `auto-verify.ts:75`, `verification-service.ts:279`, `cirsoc201-adapter.ts:108`, `member-context.ts:181` | alta |
| D2 | `MaterialPreset.category` se descarta al crear el material | `ProMaterialsTab.svelte:29`, `MaterialsTable.svelte:32` | alta |
| D3 | `buildAllMemberContexts` construye contexto de hormigón para todo elemento, con `fc = fy` del acero | `member-context.ts:233` | alta |
| D4 | Un miembro metálico se reporta `DEMAND_UNAVAILABLE` teniendo demanda disponible, y contamina los conteos | `candidate-search.ts:122`, `verification.svelte.ts:418` | alta |
| D5 | La tabla CIRSOC 301 muestra ✓ verde sin madurez, sin tests, sin nota | `ProVerificationTab.svelte:1417` | **crítica** |
| D6 | `tw`, `tf` y `Fu` inventados como fracciones, en silencio | `verification-service.ts:330-333` | alta |
| D7 | `Lb = L` cableado, sin modelo de arriostramiento | `verification-service.ts:332` | alta |
| D8 | `cirsoc301.ts` y `connection-design.ts` sin un solo test | — | alta |
| D9 | Etiqueta `'RC Design'` cableada en inglés, fuera de i18n | `ProPanel.svelte:73` | baja |
| D10 | `ProDesignTab` importado y no usado en `ProPanel` | `ProPanel.svelte:24` | baja |
| D11 | Preset "Acero ADN 420" listado como acero estructural; es acero de armadura | `material-presets.ts:23` | media |

D5 y D6/D7 son, en rigor, incumplimientos hoy vigentes de las restricciones permanentes que
vos fijaste. No los introdujo esta rama; los encontró.

---

## 10. Qué interfaces deberían generalizarse

**Principio rector propuesto:** un eje nuevo, `StructuralMaterial`, **ortogonal** al eje de
familia geométrica que ya existe. No un segundo árbol paralelo.

```
                 hormigón      acero        (futuro: madera, mampostería)
   viga            ✅ RC        🧪 exp.
   columna         ✅ RC        🧪 exp.
   losa            ✅ RC          —
   tabique         ✅ RC          —
   fundación       ✅ RC          —
   arriostramiento   —          🧪 exp.
   correa            —          🧪 exp.
```

### 10.1 A generalizar

| Interfaz | Cambio propuesto | Impacto |
|---|---|---|
| `Material` | `+ family?: StructuralMaterial` (`'concrete'\|'steel'\|'timber'\|'masonry'\|'other'`) + `familySource: 'declared'\|'inferred'` | migración en `file.ts`; nulo en el solver |
| `MemberContext` | `+ materialFamily: StructuralMaterial`; `material` pasa a unión discriminada `ConcreteMaterials \| SteelMaterials` | tocar cada adaptador — **es el punto** |
| `MemberDesignOutcome` | `accepted?: ProvidedReinforcement` → `accepted?: DesignSolution` (unión discriminada) | tocar `publishOutcomes`, tabla, documento |
| `DesignCodeAdapter` | `+ readonly materialFamily: StructuralMaterial`; `verify(ctx, solution: DesignSolution)` | el registro empieza a poder responder "¿qué adaptador para esta familia?" |
| `CAPABILITY_KEYS` | sumar claves metálicas (`steelTension`, `steelCompression`, `steelFlexureLTB`, `steelShear`, `steelInteraction`, `steelConnections`, `steelBracing`) | **compila con error en cada adaptador — eso es lo que queremos**: obliga a cada código a declararse |
| `DESIGN_FAMILIES` (PR20) | `DesignFamily` pasa a `{ member: MemberFamily; material: StructuralMaterial }` | conflicto con PR20 — ver §13 |
| `DocumentAssembly` | `+ steelMembers?: SteelMemberRecord[]` junto a `bars` | mínimo en la slice 1: sólo declarar la ranura |
| `verificationStore` | separar `steelOutcomes` de `outcomes`; `providedSummary` por familia | evita el defecto D4 |

### 10.2 Un estado nuevo, explícito

El eje `Maturity` ya tiene el vocabulario correcto, pero le falta un peldaño por debajo de
`IMPLEMENTED_PROVISIONAL`. `UNSUPPORTED` significa *"no puede computarse honestamente"*, y
lo que tenemos con el acero es distinto: *"hay un cálculo pero no hay autoridad que lo
respalde"*.

Propuesta: **no tocar `Maturity`** (es un contrato con tests y consumidores en planos y
certificados) y añadir en su lugar un valor de `DesignOutcomeKind`:

```ts
/**
 * Hay una implementación y produjo un número, pero no existe una autoridad de
 * cálculo verificable detrás: sin clause map, sin benchmark, sin matriz de
 * capacidades. NO es una certificación, NO cuenta como pass, NUNCA se muestra
 * en verde, y aparece con advertencia en todo export.
 *
 * Distinto de UNSUPPORTED (no hay implementación) y de VERIFIED (hay autoridad).
 */
| 'EXPERIMENTAL'
```

Con la invariante correspondiente en `assertOutcomeInvariants()`:

```ts
if (o.outcome === 'EXPERIMENTAL') {
  if (o.certificate) throw new Error(`${where}: EXPERIMENTAL nunca lleva certificado`);
  if (o.accepted)    throw new Error(`${where}: EXPERIMENTAL nunca asigna una solución`);
  if (o.reasons.length === 0) throw new Error(`${where}: EXPERIMENTAL sin motivo declarado`);
}
```

Y en el catálogo de roles, un tercer valor de `EditionAvailability` — o el uso del ya
existente — para que CIRSOC 301 pueda seleccionarse **sin** producir un error de stack, pero
marcando el proyecto como experimental. Decisión de producto pendiente, ver §14.

### 10.3 Qué debe seguir siendo específico de hormigón

Sin discusión, y sin renombrar:

- `ProvidedReinforcement`, `RebarGroup`, `RebarLayer`, `StirrupDef`
- `station-design-forces.ts :: verifyProvidedReinforcement` y todas las autoridades CIRSOC 201
- `candidate-enumerate-beam.ts`, `candidate-enumerate-column.ts`
- `codes/cirsoc201/**` (spacing, transverse-spacing, bar-geometry)
- todo `engine/detailing/**` referido a barras: `generate-beam`, `generate-column`,
  `lap-materialize`, `splice`, `joint-*`, `punching-shear`, `collision`, `coordination-search`
- `FloorFamily` y `family-record.ts`
- `quantity-takeoff.ts`
- `DetailingLimits` (`ld`, `ldh`, `lapSplice`, `rhoMin`, `rhoMax`)

**El acero necesita su propio conjunto**, no una reinterpretación de éstos. Un
`SteelMemberDesign` lleva perfil, grado, longitudes no arriostradas, clasificación de
sección, arriostramientos y uniones. No lleva recubrimiento ni longitud de anclaje.

---

## 11. Riesgos de duplicar lógica

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | **Copiar `ProDesignTab` a `ProSteelDesignTab`.** 422 LOC de sincronización tabla↔visor, memoización y manejo de selección que quedarían divergiendo. | Parametrizar por familia y compartir tabla, filtros y sincronización. Una tabla, dos proveedores de fila. |
| R2 | **Duplicar el umbral `> 80`.** Un quinto lugar. | Una sola función `materialFamilyOf(material)` con la inferencia y su procedencia, y borrar los cuatro. |
| R3 | **Renombrar una fórmula de hormigón.** Prohibido explícitamente y además fácil de hacer sin querer: `checkFlexure` existe en ambos mundos con significados incompatibles. | Ningún archivo bajo `codes/cirsoc201/` se importa desde código de acero. Test de lint que lo verifique. |
| R4 | **Dos `getDisplayStatus`.** Estados divergentes entre acero y hormigón. | Un solo `DisplayStatus`, dos proveedores; `EXPERIMENTAL` como estado de outcome, no de display. |
| R5 | **Segundo registro de adaptadores.** | El mismo `registry` de `code-adapter.ts`, con `materialFamily` como discriminante. |
| R6 | **Segundo pipeline de demandas.** `computeStationDemands` es agnóstico; recalcularlo daría dos respuestas. | Un solo cómputo de demandas, dos consumidores. Es exactamente la regla que el `DocumentModel` ya impone. |
| R7 | **Colisión de ids.** Elementos y materiales comparten espacio de ids; assemblies usan `beamLine`/`columnStack`. Un `steelLine` nuevo podría chocar. | Los ids de elemento son globales y únicos — no cambia nada. Los ids de assembly sí necesitan prefijo de familia. Test dedicado. |
| R8 | **Regresión en hormigón por generalizar `MemberContext`.** | La suite RC actual (275 archivos de test) corre sin cambios y debe dar resultados idénticos. Test de snapshot sobre un modelo RC conocido antes y después. |

---

## 12. Dependencias con PR19 y PR20

### PR19 — `pr/19-rc-cad-constructibility` (#90, ready, +159/−52)

Constructibilidad de detalle RC y handoff CAD. Toca `engine/detailing/**` y `lib/export/`.
**Sin superposición con acero.** El único punto de contacto es que ambos consumen
`DocumentModel`; PR19 no cambia su forma de manera que afecte una ranura metálica.

**Dependencia: ninguna. No se toca.**

### PR20 — `feat/pro-visual-system` (#125, draft, +73/−12)

Superposición real en cinco archivos:

| Archivo | Qué hace PR20 | Conflicto esperado |
|---|---|---|
| `components/pro/ProPanel.svelte` | +237 líneas; agrega pestaña `project`, reorganiza grupos | **alto** — PR21 agrega una entrada al grupo Análisis |
| `components/pro/ProRibbon.svelte` | archivo nuevo, 721 líneas; stages y `TAB_STAGE` | **medio** — hay que sumar el comando metálico al stage `design` |
| `lib/engine/design/design-families.ts` | archivo nuevo | **alto** — es exactamente el eje que hay que generalizar |
| `lib/store/design-run.svelte.ts` | +264 líneas; agrega `designFamilies()` | **alto** |
| `components/pro/design/DesignFamilyPanel.svelte` | archivo nuevo | **alto** |

Estrategia: **PR21 no anticipa la forma de PR20.** Añade su eje de material sobre lo que
hay en `main` y deja el punto de unión documentado. Cuando PR20 entre a `main`, PR21 hace
rebase y el merge de `design-families.ts` es una edición dirigida: `DesignFamily` pasa de
`string` literal a par `{member, material}`, y `DesignFamilyPanel` gana una segunda fila de
casillas. Está acotado a esos dos archivos.

Alternativa descartada: esperar a PR20. El usuario pidió explícitamente paralelismo, y el
90 % del trabajo de PR21 (familia de material, inferencia, estado experimental, tests de
no regresión) no toca nada de PR20.

### Otras ramas en vuelo

- **#132 `audit/basic-advanced-features`** toca `lib/data/structural-grades.ts` y
  `SectionStressPanel.svelte`. Si ese archivo define grados de acero, hay solapamiento
  potencial con la definición de familia de material. **Vigilar.**
- **#134 `perf/3d-viewport-perf-instrument`** toca el visor 3D. Sin solape con el mapa de
  color de verificación.

---

## 13. Estrategia recomendada de integración como PR21

1. **Rama:** `feat/pro-steel-family`, base `origin/main@542fc664`.
2. **Push inmediato** (política de respaldo del 2026-07-29) y **draft PR tras el primer
   commit coherente** — es una rama entregable, categoría 1 de la política.
3. **Nunca hacer merge de PR20 dentro de PR21.** Cuando PR20 llegue a `main`, `rebase`
   sobre `main`, no merge.
4. **Orden de integración recomendado:** PR19 (#90, ready) → PR20 (#125) → PR21.
   PR21 es el más joven y debe absorber los conflictos.
5. **Contrato de no regresión:** antes del primer commit funcional, capturar una línea base
   de resultados de diseño de hormigón sobre `pro-edificio-7p` (outcomes por elemento,
   utilizaciones, conteos del resumen) y convertirla en test. Cada commit posterior la
   respeta byte a byte.
6. **Frontera de auditoría:** ningún archivo bajo `engine/` (Rust), `web/src/lib/wasm`,
   `codes/cirsoc201/**`, ni `station-design-forces.ts` se modifica en PR21.

---

## 14. Primera vertical slice propuesta

Sigue la opción A–F que planteaste, acotada a lo demostrable con tests.

### Alcance

| Punto | Contenido |
|---|---|
| **A. Familia/material en la arquitectura** | `StructuralMaterial` como tipo; `Material.family` persistido y migrado; `materialFamilyOf()` con inferencia y procedencia (`declared` / `inferred-from-fy` / `inferred-from-section`); los presets dejan de tirar `category`; el catálogo de secciones aporta la segunda señal. Los cuatro umbrales `>80` se reemplazan por una llamada. |
| **B. Superficie de selección** | Entrada "Estructuras metálicas" en el grupo Análisis del panel PRO, con un panel propio. No toca ninguna familia de hormigón. La entrada existe siempre; su contenido depende de qué haya en el modelo. |
| **C. Reconocer miembros metálicos existentes** | Listar los elementos cuyo material resuelve a `steel`, con perfil, grado, longitud, y la procedencia de esa clasificación visible. Sin diseñar nada. |
| **D. Estado experimental / no diseñado** | Nuevo `DesignOutcomeKind = 'EXPERIMENTAL'` con su invariante. Los miembros metálicos se listan como `NOT_DESIGNED` (no hay autoridad ligada) o `EXPERIMENTAL` (hay cálculo sin respaldo). Nunca `VERIFIED`. |
| **E. Visor 3D y nomenclatura** | Los miembros metálicos participan del mapa de color con un tratamiento propio y distinguible sin color (patrón/glifo), reutilizando `DisplayStatus`. Cero barras inventadas, cero certificados. |
| **F. Puntos de conexión declarados** | Un archivo `steel-capability.ts` con la matriz de capacidades metálicas, todas las facetas en `false` y cada una con su `limitation` en palabras: perfiles, combinaciones, pandeo, flexión y corte, interacción, uniones, arriostramientos, exportes y planos. |

### Fuera de alcance explícito

- Cualquier verificación metálica nueva.
- Conectar `cirsoc301.ts` al flujo de diseño. **Está sin tests; conectarlo sería exactamente
  lo que pediste no hacer.** Lo que sí hace la slice es **etiquetarlo honestamente donde ya
  aparece** (defecto D5).
- Tocar Rust, WASM, solver, análisis global o autoridades CIRSOC de hormigón.
- Planos metálicos, planilla metálica, cómputo metálico.
- Uniones, arriostramientos, clasificación de secciones, longitudes no arriostradas.

### Sobre `cirsoc301.ts` y D5

Hay una tensión real entre dos de tus restricciones: *"si existe una capacidad metálica ya
implementada, auditala antes de crear otra"* y *"cada resultado experimental debe llevar
advertencia visible"*. La auditoría dice que la capacidad existe pero no es demostrable con
tests, y que hoy se muestra como verificada.

Mi recomendación: **la slice 1 no la conecta y sí la etiqueta.** Dos cambios acotados en
`ProVerificationTab.svelte`:

1. Banner experimental sobre la tabla CIRSOC 301, con las hipótesis explícitas
   (`Lb = L`, `tw`/`tf` inferidos, `Fu = 1,25 fy` cuando falta).
2. El glifo pasa a glifo + texto + `sr-only`, alineado con `OutcomeBadge`.

Eso toca una superficie de PR20 (`ProVerificationTab` cambia 242 líneas allí), así que es un
conflicto conocido y pequeño. La alternativa —dejarlo como está— significa que `main`
sigue mostrando acero en verde sin autoridad, que es precisamente lo que la restricción
prohíbe.

### Tests mínimos de la slice

| # | Test | Archivo propuesto |
|---|---|---|
| 1 | El diseño de hormigón da resultados **idénticos**: outcomes, utilizaciones y conteos sobre `pro-edificio-7p` | `design/__tests__/steel-noregression-rc.test.ts` |
| 2 | Modelo sin elementos metálicos → el panel informa "no hay", no un vacío | `store/__tests__/steel-inventory.test.ts` |
| 3 | Modelo con elementos metálicos → no se confunden con vigas/columnas de hormigón; `contexts` de hormigón los excluye | idem |
| 4 | Los estados metálicos aparecen en panel y en 3D con el tratamiento correcto | `viewport3d/__tests__/steel-colour-map.test.ts` |
| 5 | Ninguna superficie presenta acero como `VERIFIED`: invariante en `assertOutcomeInvariants` + barrido de los componentes | `design/__tests__/steel-never-verified.test.ts` |
| 6 | Sin colisiones de id entre familias: elementos, materiales, assemblies | `store/__tests__/steel-id-space.test.ts` |
| 7 | `designAll()` sobre un modelo mixto no toca ningún miembro metálico y no lo cuenta como `demandUnavailable` | `design/__tests__/steel-not-designed-by-global.test.ts` |
| 8 | Accesibilidad: cada estado metálico lleva glifo + texto + `sr-only`; foco visible; navegable por teclado | `components/pro/design/__tests__/steel-a11y.test.ts` |
| 9 | Migración: un proyecto guardado sin `Material.family` se abre y clasifica por inferencia, con la procedencia marcada | `store/__tests__/steel-material-migration.test.ts` |
| 10 | Auditoría de licencias: no se incorpora código externo en esta slice; el test fija la atribución existente de eurocodepy | `data/__tests__/attribution.test.ts` |

### Separación de estados al cierre (tu taxonomía)

Al terminar la slice, el informe de cierre declarará explícitamente:

- **Infraestructura lista:** eje de material, inferencia con procedencia, estado
  `EXPERIMENTAL`, matriz de capacidades metálicas, tests de no regresión.
- **Workflow experimental:** inventario de miembros metálicos, selección, visor.
- **Cálculo no disponible:** diseño metálico — no hay adaptador ligado.
- **Cálculo parcialmente implementado:** `cirsoc301.ts` y `connection-design.ts`,
  sin tests, etiquetados como experimentales donde aparecen.
- **Verificación certificable:** ninguna. Cero.

---

## 15. Decisiones que necesito de vos antes de escribir código

1. **CIRSOC 301 en el stack de reglamentos.** Hoy se puede seleccionar y produce un error
   rojo. ¿Lo dejamos así (el rol existe pero es inusable), o le damos una tercera vía
   —seleccionable y marcado como experimental, con el proyecto entero marcado en
   consecuencia? Lo segundo es más honesto y más trabajo.

2. **Etiquetar la tabla CIRSOC 301 existente (defecto D5).** ¿Autorizás tocar
   `ProVerificationTab.svelte` en esta slice? Es donde `main` hoy muestra acero en verde sin
   autoridad. Toca una superficie que PR20 también modifica.

3. **Ubicación de la superficie metálica.** ¿Pestaña propia "Estructuras metálicas" en el
   grupo Análisis, o sección dentro de la pestaña de diseño existente junto a
   hormigón? La primera es más limpia; la segunda anticipa mejor el selector de familias
   de PR20.

4. **`EXPERIMENTAL` como `DesignOutcomeKind`.** Confirmame que preferís esto a agregar un
   cuarto valor a `Maturity`. Mi recomendación es lo primero: `Maturity` es un contrato con
   consumidores en certificados y planos, y tocarlo mueve el suelo del hormigón.

5. **Presets de acero.** Los cinco que hay son norteamericanos (A36, A572, A992, A500) más
   "ADN 420", que es acero de armadura mal catalogado como estructural. ¿Los corrijo y sumo
   grados IRAM-IAS en esta slice, o lo dejo para después?
