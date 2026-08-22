# M1 ↔ H1 — cuatro puntos de coordinación sobre archivos compartidos

**Rama que reporta:** `feat/pro-steel-m1` (PR [#156](https://github.com/lambdaclass/stabileo/pull/156), draft)
**SHA al escribir esto:** `69d08097`; actualizado sobre `f45bd3e7`
**Estado de los cuatro puntos:** **ninguno implementado.** Ninguno de los archivos listados
abajo fue modificado por M1.

---

## Cómo leer este documento

Los cuatro puntos aparecieron mientras M1 conectaba el catálogo de grados de #132. Ninguno es
urgente, ninguno bloquea a M1, y los cuatro caen en archivos que el protocolo de solapamientos
marca como de alto riesgo. Están acá con las ocho respuestas que el protocolo pide, para que la
decisión la tome quien coordine y no la rama que los encontró.

Un dato que ordena la lectura: **M1 no necesita ninguno de los cuatro.** Los tres primeros
mejoran la coherencia del código o la honestidad de un texto; el cuarto es limpieza. Si los
cuatro se posponen indefinidamente, M1 sigue siendo correcta — con la excepción del punto 3,
que es un texto que hoy dice algo que dejó de ser cierto, y ese sí tiene fecha de vencimiento.

Resumen de dueños propuestos:

| # | Punto | Dueño propuesto |
|---|---|---|
| 1 | `CONCRETE_FY_CEILING` duplicado | **Integración común** |
| 2 | Catálogo pasado a `member-context` | **H1** |
| 3 | `conn.gap.aluminium.scope` desactualizado | **M1, con autorización** |
| 4 | Consolidación de `profileSelector.*` | **Integración común** |

---

## Punto 1 — `CONCRETE_FY_CEILING` existe dos veces

### Problema

El umbral que separa «este `fy` es un f'c de hormigón» de «este `fy` es la fluencia de un
metal» está declarado dos veces con el mismo valor y sin relación entre las dos declaraciones.

```
src/lib/engine/steel/material-family.ts:54   export const CONCRETE_FY_CEILING = 80;   ← exportada
src/lib/engine/auto-verify.ts:46             const CONCRETE_FY_CEILING = 80;          ← local
```

Es deliberado y está documentado: el encabezado de `material-family.ts` (líneas 21–24) dice que
el valor se eligió igual **a propósito** para que la unificación fuera un movimiento posterior
de dos líneas. Lo que era una nota de PR21 sobre un PR en vuelo ahora es una duplicación entre
dos archivos que conviven en `main`.

Dos copias de una regla son dos oportunidades de discrepar. Nadie discrepa hoy; el riesgo es
futuro y es del tipo silencioso — si una de las dos se moviera a 90, `auto-verify` y la
superficie metálica clasificarían distinto el mismo material y nada fallaría.

### Archivos afectados

- `web/src/lib/engine/auto-verify.ts` — línea 46 (declaración), línea 68 (único uso).
- `web/src/lib/engine/steel/material-family.ts` — sin cambios; ya exporta la constante.

### Cambio propuesto

En `auto-verify.ts`:

```diff
-const CONCRETE_FY_CEILING = 80;
+import { CONCRETE_FY_CEILING } from './steel/material-family';
```

Dos líneas, más borrar el comentario de la declaración local (líneas 40–45), cuyo contenido ya
está en el archivo de destino y quedaría duplicado también.

Opcionalmente, y separado: `rcCheckability` podría usar `materialFamilyOf` para el caso
`notConcrete`, de modo que el `gradeId` de #132 lo alcance. Eso **no** es este punto — cambia
comportamiento, no sólo la procedencia de un número — y merece su propia decisión.

### ¿A quién pertenece?

**Integración común.** `auto-verify.ts` es hormigón y `material-family.ts` es acero: el cambio
es exactamente la costura entre las dos ramas y no hay una que lo contenga. Es el candidato
natural para hacerse en el momento de integrar, con las dos ramas presentes.

### Impacto sobre la otra rama

**Nulo en comportamiento.** El valor no cambia, así que ningún resultado de hormigón se mueve.
El impacto real es de forma: `auto-verify.ts` pasa a importar de `lib/engine/steel/`, y eso es
una dependencia nueva del hormigón hacia un módulo de acero.

Vale decirlo sin adornos, porque es el único argumento en contra: si la dirección de esa
dependencia molesta, la alternativa correcta no es duplicar el número sino moverlo a un módulo
neutro que ninguna de las dos familias posea. `material-family.ts` es puro y no importa nada del
acero salvo su propio dominio, así que la dependencia es benigna; pero es una decisión de
arquitectura y no la toma M1 sola.

### Tests requeridos

- `rc-baseline-digest.test.ts` — la huella `1bd4d9c1d575b085` debe quedar idéntica. Es la
  condición de aceptación: si se mueve, el cambio dejó de ser una unificación.
- `steel-domain.test.ts` ya afirma el corte exacto en el umbral, en las dos direcciones.
- Un test nuevo, de una línea, que afirme que las dos lecturas del umbral son el mismo objeto:
  `expect(rcCheckability({...}, modelWithFy(80.001))).toBe('notConcrete')` junto a
  `expect(materialFamilyOf({ fy: 80.001 }).family).toBe('steel')`. Con la constante compartida
  eso es una tautología; con dos copias es la aserción que las ata.

### Alternativa segura

Dejarlo como está y agregar un test —en el suite de acero, que es de M1— que afirme que los dos
valores coinciden, importando la constante exportada y leyendo la local por su efecto en
`rcCheckability`. No unifica, pero convierte la divergencia futura en un test rojo. **M1 puede
hacer esto sin coordinar**, y es la mitigación recomendada si el punto 1 se posterga.

### Quién debería implementarlo

Quien haga la integración de H1 y M1, en el mismo commit que resuelva los conflictos de
`auto-verify.ts` si los hubiera. Si la integración se demora, M1 implementa la alternativa
segura.

---

## Punto 2 — `member-context` sigue adivinando la familia del material

### Problema

`buildAllMemberContexts` acepta `opts.lookupGrade` (`member-context.ts:170`) y lo pasa a
`materialFamilyOf` (`:210`). Su único llamador de producción no lo pasa:

```
src/lib/store/design-run.svelte.ts:115   buildAllMemberContexts(md, { demands, stations, ... })
                                          ← sin lookupGrade
```

Así que la decisión «este miembro es de hormigón y entra al pipeline» se sigue tomando por la
magnitud de `fy`, cuando el proyecto puede tener el grado declarado. M1 conectó el mismo lookup
en la superficie metálica (`steel.svelte.ts`), así que hoy las dos superficies responden la
misma pregunta con distinta autoridad: el acero lee una declaración, el hormigón sigue
interpretando un número.

La asimetría no produce un error hoy. Produce dos cosas peores a mediano plazo: un usuario que
ve «familia declarada» en Metálicas y «familia deducida» en Diseño para el mismo modelo, y una
regla que hay que recordar mantener en dos lados.

### Archivos afectados

- `web/src/lib/store/design-run.svelte.ts` — línea 115, un argumento.
- `web/src/lib/engine/design/member-context.ts` — **ninguno.** El parámetro ya existe y ya se
  usa. Esto es importante: el cambio es en el llamador, no en el archivo compartido más caro.

### Cambio propuesto

```diff
       const contexts = buildAllMemberContexts(md, {
         demands: stationData.demands,
+        // La familia del material sale de lo que el proyecto declaró, no de la magnitud de f'c.
+        lookupGrade: catalogueGradeFamily,
```

con `import { catalogueGradeFamily } from '../engine/steel/grade-family';`.

### ¿A quién pertenece?

**H1.** `design-run.svelte.ts` es el orquestador del diseño de hormigón y el filtro que cambia
decide qué entra a ese pipeline. M1 aporta el módulo (`grade-family.ts`, ya en la rama) y el
diagnóstico; la decisión sobre el pipeline de hormigón es de la rama de hormigón.

### Impacto sobre la otra rama

Sobre M1: **ninguno.** La superficie metálica ya lee la declaración por su cuenta.

Sobre H1: potencialmente cambia **qué miembros se diseñan**, y por eso no es un cambio trivial
aunque sea una línea. El impacto medido:

- el catálogo de hormigón llega hasta 50 MPa (`non-metal-grades.ts`, CIRSOC/EN/ACI/NBR) y ningún
  grado metálico baja de 130 MPa, así que **no existe hoy un material catalogado donde la
  declaración y la inferencia difieran**;
- la diferencia aparece con un material **sin** grado declarado y con `fy` mal cargado, donde
  hoy y después se sigue infiriendo igual;
- y aparece de verdad el día que alguien cargue un hormigón de alta resistencia por encima de
  80 MPa. Hoy ese miembro sale del pipeline en silencio; con la declaración, entra. Eso es una
  corrección, no una regresión, pero mueve resultados y por eso pertenece a H1.

### Tests requeridos

- `rc-baseline-digest.test.ts` — la huella tiene que quedar en `1bd4d9c1d575b085`. Es la
  condición de aceptación y es exactamente para lo que la escribió PR21.
- El gate agregado 386/22 de `member-context` — sin cambios.
- `steel-excluded-from-rc.test.ts` — ya afirma la exclusión en las dos direcciones; agregar el
  caso con `gradeId` declarado.
- Un caso nuevo: hormigón de 90 MPa con `gradeId` de hormigón declarado **entra** al pipeline,
  y sin grado declarado **no** entra. Documenta la única diferencia real.

### Observación medida — no es sólo un cambio de procedencia

Esto se agregó después de escribir el punto, midiéndolo:
`web/src/lib/engine/steel/__tests__/member-context-lookup-observation.test.ts` (9 tests) inyecta
el lookup en su propia llamada, así que no toca nada compartido y sus aserciones siguen siendo
verdaderas antes y después de que H1 cablee el sitio de llamada.

La mitad metálica es un no-op, como decía el punto: acero y aluminio quedan fuera del pipeline de
las dos maneras, y sólo mejora la razón. Lo que el cableado además arregla **no es metálico**, y
es el motivo por el que vale que H1 lo lea:

> **Toda clase de madera catalogada entra hoy al pipeline de hormigón.**

EN 338 va de C16 a D60, así que las trece clases tienen resistencia característica **por debajo**
del techo de 80 MPa. `materialFamilyOf` lee la magnitud, responde `concrete`, el filtro conserva
el miembro, y **una viga C24 se diseña como si fuera hormigón de 24 MPa**. Con el lookup pasado,
el grado declarado dice `timber` y el miembro queda excluido — que es lo que hace la superficie
metálica desde `6d274e37`.

Dos cosas más que salieron de la misma medición, chicas y útiles:

- `ContextModelData.materials` no declara `gradeId` (el campo es posterior a la interfaz y
  `materialFamilyOf` lo lee defensivamente). Si H1 está en el archivo, conviene ensancharla.
- `MemberContext` guarda `verdict.family` y **descarta el basis** (`member-context.ts:245`), así
  que una superficie de hormigón no puede decir si la familia fue declarada o deducida — que es
  justo la distinción que el panel metálico muestra con `steel.panel.inferredWarning`. Si a H1 le
  sirve, es un campo.

### Alternativa segura

Pasar el lookup **sólo** a `buildAllMemberContextsUnfiltered` (`member-context.ts:303`), que es
la variante usada por diagnósticos y no decide qué se diseña. La superficie de diagnóstico gana
la declaración y el pipeline de diseño no se toca. No es lo ideal —deja la asimetría en el
camino que importa— pero es de riesgo cero y sirve como paso intermedio.

### Quién debería implementarlo

H1, cuando toque `design-run.svelte.ts` por su propio trabajo. M1 no lo hace ni con autorización:
el pipeline de hormigón no es su dominio.

---

## Punto 3 — `conn.gap.aluminium.scope` dice algo que dejó de ser cierto

### Problema

La tercera de las cinco limitaciones declaradas del panel de Uniones metálicas afirma que los
nudos de aluminio quedan fuera de la lista de nudos **aunque el inventario metálico sí los
liste**. Esa segunda mitad era cierta hasta que M1 conectó el catálogo de grados, y ya no lo es:
el inventario tampoco los lista — los nombra en un aviso
(`steel.notice.nonFerrousNotCovered`) y, si son el único metal del modelo, informa
`nonFerrousOnly`.

El texto no es peligroso: sigue advirtiendo sobre el aluminio y sigue diciendo que las tablas
de bulones y electrodos son de acero, que es la parte que protege al usuario. Pero describe un
comportamiento que la app ya no tiene, y lo hace en el bloque de la app cuyo único propósito es
decir la verdad sobre lo que no calcula. Es el peor lugar posible para una frase vencida.

**Esto lo causó M1.** No es deuda heredada.

### Archivos afectados

Tres diccionarios principales, una clave cada uno:

```
web/src/lib/i18n/locales/es.ts:4341   'conn.gap.aluminium.scope'
web/src/lib/i18n/locales/en.ts:4348   'conn.gap.aluminium.scope'
web/src/lib/i18n/locales/pt.ts:3535   'conn.gap.aluminium.scope'
```

Nótese que `pt.ts` tiene la clave en otra zona del archivo (3535 contra ~4340), así que un
parche por número de línea no sirve; hay que buscar por clave.

### Cambio propuesto

Reemplazar el valor por (es):

> Modelos con miembros de aluminio: sus nudos quedan fuera de esta lista, y el inventario
> metálico tampoco los lista — los nombra en un aviso. Además, las tablas de bulones y
> electrodos son de acero.

en (en):

> Models with aluminium members: their joints fall outside this list, and the metallic inventory
> does not list them either — it names them in a notice. The bolt and electrode tables are
> steel's, besides.

y en (pt):

> Modelos com membros de alumínio: seus nós ficam fora desta lista, e o inventário metálico
> também não os lista — ele os nomeia em um aviso. Além disso, as tabelas de parafusos e
> eletrodos são de aço.

La clave hermana `conn.gap.aluminium.missing` **no** cambia: dice que `materialFamilyOf` no
distingue aluminio de acero por magnitud de `fy` «hasta que el material declare su grado», y eso
sigue siendo literalmente cierto.

### ¿A quién pertenece?

**M1, con autorización explícita.** Uniones metálicas es Fase 5 del alcance de M1, la frase
habla de una superficie metálica, y el cambio de comportamiento que la venció es de M1. Lo único
compartido es el archivo donde vive el texto.

### Impacto sobre la otra rama

Sobre H1: **ninguno semántico.** Es un texto de un panel metálico; H1 no lo lee ni depende de
él. El impacto es puramente de merge: tres archivos que H1 puede estar tocando, una clave cada
uno. Un conflicto de una línea, trivial de resolver, en la zona `conn.*` que H1 no tiene motivo
para tocar.

### Tests requeridos

- El gate que M1 ya agregó (`steel-keys.test.ts`, «the joints panel speaks all three offered
  languages») afirma que las cinco limitaciones tienen sus cinco facetas en los tres idiomas, y
  que los ids salen del propio panel. Un reemplazo de valor lo mantiene verde por construcción.
- `steel-never-verified.test.ts` — el texto nuevo no puede introducir la palabra «verificado»
  fuera de una negación. El nuevo no la usa.
- Vale agregar, en el suite de acero, una aserción de que el texto no afirma que el inventario
  lista miembros no ferrosos, atada a `emptyReasonOf`. Es el tipo de test que evita que la frase
  se vuelva a vencer sin que nada lo note.

### Alternativa segura

Dos, y ninguna es buena:

1. **Sombrear la clave desde `locales/steel/*.ts`.** Funciona —la fusión es
   `{ ...es, ...steelEs }`, así que el namespace de acero gana— y está **descartada**: sería
   cambiar en silencio un texto que la otra rama ve en su archivo, exactamente lo que el
   protocolo prohíbe. Si H1 editara la clave principal, su cambio desaparecería sin rastro.
2. **Dejar la frase vencida y registrarla acá.** Es lo que M1 hace hoy. Sirve por días, no por
   semanas: es una declaración de limitaciones y su valor es que se pueda creer.

### Quién debería implementarlo

M1, en el mismo commit y en los tres idiomas, en cuanto haya un OK **y H1 cierre su commit de
i18n**: está agregando `design.floor.state.*` en esos mismos tres archivos, así que aplicar en
paralelo es un conflicto de una línea por archivo, trivial y completamente evitable esperando.

**Parche preparado, sin aplicar:** `docs/handoffs/patches/conn-gap-aluminium-scope.md` — los tres
diffs, la ubicación por clave (en `pt.ts` la clave está en otra zona del archivo, así que un
parche por número de línea no sirve), el impacto y el procedimiento de aplicación.

**Tests preparados y activos:**
`web/src/lib/engine/steel/__tests__/conn-aluminium-scope.test.ts` (10 tests) fija el
comportamiento que vuelve falsa la frase, verifica que el texto propuesto cumpla lo que tiene que
cumplir en los tres idiomas —incluida la regla de no-aprobación— y declara el estado actual del
diccionario embarcado. Al aplicar el parche se invierte **una** aserción, señalada en el archivo
con el comentario que lo dice.

Es el único de los cuatro puntos con urgencia real, y es el más chico de los cuatro.

---

## Punto 4 — las claves del selector de perfiles viven en dos prefijos

### Problema

PR21 puso las claves del selector de perfiles en los diccionarios **principales**:

```
web/src/lib/i18n/locales/es.ts:4072-4078   'profileSelector.title' … 'profileSelector.empty'
web/src/lib/i18n/locales/en.ts:4079-4085
web/src/lib/i18n/locales/pt.ts:4511-4517
```

M1 necesitó agregar claves al mismo componente y no podía tocar esos archivos, así que las puso
bajo `steel.profileSelector.*` en `locales/steel/{es,en,pt}.ts`. Resultado: el componente
`ProfileSelectorPanel.svelte` lee de dos prefijos para una sola pantalla.

Hay una consecuencia menos obvia y peor que la estética: las claves del prefijo principal **no
están cubiertas por la puerta i18n del acero**, que lee `locales/steel/*`. Las siete de PR21
existen en los tres idiomas hoy —lo verifiqué— pero nada lo afirma. Y M1 dejó una de ellas
huérfana a propósito: `profileSelector.empty` sigue en el diccionario principal describiendo
sólo el filtro de familia, mientras el componente ahora usa `steel.profileSelector.empty`, que
nombra los cuatro filtros. La vieja quedó sin uso.

### Archivos afectados

- `web/src/lib/i18n/locales/{es,en,pt}.ts` — siete claves a mover, una de ellas ya muerta.
- `web/src/lib/i18n/locales/steel/{es,en,pt}.ts` — destino.
- `web/src/components/pro/generators/ProfileSelectorPanel.svelte` — los `t()` de las siete
  claves viejas.

### Cambio propuesto

Mover las siete claves de PR21 al namespace de acero con el prefijo `steel.profileSelector.*`,
actualizar los siete `t()` del componente, borrar `profileSelector.empty` en vez de moverla —
está sin uso desde que M1 la reemplazó— y extender la lista de claves-plantilla de
`steel-keys.test.ts` para cubrirlas.

`dialog.profileSelector`, que también existe en los diccionarios principales, **no** se toca: es
de otra pantalla (el selector de Basic) y no de este componente.

### ¿A quién pertenece?

**Integración común.** Es limpieza de i18n a caballo de dos ramas, sin cambio de
comportamiento, y el momento correcto es cuando los dos árboles estén juntos y un conflicto de
diccionarios se resuelva una sola vez.

### Impacto sobre la otra rama

Sobre H1: **de merge, no de comportamiento.** Los diccionarios principales son los archivos con
más manos encima del repositorio; mover siete claves ahí durante el vuelo de dos ramas garantiza
un conflicto y no gana nada. Después de la integración es un movimiento mecánico.

Ninguna clave cambia de valor, así que ninguna pantalla cambia de texto en ningún idioma.

### Tests requeridos

- `steel-keys.test.ts` — extender la enumeración con las siete claves movidas. Es el test que
  hace que el movimiento sea seguro: si una queda sin traducir en un idioma, falla.
- E2E `generators-steel.spec.ts` y `steel-ui-redesign.spec.ts` — pasan por el panel y su
  desplegable; ninguna afirma sobre el texto, así que el movimiento no las toca. Verde antes y
  después es la señal de que sólo se movió la clave.

### Alternativa segura

Dejar los dos prefijos y agregar al gate del acero una aserción que lea los diccionarios
principales y verifique las siete claves de PR21 en es/en/pt — el mismo patrón que M1 ya usó
para las 77 claves `conn.*`, que estaban en la misma situación. Cierra el agujero de cobertura
sin tocar un archivo compartido. **M1 puede hacerlo sin coordinar**, y es la mitigación
recomendada si el punto 4 se posterga.

### Quién debería implementarlo

Quien haga la integración. Hasta entonces, M1 puede implementar la alternativa segura.

---

## Lo que M1 hace mientras tanto

De las cuatro alternativas seguras, dos son de M1 y no tocan nada compartido:

- **punto 1** → un test que ate los dos valores del umbral, para que una divergencia futura sea
  roja en vez de silenciosa;
- **punto 4** → extender el gate del acero a las siete claves de PR21 en los diccionarios
  principales, leyéndolos sin editarlos.

Las dos están implementadas en el commit que acompaña a este documento. Los puntos 2 y 3 quedan
esperando, y para los dos M1 dejó preparado lo que puede preparar sin tocar nada compartido:

- **punto 2** → la observación medida, con el hallazgo de la madera, en
  `member-context-lookup-observation.test.ts`. La decisión sigue siendo de H1;
- **punto 3** → el parche en los tres idiomas, su impacto y sus tests, en
  `patches/conn-gap-aluminium-scope.md` y `conn-aluminium-scope.test.ts`. Espera el OK y el
  commit de i18n de H1.

---

# Punto 5 — el campo `built` en `interface Section` (**ya hecho**, autorizado, aislado)

A diferencia de los cuatro puntos de arriba, éste no es una propuesta: está **implementado y
commiteado** en `feat/pro-steel-m1` como cambio contractual aislado, con autorización explícita. Se
reporta acá porque toca el archivo con más manos encima del repositorio y H1 tiene que saberlo antes
de que cualquier otro consumidor dependa del campo.

## Archivo y tipo

**`web/src/lib/store/model.svelte.ts`**, `interface Section`, hermano de `composition`:

```ts
built?: {
  /** Template id from `data/section-shapes.ts`, e.g. `I-custom`, `hollow-rect`, `C-custom`. */
  shapeType: string;
  /** The parameters as entered, in the units that template declares (metres for lengths). */
  params: Record<string, number>;
};
```

**Commit:** `ae3a6186` — `contract(section): record how a parametric section was built`. Propio y
único; no viene mezclado con nada del workflow CIRSOC 301.

El otro archivo que cambia es **`web/src/components/pro/ProSectionsTab.svelte`**, y conviene que H1
lo sepa porque **ese componente sirve también las plantillas de hormigón** (arranca en
`activeShape = 'concrete-rect'`). El cambio ahí es que `handleShapeConfirm()` pasa dos campos más
—`tl` y `built`— y **nada más**: ninguna sección de hormigón cambia de propiedades, de nombre ni de
camino.

## Compatibilidad

**Aditivo y opcional. No hay migración.**

- **Los modelos guardados siguen siendo válidos.** El campo es opcional; una sección sin él es una
  sección correcta y así queda (hay un test que lo exige explícitamente).
- **`snapshot()` y `restore()` no se tocaron.** El primero desestructura la sección entera
  (`const { canonical: _drop, ...rest } = v as Section`) y el segundo la copia, así que `.ded`,
  undo/redo y captura de pestaña ya lo llevan. **Cero cambios en la ruta de persistencia** — que es
  lo que hace al cambio aditivo de verdad y no sólo de nombre.
- **Es declarativo, como `composition`.** Nada en el camino de propiedades lo lee. `a`/`iy`/`iz`/`j`
  siguen siendo la autoridad y el resolvedor canónico no recibe una segunda opinión sobre la
  geometría. Un test lo fija: mutar `built.params` no mueve el área almacenada.
- **No se inventó `composition`.** `profileName` está documentado como nombre exacto de catálogo, y
  una sección paramétrica no tiene pieza de catálogo que nombrar. Tampoco se usó
  `ModelProvenance`: eso registra de dónde viene un **modelo**, y un proyecto puede mezclar una
  sección construida con perfiles de catálogo.
- **Ningún consumidor lo lee todavía.** El riesgo para H1 es **de merge**, no de comportamiento.

## Lo que arregló de paso

`computeSectionProperties` toma `tl` —espesor del labio de un conformado en frío— como entrada
propia y lo devuelve; `handleShapeConfirm()` enumeraba los campos a mano y ése no estaba en la
lista. `case 'C'` de `createSectionShape` sustituye entonces el espesor **del ala**: las propiedades
se calculaban con un labio y el contorno se dibujaba con otro. Coincidían mientras el usuario dejara
`tl = tf`, que es el default de la plantilla (0,009 m los dos). Ahora se pasa.

## Límite declarado que H1 debería conocer

**El link compartido no lleva el campo — y tampoco lleva nada más de una sección.** `compressV2` en
`utils/url-sharing.ts` codifica la sección como la tupla posicional
`[id, name, a, iz, {s,b,h,w,f,t,iy,j,rot}]`. Nunca llevó `tl`, `profileFamily` ni **`composition`**:
**un armado compartido por URL ya vuelve hoy sin su composición.** Eso es anterior a este cambio y
no lo arregla esta rama: ensanchar ese formato es una decisión versionada (`SHARE_VERSION`) sobre un
archivo compartido, y hacerlo unilateralmente sería exactamente lo que este protocolo evita.

**Queda propuesto para quien corresponda, no ejecutado.** El test lo fija como pérdida declarada, y
si alguien ensancha el codec tiene que venir a ese test y decir cuál de los tres campos ahora cubre.

## Tests

**`web/src/lib/store/__tests__/built-section-contract.test.ts` — 17 casos**, en cinco grupos:

| Grupo | Qué fija |
|---|---|
| **El registro** | guarda plantilla y parámetros; es copia y no referencia viva al formulario; registra **todos** los parámetros que la plantilla declara —recorriendo `SECTION_SHAPES`, no una lista a mano, que es exactamente cómo se perdió `tl` |
| **Suficiencia** | devolver `built` a `computeSectionProperties` reproduce las propiedades almacenadas, **para cada plantilla**; la plantilla nombrada existe; el campo **no** es autoridad de las propiedades |
| **Persistencia** | `snapshot`/`restore`, undo, redo; y la pérdida en el link compartido, aseverada explícitamente en vez de escondida |
| **Compatibilidad** | un snapshot con el campo borrado restaura limpio; los perfiles de catálogo y los armados **no** reciben un `built` fabricado; una sección paramétrica **no** recibe un `composition` falso |
| **Visualización** | se dibuja el labio que se tipeó; las ocho plantillas dibujan contorno propio (**ninguna cae al `default:`**); el contorno sobrevive a una recarga |

**Estado del gate:** `npm run test:unit` → **7109 pasan**. `npm run typecheck` → **sin errores
nuevos** contra la línea base (479).

## Lo que M1 no hizo, a propósito

No se tocó `StageSection`, `ProRibbon`, `WorkflowStages`, `DesignOverview`, `tokens.css`, el
selector general ni ningún catálogo compartido. El único contrato compartido que se movió es este
campo, que era el autorizado. PR #156 sigue en **draft**.

---

# Punto 6 — `'Z'` en la unión de formas (**ya hecho**, incompatibilidad demostrada)

Segundo —y por ahora último— toque de `model.svelte.ts` en esta rama. Se reporta con el mismo
detalle que el punto 5 porque es el mismo archivo.

## Archivo y tipo

Dos uniones de literales de string, una línea cada una:

- **`web/src/lib/store/model.svelte.ts:107`** — `Section.shape`, agregado `| 'Z'`
- **`web/src/lib/data/steel-profiles.ts`** — `type SectionShape`, agregado `| 'Z'`

**Commit:** `8f80481e` — `contract(section): add 'Z' to the shape union, and draw the zed`.

## Por qué era inevitable

`createSectionShape()` **despacha sobre `Section.shape`**. Una sección cuya forma no tiene literal
en esa unión no llega a ningún `case`: devuelve `null`, y en el visor eso se ve como **un miembro
que falta**, no como un error. No hay forma de dibujar un perfil Z conformado en frío sin el
literal, y falsear el despacho con otro campo sería peor que el cambio aditivo.

Eso es la «incompatibilidad demostrada» que habilitaba un segundo toque del archivo. Si no lo fuera,
no se tocaba.

## Compatibilidad

**Aditivo puro, y más barato que el punto 5.**

- Son uniones de literales: **todo valor existente conserva su significado** y ningún modelo
  guardado cambia. Nada se renombra, nada se reordena.
- **No hay campo nuevo.** Una sección Z guarda exactamente los mismos campos que una C:
  `h`, `b`, `tw`, `tf`, `t` (= largo del labio), `tl` (= espesor de la chapa). El visor lee lo que
  ya leía.
- **Ningún consumidor de hormigón cambia.** Un `switch` sobre `shape` que no tenga `case 'Z'`
  simplemente nunca lo ve, porque sólo el catálogo conformado en frío produce esa forma.
- **`snapshot`/`restore` sin cambios**, igual que en el punto 5.

**Lo que sí conviene que H1 sepa:** si en algún lugar del pipeline de hormigón hay un `switch`
exhaustivo sobre `SectionShape` sin `default`, TypeScript va a marcar el caso faltante. El
typecheck completo no reportó **ningún** error nuevo contra la línea base (479), así que hoy no
existe ninguno — pero si aparece uno al mergear, esa es la causa y el arreglo es un `case` o un
`default`, no revertir el literal.

## Tests

`web/src/lib/three/__tests__/cold-formed-shapes.test.ts`, 13 casos, ninguno necesita una imagen
renderizada: simetría puntual sobre la lista de vértices, área por *shoelace* contra la forma
cerrada, los repliegues degenerados, y el camino completo designación → entrada → campos de sección
→ `createSectionShape`.

Más el bloque C/Z completo: **61 tests nuevos**, `npm run test:unit` en **7170** (antes 7109),
typecheck sin errores nuevos.

## Un hallazgo preexistente que sale de acá y le toca a hormigón también

Escribir el contorno del Z destapó que la app **ya se contradice consigo misma en el canal**:
`computeSectionProperties` mide el labio desde la línea media del ala y `createCShape` lo dibuja
desde la cara exterior, así que el dibujo tiene `2t²` menos material que el cálculo — 8 mm² de 452
en un `C 100x50x15x2.0`.

No lo introduce este commit; el Z sigue cada convención donde la sigue el canal, para que la
discrepancia quede uniforme. Arreglarla toca `data/section-shapes.ts` (que tiene las plantillas de
hormigón) y `three/section-profiles.ts`: **archivos compartidos, decisión conjunta**. Está aseverada
en el test sobre el canal además del Z, precisamente para que no se arregle en un lado solo.

Detalle completo en `docs/handoffs/m2-cold-formed-limits.md`, límite 5.
