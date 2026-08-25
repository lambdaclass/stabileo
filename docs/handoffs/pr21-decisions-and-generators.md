# PR21 — Decisiones tomadas y diseño de los generadores metálicos

**Fecha:** 2026-08-12
**Continúa:** `pr21-steel-pro-audit.md`
**Rama:** `feat/pro-steel-family` · base `origin/main@542fc664`

---

## 1. Decisiones cerradas

| # | Pregunta | Decisión |
|---|---|---|
| 1 | CIRSOC 301 en el stack de reglamentos | **Seleccionable y marcado experimental.** No un error rojo. |
| 2 | Etiquetar la tabla CIRSOC 301 existente | **Autorizado.** Es una superficie distinta de la (1) — ver §2. |
| 4 | `EXPERIMENTAL` como `DesignOutcomeKind`, no como `Maturity` | **Confirmado** — ver §3. |
| 5 | Catálogos de materiales y secciones | **No tocar.** PR #132 los reescribe. PR21 se apoya en él — ver §4. |
| 3 | Dónde vive la superficie metálica | Resuelto por el alcance nuevo — ver §5. |

---

## 2. Por qué (1) y (2) son cosas distintas

Son dos superficies que hoy **no se hablan**, y esa desconexión es en sí un hallazgo.

**(1) El stack de reglamentos del proyecto** — `ProjectRegulationsPanel.svelte`, alimentado por
`regulationsStore` y `lib/codes/roles.ts`. Es la declaración de qué código gobierna el proyecto:
CIRSOC 101 para combinaciones, 102 para viento, 201 para hormigón, y el rol `steel` que hoy sólo
ofrece opciones `UNSUPPORTED`. Elegir CIRSOC 301 ahí produce
`regulations.problem.unsupportedAdapter` con severidad **error**.

**(2) La tabla de verificación metálica** — `ProVerificationTab.svelte:1417`, alimentada por
`runSteelVerification()` → `cirsoc301.ts`. Es donde se muestran los números.

La desconexión, verificada:

```
$ grep -c "regulationsStore" components/pro/ProVerificationTab.svelte
0
```

**La tabla de acero nunca consulta el stack de reglamentos.** Corre siempre, sobre todo elemento
con `fy > 80`, elijas lo que elijas en (1) — y hasta si el rol `steel` está sin bindear. Su
desplegable de código normativo (`normativeOptionsDefs`, línea 43) es una tercera fuente de verdad
sobre "qué código estoy aplicando", independiente de las otras dos.

Así que arreglar (1) no toca (2), y arreglar (2) no toca (1):

- **(1)** permite declarar CIRSOC 301 como el código de acero del proyecto, con la etiqueta
  experimental viajando al informe, a los planos y a los certificados.
- **(2)** hace que la tabla que ya existe deje de mostrar un tilde verde sobre un cálculo sin tests.

Y hay un tercer trabajo implícito que las une, y que es el que de verdad importa:
**la tabla debe leer el binding.** Si el proyecto no declaró un código de acero, la tabla no
debería correr; si declaró CIRSOC 301, debería decir bajo qué edición está calculando. Hoy no hace
ninguna de las dos.

---

## 3. `EXPERIMENTAL` vs `Maturity`, en concreto

Son dos preguntas distintas sobre objetos distintos.

**`Maturity` responde "¿cuánto confío en este cálculo?"** y se adhiere a una **capacidad** —
"flexión de vigas bajo CIRSOC 201-2025", "punzonado de losas". Tiene tres estados y una regla dura:
`deriveMaturity()` se niega a devolver `VALIDATED` sin al menos un benchmark externo en el archivo.
Ese valor fluye a `worstMaturity()`, que decide la madurez de un piso entero, y de ahí a
`DocumentModel.maturity`, a `PROVISIONAL_DRAWING_NOTE` en los planos y a los certificados.

**`DesignOutcomeKind` responde "¿qué le pasó a ESTE miembro en ESTA corrida?"** — cinco estados,
por elemento, por corrida, con `assertOutcomeInvariants()` como guardián en runtime.

Lo que necesitamos para el acero es lo segundo:

> *"El miembro 47 no fue diseñado porque no hay una autoridad de cálculo metálico ligada a este
> proyecto."*

Eso es un hecho sobre el miembro 47 en esta corrida. No es una afirmación sobre la madurez de una
capacidad — la capacidad, directamente, no existe.

**Por qué no tocar `Maturity`:** `Maturity` es un enum de tres valores consumido por
`worstMaturity()`, `countsAsVerified()`, `isProducible()` y `maturityLabelKey()`, más el catálogo
de roles, más los certificados de familia, más los planos. Agregarle un cuarto valor obliga a
revisar cada uno de esos consumidores y **cambia el significado de resultados de hormigón que hoy
son correctos**. Es mover el suelo del hormigón para resolver un problema del acero. Eso es
exactamente lo que la restricción "no cambiar el resultado del diseño de hormigón" prohíbe.

**Por qué `DesignOutcomeKind` sí:** el hormigón nunca va a producir `EXPERIMENTAL` — ningún
adaptador de hormigón lo emite. Es puramente aditivo. Los `switch` sobre outcomes ya existen y
suman una rama; los conteos suman un campo; la invariante suma un bloque.

```ts
/**
 * Hay una implementación y produjo un número, pero no hay una autoridad de cálculo
 * verificable detrás: sin clause map, sin benchmark, sin matriz de capacidades.
 *
 * NO es una certificación. NO cuenta como pass. NUNCA se muestra en verde.
 * Aparece con advertencia en todo export.
 *
 * Distinto de UNSUPPORTED (no hay implementación) y de VERIFIED (hay autoridad).
 */
| 'EXPERIMENTAL'
```

Los dos ejes siguen siendo ortogonales y siguen siendo verdaderos: el día que CIRSOC 301 tenga
cláusulas mapeadas y un benchmark de la propia norma, su capacidad pasa a
`IMPLEMENTED_PROVISIONAL` por la vía normal — evidencia, no un flag — y sus miembros dejan de salir
`EXPERIMENTAL` para salir `VERIFIED`. Ninguna de las dos cosas requiere volver a tocar la otra.

---

## 4. PR #132: sí, hay que apoyarse ahí

Lo revisé (`audit/basic-advanced-features`, +9367/−110, 53 archivos). **Contiene exactamente el eje
que mi auditoría dijo que faltaba, y mejor resuelto de lo que yo lo había propuesto.**

### Lo que aporta

`web/src/lib/data/structural-grades.ts` (601 líneas) + `non-metal-grades.ts` (191) separan dos ejes
que hoy están colapsados:

```
grado    ← lo que certifica la acería (EN 10025, ASTM A572, NBR 7007, IRAM-IAS U 500)
           E, nu, rho, fy, fu, y fy por banda de espesor
código   ← lo que aplica el ingeniero (CIRSOC 301, AISC 360, EN 1993-1-1, NBR 8800)
```

```ts
type GradeFamily  = 'hot-rolled' | 'cold-formed' | 'aluminium' | 'stainless';
type NonMetalFamily = 'concrete' | 'timber';
type GradeRegion  = 'AR' | 'US' | 'EU' | 'BR' | 'AU' | 'IN' | 'ZA';

interface StructuralGrade {
  id; designation; productStandard; region; family;
  e; nu; rho; fy; fu;
  byThickness?: ThicknessBand[];      // fy cae con el espesor — tabulado
  note?; sourced?;
}
```

Y lo persiste en el modelo:

```ts
interface Material { ...; gradeId?: string; }     // ← qué grado catalogado es
interface Section  { ...; profileFamily?: string; } // ← de qué familia de perfil salió
```

Más `commercialGrade()`, `isUnusualPairing()` — sabe qué combinaciones perfil/acero se laminan de
verdad.

### Por qué esto cambia el plan

Lo que yo iba a construir en el punto A de la slice era `Material.family` con inferencia por
`fy > 80` y una marca de procedencia. **`Material.gradeId` lo reemplaza y es estrictamente mejor**:
es un dato declarado, no inferido; viene con la norma de producto que lo respalda; y la familia
sale de `gradeById(id).family`, que ya distingue laminado en caliente de conformado en frío — una
distinción que CIRSOC 301 y CIRSOC 301-EL tratan distinto y que mi propuesta no capturaba.

También resuelve dos defectos de la auditoría sin trabajo extra:

- **D6** — `Fu = fy × 1,25` inventado. `StructuralGrade.fu` es un valor publicado.
- **D11** — "Acero ADN 420" mal catalogado. El catálogo nuevo lo reemplaza entero.

Y `byThickness` es un hallazgo que yo no tenía: **`fy` cae con el espesor**, y un chequeo que lo
ignore es inseguro por ~6 % en silencio. `cirsoc301.ts` hoy lo ignora.

### Mecánica

`gh pr view 132` reporta `mergeable: CONFLICTING`. Verifiqué contra qué:

```
CONFLICT: web/src/components/SectionStressPanel.svelte
CONFLICT: web/src/lib/section/__tests__/stress-state.test.ts
CONFLICT: web/src/lib/section/stress-state.ts
```

Tres archivos, todos en el área de tensiones de sección — colisión con el #133 que acaba de entrar
a `main`. **Ninguno toca `data/`, `store/model.svelte.ts` ni nada que PR21 necesite.**

**Recomendación:** no basar PR21 en la rama de #132. Esperar a que #132 entre a `main` (lo estimás
para mañana) y hacer `git rebase origin/main`. La rama de acero hoy sólo tiene documentación, así
que el rebase es gratis. Si #132 se demora más de lo previsto, rebaseamos sobre
`audit/basic-advanced-features` y después sobre `main` — pero es peor y sólo vale la pena si hay
que arrancar ya.

Consecuencia práctica: **el punto A de la vertical slice se reduce a conectar**, no a construir. Lo
que queda es `materialFamilyOf(material)` leyendo `gradeId` con caída a la inferencia legacy para
proyectos viejos, y borrar los cuatro umbrales `> 80`.

---

## 5. Alcance nuevo: los generadores

### 5.1 Qué son, y por qué cambian la respuesta a la pregunta 3

Con "superficie metálica" yo quería decir "las pantallas donde vive lo metálico" — mala palabra
para una pregunta que ahora tiene una respuesta más clara, porque son **dos cosas de naturaleza
distinta**:

| | Generadores | Diseño metálico |
|---|---|---|
| Qué hacen | **crean** nodos, barras y secciones | **verifican** barras que ya existen |
| Cuándo se usan | antes de resolver | después de resolver |
| Qué necesitan | geometría y catálogo de perfiles | demandas, combinaciones, un código |
| Autoridad de cálculo | **ninguna** | CIRSOC 301, que no tenemos |
| ¿Se puede terminar bien hoy? | **sí, completo y testado** | no |

Un generador de nave es una herramienta de **modelado**. No diseña nada, no verifica nada, no emite
un certificado. Por eso puede quedar terminado de verdad — que es exactamente lo que pediste:
"dejar todas las funciones lo más pulidas y testadas posibles".

**Propuesta de ubicación:**

- Los generadores son **diálogos modales**, como en las capturas. Un diálogo no es una pestaña, así
  que puede lanzarse desde donde tenga sentido: desde el stage **Modelo** del ribbon (que es donde
  se construye la geometría) y también desde el panel **Metálicas**. Una implementación, dos
  entradas. El ribbon de PR20 ya soporta que un comando viva en más de un stage.
- El panel **Metálicas** vive en el stage **Diseño**, junto a hormigón, y contiene el flujo de
  diseño: inventario de miembros metálicos, estado, advertencias, y los enlaces a los generadores.

Así no forzamos un generador dentro de "Diseño" por afinidad de material cuando lo que hace es
modelar, ni escondemos el diseño metálico dentro de "Modelo".

### 5.2 Lo que ya existe en el repo y sirve

| Pieza | Qué aporta |
|---|---|
| `lib/templates/load-fixture.ts` :: `FixtureLoader` | **la interfaz correcta**: un API abstracto de construcción de modelo (`addNode`, `addElement`, `addSection`, `addMaterial`, `addSupport`, cargas, constraints) que consumen el store y los tests por igual. Un generador es una función pura que produce un `JSONModel`; `loadFixture()` lo inserta. **Testeable sin store.** |
| `fixtures/3d-nave-industrial.json` | una nave a mano: 232 nodos, 633 barras, columnas reticuladas, cerchas, carrilera de puente grúa. Es el objetivo a parametrizar, y sirve de caso de regresión. |
| `lib/data/section-catalog.ts` + IRAM | 15 familias de perfiles con norma dimensional, país, material y **fidelidad declarada** por familia |
| `lib/section/canonical.ts` + `state.ts` | polígono canónico → A, Iy, Iz, Iyz, ejes principales, y **`J` con procedencia**, con una prohibición explícita de derivar `J` del polígono salvo familia circular |
| `Element3DMetadata.rollAngle` | giro del perfil **por barra**, que es lo que hace falta para las correas |
| `Section.rotation` | giro del perfil **por sección** |
| `lib/model/provenance.ts` :: `ModelProvenance` | ya viaja en `.ded`, en undo y en pestañas, y lleva `assumptions: string[]`. **Es el hogar natural de la procedencia del generador.** |

### 5.3 Lo que NO existe y hay que construir con cuidado

**a) Secciones compuestas.** Hoy no hay modelo de perfil compuesto. La nave de ejemplo las tiene
como **números escritos a mano con un nombre que dice "2L"**:

```json
{ "id": 2, "name": "Col cord 2L75", "a": 0.00114, "iz": 4.5e-7, "iy": 4.5e-7,
  "shape": "L", "h": 0.075, "b": 0.075, "t": 0.006 }
```

`shape: "L"` con área de una sola L y nombre de dos. La composición vive en el nombre y en ningún
otro lado. Un generador que produzca "doble ][" tiene que producir **propiedades reales**, no un
nombre.

La vía correcta, y que **no requiere tocar Rust**: teorema de los ejes paralelos sobre los valores
de catálogo de un perfil.

```
A  = n · A₁
Iy = Σ (Iy₁ + A₁ · dz²)
Iz = Σ (Iz₁ + A₁ · dy²)
```

Exacto, estándar, y auditable contra el propio catálogo. `buildSectionGeometry` acepta
`kind: 'custom'` con `outer` + `holes`, pero **un doble perfil separado por un huelgo son dos
regiones disjuntas**, que ese contrato no puede expresar. Así que la composición es analítica, no
poligonal.

**El problema abierto es `J`, y hay que resolverlo explícitamente:**

| Disposición | Torsión | Tratamiento honesto |
|---|---|---|
| Doble ][ separado, sin unión continua | abierta | `J ≈ Σ J₁`, declarado como hipótesis |
| Cajón [] (dos U enfrentadas) | **cerrada** | Bredt. `Σ J₁` está mal por órdenes de magnitud |
| Cuádruple en cuadrado | **cerrada** | Bredt |
| L simple / doble en X | abierta | `Σ J₁` |

`state.ts` ya tiene `jProvenance: 'unavailable'` con el comentario *"la rigidez torsional 3D no debe
proceder"*. Hay que ver qué hace el solver con eso antes de elegir: si bloquea el análisis, un
cajón sin `J` deja la nave sin resolver, y eso no sirve. **Es la única pregunta de ingeniería
realmente abierta de todo el diseño**, y hay que contestarla midiendo, no decidiendo.

**b) Rol de la barra.** `Element` no tiene un campo de rol. Las capturas colorean por rol —
Cordón / Montante / Diagonal / Correa / Viga / Columna — y los conteos son por rol. Derivarlo del
nombre de la sección es adivinar-desde-el-nombre, que es justo lo que este código evita en todos
lados. Hace falta un campo, o registrarlo en la procedencia del generador.

**c) `frame` vs `truss`.** La nave de ejemplo usa las dos: 358 `frame` y 275 `truss`. Una cercha con
montantes y diagonales biarticulados es un reticulado; los cordones normalmente son continuos. Esa
es **una decisión de ingeniería que el generador tiene que exponer**, no asumir en silencio. Va como
opción con un default declarado.

**d) Rotación "Auto".** En las capturas la correa muestra `Rot:: Auto` en verde y no es editable
hasta que se tilda "Personalizar rotación". "Auto" para una correa significa alinear el alma con la
pendiente del faldón — un valor **derivado que hay que guardar**, no recalcular al dibujar, porque
si el usuario cambia la pendiente después la correa ya está colocada.

### 5.4 Arquitectura propuesta

```
lib/engine/generators/                       ← puro: sin store, sin runes, sin i18n
├── truss-topology.ts      cerchas: trapezoidal · cordón paralelo · pratt · arco · media cercha
├── lattice-column.ts      columna reticulada
├── portal-frame.ts        pórtico de alma llena
├── shed.ts                nave: compone las anteriores + vigas + correas
├── built-up-section.ts    composición de perfiles (paralelos + J con procedencia)
├── member-roles.ts        cordón · montante · diagonal · correa · viga · columna
└── __tests__/

components/pro/generators/                   ← UI
├── TrussGeneratorDialog.svelte
├── LatticeColumnDialog.svelte
├── ShedGeneratorDialog.svelte
├── ProfileRoleEditor.svelte   perfil + rotación + composición + huelgo
└── GeneratorPreview.svelte    preview 2D + 3D con conteos por rol
```

**Contrato de cada generador — puro y testable:**

```ts
export interface TrussParams {
  kind: 'trapezoidal' | 'parallelChord' | 'pratt' | 'arch' | 'rolledPortal';
  spanM: number;
  heightM: number;
  camberM?: number;        // contrabanzo
  plateauM?: number;       // meseta (sólo trapezoidal)
  baseM?: number;          // base (sólo cordón paralelo)
  panelsPerHalf: number;
  halfTruss: boolean;      // media cercha
  archCurve?: 'semiArch' | 'parallelChord' | 'concave';
  profiles: Record<MemberRole, ProfileSpec>;
  chordContinuity: 'frame' | 'truss';
}

export interface ProfileSpec {
  profileName: string;                        // del catálogo
  rotationDeg: 0 | 90 | 180 | 270 | 'auto';
  composition: 'single' | 'doubleBack' | 'doubleU' | 'doubleX'
             | 'box' | 'quadBack' | 'quadSquare';
  gapMm: number;
}

/** Pura. Devuelve un JSONModel que `loadFixture` sabe insertar. */
export function generateTruss(p: TrussParams): GeneratedModel;

export interface GeneratedModel {
  json: JSONModel;
  /** Conteos por rol, para el preview y para el test. */
  counts: Record<MemberRole, number>;
  totalLengthM: number;
  slopePercent?: number;
  /** Hipótesis que el generador tomó. Van a ModelProvenance. */
  assumptions: EngineMessage[];
}
```

El preview de las capturas — *"43 barras · 47.29 m total · 20% pendiente"* con leyenda por rol — sale
directo de `counts` y `totalLengthM`. **El mismo objeto que testea el test es el que dibuja el
preview**, así que el preview no puede mentir sobre lo que va a generar.

`generateShed()` compone: llama a `generateLatticeColumn()` por columna, a `generateTruss()` por
pórtico, y agrega vigas longitudinales y correas. Un generador, no cinco caminos paralelos.

### 5.5 Composiciones de perfil

Lo que las capturas muestran para U/C:

```
Simple      Doble ][      Cajón []
```

Y lo que agregaste para ángulos:

```
Simple                       L
Doble espalda con espalda    L L      (⌐⌐)
Doble en U                   L  L     (⌐  ⌐)
Doble en X                   L / L
Cuádruple espaldas           LL LL
Cuádruple cuadrado           L L
                             L L
```

Con **huelgo en mm** en todas las compuestas. Cada disposición es un vector de desplazamientos
`(dy, dz)` y un espejado por perfil — es decir, una tabla de datos, no siete funciones. Y cada una
declara si el resultado es una sección **abierta o cerrada** a torsión, que es lo que decide el
tratamiento de `J`.

### 5.6 Qué se puede afirmar y qué no

Un generador **no** produce diseño. Lo que produce es geometría con perfiles asignados. Concretamente:

- ✅ **Sí puede afirmar:** los nodos están donde dice, las barras conectan lo que dice, la longitud
  total es ésa, el perfil es ése del catálogo con esa norma dimensional, la sección compuesta tiene
  esa A / Iy / Iz por ejes paralelos.
- ⚠️ **Debe declarar como hipótesis:** continuidad de cordones, `J` de la compuesta, rotación
  automática de correas, tipo de apoyo generado.
- ❌ **No puede afirmar:** que los perfiles elegidos verifiquen. Un modelo recién generado sale con
  todos sus miembros metálicos en `NOT_DESIGNED`, y eso tiene que estar a la vista desde el
  momento en que se genera — no descubrirse después.

Esa última línea es la que conecta el alcance nuevo con la auditoría: el generador es la mejor
fuente posible de miembros metálicos con los que probar el flujo de inventario y estado de la
vertical slice. Deja de necesitar un modelo de prueba armado a mano.

---

## 6. Plan revisado

### Fase 0 — mientras #132 no esté en `main`

Sin dependencia del catálogo nuevo. Todo puro y testable.

1. `lib/engine/generators/` — topologías de cercha, columna reticulada, pórtico laminado,
   con sus tests de geometría (nodos, conectividad, longitudes, simetría, pendiente, conteos por rol).
2. `built-up-section.ts` — composición por ejes paralelos, contra los valores de catálogo.
   **Antes: medir qué hace el solver con `jProvenance: 'unavailable'`.**
3. Línea base de no regresión del diseño de hormigón sobre `pro-edificio-7p`.

### Fase 1 — con #132 en `main`

4. `materialFamilyOf()` leyendo `gradeId`, con caída legacy. Borrar los cuatro `> 80`.
5. `EXPERIMENTAL` en `DesignOutcomeKind` + invariante.
6. Rol `steel` seleccionable y experimental; la tabla CIRSOC 301 pasa a leer el binding y a llevar
   banner + accesibilidad.
7. Panel **Metálicas**: inventario, estado, advertencias, empty states.

### Fase 2

8. `generateShed()` componiendo lo anterior + vigas + correas.
9. Diálogos con preview 2D/3D y conteos por rol.
10. Procedencia del generador en `ModelProvenance`, con sus hipótesis.

### Lo que este PR deja para el agente principal

Funciones puras, testadas y con contrato explícito. La UI de los diálogos queda funcional pero sin
pulir: es exactamente la frontera que pediste — nosotros dejamos el motor, él le da la forma final.
