# PR21 — handoff de integración

**Rama:** `feat/pro-steel-family` · **PR** [#135](https://github.com/lambdaclass/stabileo/pull/135)
**Base:** `origin/main@542fc664`
**Estado al 2026-08-12:** alcance cerrado. Motor, superficie metálica, generadores y su UI —
completos y testados. Lo pendiente está en §7.

---

## 1. Cómo leer esta rama

76 archivos, **+14124 / −76** (medido el 2026-08-21 con `git diff --stat cb93d7a2 HEAD`;
la cifra original de este informe, 52 archivos +9710/−28, es del 2026-08-12 y quedó
atrás). El contenido está en **57 archivos nuevos**; sobre archivos preexistentes hay
**19 ediciones**, todas justificadas abajo y en §3. Ese reparto es deliberado: #125 toca
253 archivos y #132 toca 61, y medí la superposición antes de escribir nada.

| Archivo existente | Líneas | ¿Lo tocan? | Qué se hizo |
|---|---|---|---|
| `lib/engine/design/member-context.ts` | +71/−1 | **no** | excluir metálicos del pipeline de hormigón |
| `lib/codes/roles.ts` | +57/−3 | **no** | opción `experimental` en el catálogo |
| `lib/model/provenance.ts` | +48/−5 | **no** | procedencia de generador + hipótesis como claves |
| `lib/codes/capability.ts` | +14/−0 | **no** | 10 claves de capacidad metálica |
| `lib/i18n/store.svelte.ts` | +19/−1 | **no** | fusiona los diccionarios de acero |
| `lib/templates/load-fixture.ts` | +19/−5 | **no** | passthrough de `rollAngle` |
| `lib/codes/__tests__/roles-revisions.test.ts` | +32/−1 | **no** | el test que fijaba el error rojo |
| `lib/store/model.svelte.ts` | +52/−10 | **sí, ambos** | `fixtureApi()` extraído + `Section.composition` |
| `lib/three/section-profiles.ts` | +52/−0 | **no** | `createSectionShapes` para perfiles compuestos |
| `lib/three/create-element-mesh.ts` | +9/−5 | **no** | extruir una lista de contornos |
| `components/pro/ProPanel.svelte` | +9/−1 | **sí, #125** | registrar Metálicas y Generadores |
| `components/pro/ProVerificationTab.svelte` | +3/−0 | **sí, #125** | banner experimental sobre la tabla 301 |
| `App.svelte` | +3/−1 | **sí, #125** | las dos entradas del desplegable Análisis |

**Sólo cuatro archivos chocan con trabajo ajeno, y suman 37 líneas.**

`App.svelte` es el que no estaba en la primera versión de este documento: la lista de
pestañas de `ProPanel` **no** alimenta el desplegable — eso está cableado en `App.svelte`, y
ahí hay que registrar cualquier pestaña nueva o queda inalcanzable.

---

## 2. Qué hacer cuando entre el PR #132 (perfiles y grados)

`#132` agrega `Material.gradeId`, `Section.profileFamily`, `structural-grades.ts` y
`non-metal-grades.ts`. Eso convierte una inferencia de esta rama en una declaración.

### 2.1 Conectar el catálogo de grados — 1 sitio

`lib/store/steel.svelte.ts`, dentro de `inventory()`:

```ts
      lookupGrade: undefined,   // ← reemplazar por:
      lookupGrade: (id) => {
        const g = gradeById(id);
        if (!g) return null;
        switch (g.family) {
          case 'hot-rolled':
          case 'cold-formed':
          case 'stainless':  return 'steel';
          case 'aluminium':  return 'aluminium';
          default:           return null;
        }
      },
```

Y lo mismo, si se quiere, en el `opts.lookupGrade` de `buildAllMemberContexts` — el hormigón
pasa entonces a decidirse por grado declarado en vez de por magnitud de `f'c`.

El contrato ya está testado en las dos direcciones: un grado declarado gana sobre la
magnitud, y un grado que el catálogo ya no conoce cae de nuevo en la inferencia. Ver
`steel-domain.test.ts` y `steel-excluded-from-rc.test.ts`.

**Efecto secundario esperado:** `anyInferred` pasa a `false` y el panel deja de mostrar el
aviso de "familia deducida". Eso es correcto, no una regresión.

### 2.2 Perfiles

`emit.ts` ya emite `Section.profileFamily` para perfiles simples. Hoy es una propiedad
inerte; con #132 pasa a ser el campo que ese PR define. **No hace falta tocar nada.**

Si #132 amplía el catálogo de perfiles, `profile-resolve.ts` los toma solos: resuelve por
nombre contra `ALL_PROFILES` y clasifica la simetría leyendo `FAMILY_CLASSIFICATION.series`,
así que una familia nueva queda clasificada por la misma regla sin que nadie la agregue a
mano. Lo único que hay que revisar es si alguna familia nueva es *properties-only* y
asimétrica: en ese caso `canCompose` la rechaza para perfiles múltiples, que es lo correcto,
y conviene confirmar que la razón se ve en la UI.

### 2.3 Presets de material

No los toqué, como pediste. `PLACEHOLDER_STEEL` en `emit.ts` existe sólo para que un modelo
generado tenga un material; declara `generator.assume.placeholderGrade` y desaparece en
cuanto se le pasa un grado real. Reemplazarlo es un cambio de una línea en el llamador.

---

## 3. Qué hacer cuando entre el PR #125 (PRO UI)

### 3.1 `member-context.ts` → nada

#125 no lo toca. La exclusión de metálicos entra limpia.

### 3.2 `auto-verify.ts` → borrar una constante duplicada

#125 agrega `rcCheckability()` y `CONCRETE_FY_CEILING = 80` — el mismo umbral, nombrado,
respondiendo la misma pregunta desde el lado del hormigón. Esta rama tiene
`CONCRETE_FY_CEILING` en `lib/engine/steel/material-family.ts`, con el mismo valor a
propósito.

**Después del merge**, en `auto-verify.ts`:

```ts
-const CONCRETE_FY_CEILING = 80;
+import { CONCRETE_FY_CEILING } from './steel/material-family';
```

Dos líneas. Y conviene que `rcCheckability` use `materialFamilyOf` para el caso
`notConcrete`, así el `gradeId` de #132 lo alcanza también — es un `if` de tres líneas.

### 3.3 `outcome.ts` → nada

#125 agrega `PROVISIONAL_BIAXIAL` a `DesignOutcomeKind`. Esta rama **no toca ese enum**: el
estado metálico vive en `SteelMemberStatus`, en su propio módulo. Fue una decisión, no un
descuido — un miembro de acero nunca entra al pipeline de hormigón, así que no puede producir
un outcome de hormigón, y los estados de los dos materiales tenían que quedar separados.

### 3.4 `ProPanel.svelte` y `App.svelte` → conflicto trivial, en dos lugares

Las pestañas se registran **dos veces** y hay que hacer ambas o la entrada no es alcanzable:

**`ProPanel.svelte`** — el tipo, el import y el bloque que la renderiza:

```ts
import SteelPanel from './steel/SteelPanel.svelte';
import ProGeneratorsPanel from './generators/ProGeneratorsPanel.svelte';
type ProTab = … | 'steel' | 'generators' | …
{:else if activeTab === 'steel'} <SteelPanel />
{:else if activeTab === 'generators'} <ProGeneratorsPanel />
```

(la lista `tabGroups` de `ProPanel` existe pero **no** alimenta la barra de navegación)

**`App.svelte`** — el desplegable real, junto a `pb-tab-design`:

```svelte
<button class="pb-dd-item" data-testid="pb-tab-steel" …>{t('steel.panel.title')}</button>
<button class="pb-dd-item" data-testid="pb-tab-generators" …>{t('generator.ui.title')}</button>
```

y sumar `'steel'` y `'generators'` al array de `group-active` de ese grupo.

Resolución: quedarse con la estructura de #125 y reinsertar esas líneas. Si el ribbon de #125
ya está, la entrada natural es el stage `design`, grupo `rc`:

```ts
{ id: 'steel', labelKey: 'steel.panel.title', icon: 'element', tab: 'steel' },
{ id: 'generators', labelKey: 'generator.ui.title', icon: 'element', tab: 'generators' },
```

y sumar `steel: 'design'` y `generators: 'model'` al mapa `TAB_STAGE` — los generadores son
una herramienta de modelado, no de diseño.

**El E2E lo verifica.** `e2e/generators-steel.spec.ts` llega a las dos pestañas por el
desplegable, así que un merge que rompa el registro falla ahí en vez de pasar desapercibido.

### 3.5 `ProVerificationTab.svelte` → conflicto trivial

Tres líneas: el import y `<SteelExperimentalBanner />` inmediatamente debajo de
`{t('pro.cirsoc301')}`. Si #125 movió o rehízo esa tabla, el banner tiene que ir **arriba de
la tabla, no abajo** — hay un test que lo verifica por posición
(`steel-keys.test.ts`, *"sits above the CIRSOC 301 table"*).

### 3.6 `model.svelte.ts` → el único conflicto real

#125 toca las líneas 37, 714 y 1237. #132 toca las interfaces `Material` y `Section`
(~61, ~116). Esta rama extrae `fixtureApi()` alrededor de la línea 2870. **Están lejos y no
deberían chocar**, pero es el archivo con más manos encima, así que vale mirarlo.

Si el merge se complica: `fixtureApi()` puede volver a ser una copia local dentro de
`generator-apply.ts`. Se pierde la garantía de que las dos listas de bindings no diverjan,
que es justo lo que la extracción compra.

### 3.7 i18n → conflicto acotado, no cero

Las claves del acero viven en `locales/steel/{es,en,pt}.ts` y se fusionan en
`store.svelte.ts`, que ninguno de los dos PRs toca. Eso sigue igual. Lo que ya no vale
es la afirmación original de este informe ("`es.ts` y `en.ts` quedan intactos"): desde
entonces los diccionarios compartidos crecieron **+82 líneas cada uno** (`conn.*`,
`proRibbon.*`, `profileSelector.*`). Son adiciones puras — no se reescribe ninguna clave
existente — así que un choque con #125 o #132 seguiría siendo de fusión mecánica, pero
hay que verificarlo en el rebase en lugar de asumirlo.

**Cuando ambos hayan entrado**, fusionarlas dentro de los diccionarios principales es un
copiar y pegar, y ahí conviene traducirlas a los otros 12 idiomas (hoy caen a inglés, que es
lo que ya pasa con casi todos los namespaces fuera de `design.*`).

---

## 4. `main` ya se movió — lo que eso implica

Al 2026-08-13, `main` está 34 commits adelante de la base de esta rama (`542fc664` →
`3500b149`), y **ni #125 ni #132 entraron todavía**.

Un detalle que confunde si no se sabe: un `git diff origin/main` desde esta rama muestra
`web/.pro-audit.mjs` como **agregado, +43 líneas**. No lo agregó nadie acá. El commit
`f7607ecc` de `main` lo borró como código muerto, y esta rama —basada en el main anterior—
todavía lo tiene. El rebase se queda con la eliminación de arriba, porque esta rama nunca
tocó ese archivo. **Después del rebase, confirmar que el archivo sigue borrado.**

---

## 5. Orden recomendado

1. **#132 primero.** Superficie chica, no toca el diseño, y desbloquea §2.1.
2. **#125 después.** Es el grande.
3. **Rebase de PR21 sobre `main`**, no merge. Hoy la rama tiene 8 commits y ninguno depende
   de los otros dos PRs, así que el rebase es mecánico salvo por §3.4–3.6.
4. Correr `npm run typecheck`, `npx vitest run --project unit`, `--project build`,
   `npm run build`, `npm run check:gate` y `E2E_PORT=<libre> npx playwright test --grep @smoke`.

   **Poné `E2E_PORT` siempre.** El default es 4173 y `reuseExistingServer` está activo en
   local, así que si otro worktree ya tiene un preview ahí, Playwright **se engancha
   silenciosamente al bundle de esa otra rama** — construido sin `VITE_E2E=1`, así que todo
   fixture de PRO expira esperando un `window.__stabileo` que ese build nunca emitió. Me pasó
   en esta sesión: el preview de PR20 estaba en 4173 y dos corridas mías dieron fallos que no
   eran míos. El comentario en `playwright.config.ts` ya lo advierte.
   La huella del hormigón (`rc-baseline-digest.test.ts`) tiene que seguir dando
   `c6a055ef135d0a71` — regrabada el 2026-08-15 contra `origin/main@d6b32ff0` (el
   valor anterior, `1bd4d9c1d575b085`, quedó obsoleto por un cambio de `main`, no de
   esta rama; la evidencia está en el comentario del propio test, líneas 139–180).

**Sobre la única falla que da la suite E2E completa en macOS:**

`rc-design-visual.spec.ts › overlay legend` — comparación de captura. **No es de esta rama.**
Comprobado: las imágenes *actual* y *expected* tienen contenido idéntico (mismas etiquetas,
mismos swatches, mismo orden) y el diff está repartido sobre todos los glifos, que es la firma
del rasterizado de fuentes y no de un cambio de contenido. Además:

- el `README.md` de `e2e/__screenshots__/` dice que las baselines `darwin/` son **sólo para
  desarrollo local y que el CI nunca las lee** — la autoritativa es `linux/`;
- el test usa `expect.soft` y su describe se llama *"visual baselines (non-blocking)"*;
- está marcado `@slow`, así que no entra en el gate de CI, que corre sólo `@smoke`.

No la regrabé: no es mía, el CI no la mira, y reescribir la baseline darwin desde otra máquina
sólo mueve el desajuste al que la grabó. Para regenerarla, el README explica el procedimiento.

**Sobre el único error de typecheck que reporta el gate hoy:**

```
src/lib/three/__tests__/support-gizmo-sharing.test.ts(16,7): 'ORIGIN' is declared but never read
```

No es de esta rama — está en `main` y lo verifiqué stasheando todos mis archivos y volviendo
a correr el gate. **#125 lo arregla**: borra esa constante. Así que después del merge el gate
queda en cero y ahí sí "typecheck limpio" vuelve a ser una señal utilizable. Hasta entonces la
lectura correcta es "1 error, preexistente, ajeno".

---

## 6. Las tres redes de seguridad, y cómo leerlas si se rompen

`lib/engine/design/__tests__/rc-baseline-digest.test.ts` fija el diseño de hormigón
**miembro por miembro** sobre el pórtico de 408 barras: outcome, constraints y utilización
certificada a cuatro decimales, resumido en una huella.

El gate agregado que ya existía afirma 386/22 y es **ciego** a un cambio que mueva
utilizaciones dejando los conteos quietos. Esta huella no.

**Si falla:** cambió el diseño de hormigón. Es un defecto de esta rama hasta que se
demuestre lo contrario. No regrabar la huella para que pase — buscar qué se movió. El
archivo lo dice en su encabezado.

Las otras dos:

**`generators/__tests__/generated-models-solve.test.ts`** — cada geometría generada resuelve
con el solver real. Es lo único que detecta un mecanismo. Ver §7.

**`e2e/generators-steel.spec.ts`** — cuatro propiedades que tienen que sobrevivir a que se
rehaga la UI, afirmadas sobre comportamiento y no sobre marcado:

| | |
|---|---|
| **G1** | el número al lado de Generar es el número que entra al modelo |
| **G2** | la figura de la sección muestra la **disposición**, no sólo el perfil |
| **S1** | ningún miembro metálico se presenta como verificado |
| **S2** | la advertencia experimental no se puede cerrar ni condicionar |

Ninguna afirma "el elemento es visible": esa aserción es verdadera en todos los modos de falla
que cubren.

---

## 7. Lo que esta rama NO hace

Ordenado según tu taxonomía.

**Infraestructura lista y testada**
- Generadores de cercha (5 tipos + media cercha), columna reticulada y nave.
- Composición de perfiles múltiples (7 disposiciones) por ejes paralelos.
- Resolución de perfiles del catálogo a propiedades centroidales y a su contorno canónico.
- Emisión a `JSONModel` y carga al store con procedencia y suposiciones.
- Proyección de la geometría a elevación e isométrica, y del perfil compuesto a su contorno.
- Eje de familia de material con procedencia de la clasificación.
- Estados metálicos con guardián de invariantes.
- Matriz de capacidades de CIRSOC 301, todas las facetas en `false` y todas `gate`.
- Exclusión de metálicos del pipeline de hormigón.
- **Solvencia verificada con el solver real**: cada geometría generada, cargada, resuelve con
  desplazamientos finitos y reacciones que equilibran. Ahí se encontraron los dos mecanismos
  del §7.

**Workflow experimental**
- Panel Metálicas: inventario, censo, empty states, avisos, lista de huecos.
- Panel Generadores: tres generadores, previsualización en elevación e isométrica, figura de
  la sección por renglón, conteos por rol, hipótesis desplegables. **UI a propósito mínima**
  — es la parte que se espera rehacer, y el E2E fija lo que tiene que sobrevivir a eso.
- CIRSOC 301 seleccionable como código del proyecto, marcado experimental, sin producir nada.

**Cálculo no disponible**
- Diseño metálico. No hay adaptador ligado y no lo habrá en esta rama.

**Cálculo parcialmente implementado**
- `codes/argentina/cirsoc301.ts` y `connection-design.ts`: existen, sin tests, ahora
  etiquetados donde aparecen.

**Verificación certificable**
- Ninguna. Cero.

**Fuera de alcance, pendiente**
- **Torsión de secciones cerradas por Bredt.** Hoy `j: null` declarado. Hay una vía de
  validación adentro del repo: el catálogo IRAM de tubos publica `j` para RHS/SHS, así que
  una implementación de Bredt se puede contrastar contra 100+ valores tabulados antes de
  aplicarla a un perfil compuesto. Es lo que la promovería de hipótesis a valor sostenible.
- **Traducción de las 180 claves a los 12 idiomas restantes.** Hoy caen a inglés, que es lo
  que ya pasa con casi todos los namespaces fuera de `design.*`.
- **Arriostramientos longitudinales** en la nave. Su ausencia es la razón por la que las bases
  de columna reticulada van empotradas por defecto (§8). Generarlos permitiría volver a
  articularlas, que es el modelo más honesto.
- **Cargas.** Un modelo generado sale sin casos de carga a propósito, y por eso apretar
  Resolver informa "sin resultados". Un generador de cargas de cubierta y viento sobre la
  nave sería el siguiente paso natural, y es trabajo de las autoridades CIRSOC 101/102, no
  de acero.

---

## 8. Los dos mecanismos, y por qué el test de solvencia se queda

`generators/__tests__/generated-models-solve.test.ts` corre cada geometría generada por el
solver real con una carga aplicada. Encontró dos mecanismos en los propios generadores, y
**ninguno de los tests de topología podía verlos**: simetría, conteos y coordenadas los
satisface un mecanismo perfectamente. Sólo el solver los ve.

**1. `rollerXZ` no sostiene verticalmente.** Se lee como "rueda a lo largo de la luz" y es lo
contrario: `solver-service.ts:1402` lo mapea a `{ rx: false, ry: true, rz: false }`, y esas
banderas significan **restringido** — libre en X *y en Z*. Toda cercha generada apoyaba sobre
un pin y un apoyo que no tomaba carga vertical. Ahora se emite `custom3d` con los GDL escritos
(`emit.ts :: support`), que además es más difícil de malinterpretar que un nombre que hay que
ir a buscar para creerle.

**2. Bases de columna reticulada articuladas.** La celosía arriostra la columna en su plano y
en ningún otro, así que un pin bajo cada cordón deja al par plegarse de costado. Una nave real
lo resiste con arriostramiento longitudinal, que este generador no coloca. El default de la
nave pasó a empotrado; elegir articulado sigue permitido y se declara con
`generator.assume.latticeBasesPinnedNoOutOfPlane`, **con un test que afirma que esa
configuración es inestable** — para que quede registrada y no se redescubra vía matriz
singular.

Ninguno de los dos era un defecto del solver. Antes de tocar nada verifiqué que `rollerXZ`
hace exactamente lo que su código dice.

**Ese test es el que hay que mantener verde al rehacer los generadores.** Es la única red que
detecta un mecanismo, y un mecanismo es el modo de falla propio de un generador de geometría.

---

## 9. El visor 3D dibujaba un perfil I para todo lo generado

Medido, no deducido. Con una cercha de cordón cajón y montante espalda-con-espalda:

```
2x UPN 100 []            shape=undefined → THREE.Shape de 13 puntos
2x L 50x50x5 ][ (h=8mm)  shape=undefined → THREE.Shape de 13 puntos
IPE 100                  shape=undefined → THREE.Shape de 13 puntos
```

Trece puntos es `createIShape`. Una sección generada no llevaba `shape`, así que **todas** —
compuestas y simples, canal y ángulo — caían en el `default:` de `createSectionShape`, que dice
*"Default to I-shape if we have h and b"* e inventa `tw` y `tf` a partir del canto.

Dos arreglos:

- **`Section.composition`** — qué es la sección, declarativamente. El visor lee eso y arma el
  contorno **real** desde la misma tabla de posiciones de la que salieron las propiedades, así
  que dibujo y números describen un solo conjunto. `createSectionShapes` devuelve una lista y
  `ExtrudeGeometry` la toma entera: las partes son una malla, una llamada de dibujo.
- **`shape` sólo para perfil simple**, y no es una elección estética.
  `resolveCanonicalSection` conmuta sobre `shape`, y en una sección compuesta eso lo llevaría a
  reconstruir el contorno de **una** parte, marcar la sección geometry-backed y **reemplazar en
  silencio** el A/Iy/Iz del conjunto por el de un perfil solo — el solver analizaría un doble
  canal como un canal. Hoy además falta `tw`/`tf`, así que caería en properties-only de todos
  modos, pero apoyarse en una dimensión ausente para no dar una respuesta equivocada es
  seguridad accidental. `built-up-extrusion.test.ts` fija la deliberada.

---

## 10. Un defecto encontrado que conviene no repetir

`steelStore` usaba un `$derived` a nivel de store. Un `$derived` así **sólo recomputa dentro
de un contexto reactivo**: leído desde una función común devuelve lo que tenía cuando se
creó, que para un store creado al importar es el inventario del modelo vacío. El test que
carga una cercha generada obtenía cero miembros mientras la función pura obtenía diecisiete.

Está reemplazado por un caché con clave `(modelVersion, hasDemands, authorityBound)`, que
lee bien en todos lados y sigue registrando la dependencia para los componentes. Vale
revisar si el mismo patrón aparece en otros stores.

---

## 11. Y una que no era un defecto

`buildSolverInput3D` compone `element.rollAngle + section.rotation`. Escribir los dos campos
para expresar una sola rotación da el doble del giro pedido — y eso era un error **mío**, en
el emisor, no del boundary: la composición es intencional y el comentario al lado lo dice.

Quedó fijado como contrato en
`lib/engine/__tests__/roll-composition-contract.test.ts`, con el porqué, para que el próximo
que lo vea no repita el diagnóstico.
