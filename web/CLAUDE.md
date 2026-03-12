# Stabileo — Structural Analysis Web App

Interactive 2D + 3D structural analysis application using the Direct Stiffness Method (DSM).
Educational tool with step-by-step solver visualization for civil/structural engineering.

## URLs

- **Producción**: https://stabileo.com (y https://stabileo.pages.dev — mismo deploy)
- **Dev local**: http://localhost:4000 (`npm run dev`)
- **Repo**: https://github.com/Batuis/dedaliano (privado)

## Deploy & Hosting

- **Hosting**: Cloudflare Pages (plan gratuito)
- **CI/CD**: GitHub Actions — cada push a `main` dispara build + deploy automático
- **Workflow**: `.github/workflows/deploy.yml` usa `cloudflare/wrangler-action@v3`
- **Secrets requeridos en GitHub**: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
- **Límite**: 500 deploys/mes (plan gratuito, se renueva el día 1 de cada mes)

### Tracking de deploys

| Mes | Deploys usados | Deploys restantes | Notas |
|-----|---------------|-------------------|-------|
| Feb 2026 | 3 | 497 | Migración inicial desde GitHub Pages |

### Política de deploy

- **NO pushear a main sin permiso explícito del usuario**. Solo pushear cuando él lo indique.
- Si hay cambios acumulados importantes o algo roto en producción, pedir permiso antes de pushear.
- Usar `localhost:4000` para desarrollo y previsualización de cambios. (Puerto 3000 reservado para otra app)
- Cada push a `main` = 1 deploy consumido. Agrupar cambios para minimizar deploys innecesarios.
- Antes de pushear, considerar: ¿vale la pena gastar un deploy por este cambio, o conviene acumular más?
- Recomendar al usuario si conviene pushear o esperar según la magnitud de los cambios.

## Tech Stack

- **Svelte 5** (runes: `$state`, `$derived`, `$effect`) + **TypeScript** (strict)
- **Vite 6** for build & dev server
- **Vitest** for testing (1117 tests, 22 suites)
- **Canvas 2D** for 2D rendering
- **Three.js** for 3D rendering (WebGL, Line2/LineMaterial for screen-space width bars)
- **KaTeX** for LaTeX equation rendering (DSM pedagogical wizard)
- **Pure JS solver** — no external math libraries; custom linear algebra in `matrix-utils.ts`
- **Units**: metric only (SI: m, kN, kN·m, MPa)

## Commands

- `npm run dev` — Start dev server (port 4000)
- `npm run build` — Production build to `dist/`
- `npm run test` — Run all tests (`npx vitest run`)
- `npm run test:watch` — Watch mode
- `npm run wasm` — Build Rust/WASM engine (optional, not required)

## Architecture

### Stores (Svelte 5 runes, `src/lib/store/`)

| Store | File | Purpose |
|-------|------|---------|
| `modelStore` | `model.svelte.ts` | Nodes, elements, materials, sections, supports, loads. CRUD + solver dispatch |
| `uiStore` | `ui.svelte.ts` | Tool selection, UI modes, selections, panels, toasts, 2D/3D mode |
| `resultsStore` | `results.svelte.ts` | 2D + 3D results: displacements, reactions, element forces, diagrams, stress |
| `historyStore` | `history.svelte.ts` | Undo/redo via model snapshots |
| `dsmStepsStore` | `dsmSteps.svelte.ts` | Step-by-step DSM wizard data |
| `tabManager` | `tabs.svelte.ts` | Multi-tab project management with per-tab state capture/restore |
| `fileOps` | `file.ts` | File I/O, import/export, autosave, URL sharing |

### Engine (`src/lib/engine/`)

#### 2D Solver Chain
- `solver-js.ts` — Main 2D DSM solver (3 DOF/node: ux, uy, θz)
- `solver-detailed.ts` — Pedagogical variant (captures all intermediate matrices)
- `diagrams.ts` — M(x), V(x), N(x) computation + deformed shape (Hermite interpolation)
- `section-stress.ts` — Normal/shear/Von Mises stress, Jourawski shear flow

#### 3D Solver Chain
- `solver-3d.ts` — 3D DSM solver (6 DOF/node: ux, uy, uz, θx, θy, θz)
- `diagrams-3d.ts` — My(x), Mz(x), Vy(x), Vz(x), N(x), T(x) computation
- `section-stress-3d.ts` — Biaxial bending σ = N/A + Mz·y/Iz + My·z/Iy, torsion τ_T

#### Shared / Advanced
- `pdelta.ts` — Second-order P-Delta iterative analysis
- `buckling.ts` — Linear buckling (eigenvalue)
- `modal.ts` + `mass-matrix.ts` — Natural frequencies & mode shapes
- `plastic.ts` — Plastic hinge formation
- `moving-loads.ts` — Moving load envelopes
- `matrix-utils.ts` — Gaussian elimination, eigenvalue QR, matrix ops
- `spectral.ts` — Spectral analysis (seismic)

### Canvas 2D Rendering (`src/lib/canvas/`)

- `draw-diagrams.ts` — M, V, N filled polygons + color maps
- `draw-deformed.ts` — Deformed shape with hinge corrections
- `draw-loads.ts` — Load arrows, distributed loads, support symbols
- `draw-influence.ts` — Influence line diagrams
- `draw-modes.ts` — Animated modal/buckling shapes

### Three.js 3D Rendering (`src/lib/three/`)

- `create-element-mesh.ts` — Creates Line2 meshes + invisible picking helper cylinders
- `create-node-mesh.ts` — Creates node sphere meshes
- `create-load-arrow.ts` — 3D load visualization (arrows, distributed)
- `create-support-gizmo.ts` — 3D support symbols
- `deformed-shape-3d.ts` — 3D deformed shape with Hermite interpolation
- `diagram-render-3d.ts` — 3D diagram rendering (My, Mz, Vy, Vz, N, T)
- `selection-helpers.ts` — Color/selection utilities for 3D objects
- `section-profiles.ts` — Extruded section geometry for 3D visualization

### Key Components (`src/components/`)

- `Viewport.svelte` — 2D canvas: rendering, interaction, mouse handling
- `Viewport3D.svelte` — 3D WebGL viewport: Three.js scene, OrbitControls, raycasting
- `Toolbar.svelte` — Left sidebar: solve, diagrams, view, examples, file ops, config
- `FloatingTools.svelte` — Top bar: tool selection + sub-options
- `PropertyPanel.svelte` — Right panel: selected item properties
- `DataTable.svelte` — Bottom panel: tabular data (nodes, elements, materials, sections)
- `TabBar.svelte` — Multi-tab management (create, switch, rename, close)
- `dsm/StepWizard.svelte` — 9-step DSM educational wizard

## 2D/3D Mode Architecture

The app supports both 2D and 3D analysis modes, toggled via `uiStore.analysisMode` (`'2d'` | `'3d'`).

### Key Differences Between Modes

| Aspect | 2D | 3D |
|--------|----|----|
| DOF/node | 3 (ux, uy, θz) | 6 (ux, uy, uz, θx, θy, θz) |
| Solver | `solver-js.ts` | `solver-3d.ts` |
| Diagrams | M, V, N | My, Mz, Vy, Vz, N, T |
| Renderer | Canvas 2D (`Viewport.svelte`) | Three.js (`Viewport3D.svelte`) |
| Results store | `results`, `perCase`, `perCombo`, `envelope` | `results3D`, `perCase3D`, `perCombo3D`, `envelope3D` |
| Stress | `section-stress.ts` (uniaxial) | `section-stress-3d.ts` (biaxial + torsion) |

### Mode-Aware UI Pattern

When writing UI code that depends on results (selectors, diagrams, etc.), always check the mode:

```svelte
{@const is3D = uiStore.analysisMode === '3d'}
{@const caseKeys = is3D ? [...resultsStore.perCase3D.keys()] : [...resultsStore.perCase.keys()]}
{@const comboKeys = is3D ? [...resultsStore.perCombo3D.keys()] : [...resultsStore.perCombo.keys()]}
```

### 3D Picking Helpers

Line2 objects (from Three.js `three-fatline`) extend `Mesh`, not `Line`. Their raycasting is unreliable in wireframe mode, so invisible cylindrical `MeshBasicMaterial` helpers (opacity: 0, radius: 0.15) are attached to each element group for raycast picking.

**Critical**: These picking helpers are tagged with `userData.pickingHelper = true`. Any code that traverses element groups and modifies material properties (opacity, color, etc.) **must skip** picking helpers:

```typescript
group.traverse((child) => {
  if (child.userData?.pickingHelper) return; // ALWAYS skip
  // ... modify material
});
```

## Structural Engineering Concepts

### Element Types
- **Frame**: 3 DOF/node in 2D (ux, uy, θz), 6 DOF/node in 3D — transmits moment
- **Truss**: 2 DOF/node in 2D (ux, uy), 3 DOF/node in 3D — axial only
- **Hinges**: per-end moment releases (`hingeStart`, `hingeEnd`) via static condensation

### Support Types
- Fixed, pinned, rollerX, rollerY, rollerZ (3D), spring (with stiffness kx/ky/kz/krx/kry/krz)
- Prescribed displacements (dx, dy, dz, drx, dry, drz)

### Load Types
- Nodal (Fx, Fy, Fz, Mx, My, Mz), distributed (qI, qJ), point-on-element (P, a), thermal (ΔT, ΔTg)
- Self-weight from material density

### Analysis Capabilities
- Linear static (2D + 3D), P-Delta, buckling, modal, plastic collapse, spectral
- Load combinations with envelope (2D + 3D)
- Influence lines for reactions and internal forces (2D)
- Moving load envelopes (2D)
- Mechanism/instability detection (collinear all-hinged nodes, post-solve displacement check)

## Conventions

- **Language**: Spanish UI, English code/comments
- **State management**: Svelte 5 runes only (`$state`, `$derived`, `$effect`). No writable/readable stores.
- **Reactivity with Maps**: Reassign the entire Map on every mutation (`model.materials = new Map(model.materials)`) to guarantee `$state` property assignment triggers. `SvelteMap` proxy `.set()`/`.delete()` don't reliably trigger template re-renders.
- **Proxy safety**: Use `$state.snapshot()` to unwrap reactive proxies before serialization
- **File naming**: kebab-case for utilities, PascalCase for components
- **Testing**: Analytical benchmarks against known solutions, equilibrium checks (ΣF=0, ΣM=0)
- **No imperial units**: System forced to SI (metric)
- **Canvas**: All rendering in `requestAnimationFrame` loop inside `Viewport.svelte`; use `ctx!.` (not aliases like `c.`)

## Scalability Guidelines

### Principio general: archivos < 500 LOC, stores < 800 LOC, components < 600 LOC

Cuando un archivo crece más allá de estos límites, dividirlo proactivamente. No esperar a que sea inmanejable.

### Reglas para nuevas features

1. **Antes de agregar código a un archivo grande** (>500 LOC), considerar si la feature amerita un archivo nuevo.
2. **Un store = una responsabilidad**. Si `modelStore` maneja data Y solver dispatch, esas son 2 responsabilidades.
3. **Funciones puras sobre métodos de store**. Preferir `export function solveFull(model)` en archivo separado sobre `modelStore.solve()` como método del store.
4. **Componentes slot-based**. Si un componente Svelte tiene múltiples secciones colapsables independientes, cada sección puede ser un sub-componente.
5. **No duplicar lógica 2D/3D**. Usar patrón mode-aware con `is3D` flag y mapas condicionales en vez de bloques `{#if}` duplicados.
6. **Extraer helpers reutilizables**. Si una lógica de interacción (drag, box-select, etc.) se repite entre Viewport y Viewport3D, extraerla a un utility shared.

### Archivos a refactorizar (en próximas sesiones)

| Archivo | LOC actual | Acción sugerida | Prioridad |
|---------|-----------|-----------------|-----------|
| `model.svelte.ts` | ~3,000 | Extraer solver dispatch a `solver-service.ts` | P1 |
| `Toolbar.svelte` | ~2,400 | Extraer a sub-componentes: ToolbarSolve, ToolbarAdvanced, ToolbarFile, ToolbarConfig, ToolbarExamples | P2 |
| `Viewport3D.svelte` | ~2,600 | Extraer interaction/selection logic a utility compartido con Viewport.svelte | P3 |
| `Viewport.svelte` | ~2,600 | Idem anterior | P3 |
| `PropertyPanel.svelte` | ~1,100 | Split por tipo de entidad (Node, Element, Material, Section, Support, Load) | P4 |
| `DataTable.svelte` | ~1,300 | Split por tabla (Nodes, Elements, Materials, Sections) | P4 |

### Patrón para extraer sub-componentes de Toolbar

```
Toolbar.svelte (layout + delegation, ~300 LOC)
├── ToolbarSolve.svelte (~300 LOC) — Calcular + combinaciones
├── ToolbarAdvanced.svelte (~400 LOC) — P-Delta, Modal, Spectral, Buckling, Plastic, Moving Loads
├── ToolbarFile.svelte (~200 LOC) — Nuevo, Abrir, Guardar, Exportar, Compartir
├── ToolbarConfig.svelte (~200 LOC) — Grilla, Modelo, Resultados
└── ToolbarExamples.svelte (~150 LOC) — Templates 2D + 3D
```

### Patrón para extraer solver service

```typescript
// src/lib/engine/solver-service.ts
import { solve as solve2D } from './solver-js';
import { solve3D } from './solver-3d';
import { solveCombinations } from './combinations';

export async function solveFull(model: StructureModel, is3D: boolean) {
  const results = is3D ? solve3D(model) : solve2D(model);
  // ... dispatch to resultsStore
  return results;
}
```

Esto permite que `modelStore` se enfoque solo en CRUD de datos, y el solver dispatch viva en un servicio separado que puede llamarse desde Toolbar o cualquier otro lugar.

## Testing

1117 tests across 22 suites in `src/lib/engine/__tests__/` and `src/lib/dxf/__tests__/`.

Key test patterns:
- Cantilever beam (known analytical solution: δ = PL³/3EI)
- Simply supported beam, continuous beams, frames, trusses
- Three-hinge arch, Gerber beam (valid all-hinged structures)
- Equilibrium verification on every test case
- Mechanism detection (singular matrix, large displacement)
- Thermal loads, prescribed displacements, spring supports

## Data

- `src/lib/data/steel-profiles.ts` — 100+ European steel profiles (IPE, HEB, HEA, UPN, L, RHS, CHS)
- `src/lib/templates/generators.ts` — Parametric structure generators
- `src/lib/store/model-examples-2d.ts` — 2D example structures (8 templates)
- `src/lib/store/model-examples-3d.ts` — 3D example structures (8 templates)

## Stress Analysis

### 2D (`section-stress.ts`)
- **σ(y)**: Navier formula — `N/A + M·y/Iz`
- **τ_xy(y)**: Jourawski formula — `V·Q(y) / (Iz·b(y))` — signed (follows V sign for Mohr's circle)
- **Shear flow**: `computeShearFlowPaths()` returns directional flow along wall centerlines:
  - I/H: 5 segments (2 top flanges inward, web down, 2 bottom flanges outward)
  - U: 3 segments (1 top flange → web → 1 bottom flange)
  - L: 2 segments (vertical leg → horizontal leg)
  - RHS: 6 segments with q₀ closed-section correction (top outward, sides down, bottom inward)
  - CHS: 2 semicircles (q₀ = 0 by symmetry)
  - Rect: single vertical segment
- **Mohr's circle**: plane stress with σ_y = 0
- **Failure**: Von Mises (`√(σ² + 3τ²)`) and Tresca

### 3D (`section-stress-3d.ts`)
- **σ(y,z)**: Biaxial Navier — `N/A + Mz·y/Iz + My·z/Iy`
- **τ_Vy, τ_Vz**: Separate Jourawski for each shear component
- **τ_T**: Bredt formula for closed sections, Saint-Venant for open sections
- **Imports shared helpers**: `resolveSectionGeometry()`, `computeMohrCircle()`, `checkFailure()`

## File I/O

- JSON project save/load
- DXF import/export (`src/lib/dxf/`) — **R12 (AC1009) format** using POLYLINE/VERTEX/SEQEND (not LWPOLYLINE)
- URL sharing via LZ-compressed base64 hash
- PNG viewport export
- Autosave to localStorage
- IFC import (3D only, via web-ifc WASM — dynamic import)

## Feedback System

Los usuarios pueden enviar feedback desde stabileo.com usando el widget flotante (botón rojo abajo a la derecha).

### Dónde se almacenan los feedbacks

Los reportes se crean como **GitHub Issues** en el repo privado `Batuis/dedaliano`:
- **URL**: https://github.com/Batuis/dedaliano/issues
- **Arquitectura**: `FeedbackWidget.svelte` → POST `/api/feedback` → Cloudflare Pages Function (`functions/api/feedback.ts`) → GitHub Issues API

### Labels automáticos

| Tipo de feedback | Label en GitHub | Título del issue |
|-----------------|----------------|------------------|
| Bug / Error | `bug` | `[Bug] descripción...` |
| Sugerencia | `enhancement` | `[Sugerencia] descripción...` |
| Otro | `feedback` | `[Otro] descripción...` |

### Cómo revisar feedback pendiente

Ejecutar: `gh issue list --state open --label bug,enhancement,feedback`

O por separado:
```bash
gh issue list --state open --label bug        # Bugs/errores
gh issue list --state open --label enhancement # Sugerencias
gh issue list --state open --label feedback    # Otros
```

Para ver el detalle de un issue: `gh issue view <número>`

### Protocolo de revisión

Cuando el usuario pida "revisá el feedback pendiente":

1. **Primero listar bugs** (`--label bug`) con sugerencias de corrección y prioridad
2. **Luego sugerencias** (`--label enhancement`) con opinión técnica y plan de implementación
3. **Por último "otro"** (`--label feedback`) con análisis pertinente
4. Cerrar issues resueltos con `gh issue close <número>` solo cuando el usuario lo apruebe

### Datos incluidos en cada issue

Cada feedback incluye automáticamente:
- Nombre/alias del autor (opcional — campo en el formulario)
- Descripción del usuario
- Share link (URL con el estado del modelo al momento del reporte)
- Modo (2D o 3D)
- User agent del navegador

### Leaderboard de Colaboradores

- **Archivo**: `src/lib/data/leaderboard.ts`
- Se actualiza manualmente al resolver issues de feedback
- **Flujo**: revisar issues → identificar nombre del autor (campo "Autor" en el issue body) → actualizar array TOP 10 con `badgeForRank()` → deploy
- El widget de feedback muestra el leaderboard desde la burbuja flotante (botón "🏆 Leaderboard")
- El campo "nombre" es opcional en el formulario y se incluye en el body del GitHub issue como `**Autor:** nombre`
- Los badges son: 🏆 (1°), 🥈 (2°), 🥉 (3°), ⭐ (4° en adelante)

## Known Limitations (3D)

- DXF export/import: disabled for 3D ("En desarrollo para 3D")
- SVG export: disabled for 3D
- Overlay comparison (Comparar selector): only works in 2D. In 3D, switching loads/combos works but overlay rendering is not yet implemented.
- Influence lines: 2D only (3D WASM available but no 3D renderer yet)
- Moving loads: available in both 2D and 3D
- Plastic collapse: 2D only (3D not yet implemented in WASM/JS engine)
- P-Delta, Buckling, Modal, Spectral: available in both 2D and 3D
