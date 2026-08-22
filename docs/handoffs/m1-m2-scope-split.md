# Estudio de factibilidad — qué es M1 y qué es M2

**Desde:** `feat/pro-steel-m1@851fd57b`. **Sólo lectura sobre el árbol; nada implementado en este
documento.**
**Conclusión corta:** de los seis puntos del objetivo, **cuatro están sustancialmente hechos**,
uno necesita trabajo acotado y uno es M2 entero. Lo que queda de M1 son **cinco tareas chicas**;
lo que es M2 son **seis**, y tres de ellas requieren datos o autoridad que no existen.

**El riesgo principal de este bloque no es la implementación: es re-implementar lo hecho.** Por eso
el estudio empieza por medir el árbol y no por planificar.

---

## 1. Los seis puntos, medidos contra el árbol

| # | Punto | Estado | Evidencia |
|---|---|---|---|
| 1 | Reglamento seleccionable | **hecho**, con un hueco | `roles.ts:250` |
| 2 | Materiales | **hecho** | `lib/grades/catalogue.ts` |
| 3 | Secciones y perfiles | **hecho**, salvo perfiles delgados de catálogo | `lib/profiles/*` |
| 4 | Secciones construidas | **hecho**, con dos huecos | `create-element-mesh.ts:98` |
| 5 | Generadores | **hecho**, sin verificar una propiedad | `ProfilePicker` → `emit.ts` |
| 6 | Workflow guiado | **no existe** | — |

### 1.1 Reglamento — seleccionable y persistente, ya

- **Seleccionable:** el rol `steel` ofrece **CIRSOC 301:2018** (`adapterId: 'cirsoc301-2018'`,
  `experimental: true`, `maturity: 'UNSUPPORTED'`) y **EN 1993-1-1**. La arquitectura para otros
  reglamentos **es la que ya existe**: agregar uno es una entrada en el catálogo de `roles.ts` con
  su `maturity` y su `noteKey`.
- **Estado visible:** `SteelPanel` muestra la línea de código con la etiqueta experimental
  (`steel.panel.codeDeclared` / `codeExperimental`), y el panel de reglamentos marca el problema
  `regulations.problem.experimentalAdapter`.
- **Persistente: sí.** Éste es el punto donde mi reporte anterior se equivocó y conviene dejarlo
  escrito: los bindings **no** están en `file.ts` — viven en `modelStore.model.regulations` y pasan
  por `snapshot()`/`restore()`, que es lo que comparten las cuatro rutas de persistencia (`.ded`,
  undo, captura de pestaña, autosave). `regulations-persistence.test.ts` lo fija, y su encabezado
  documenta el defecto que cerró: un proyecto abierto de disco volvía silenciosamente a los
  reglamentos por defecto.
- **No se presenta nada como certificado:** `steelCountsAsVerified()` devuelve el literal `false`,
  los cuatro estados están intactos y hay dos suites que lo guardan.

**Hueco real:** el rol `steel` puede estar *bindeado y no configurado*, y la superficie metálica
distingue «declarado» de «utilizable» (`steelCodeDeclared` / `steelCodeUsable`) pero **no muestra
la edición** ni el `noteKey` del adaptador elegido. Un usuario que elige CIRSOC 301 ve que es
experimental; no ve *que el texto oficial está en el repositorio y que lo que falta es el
adaptador*, que es exactamente lo que la nota dice. **Acotado: M1.**

### 1.2 Materiales — hecho, reutilizando la base de Basic

`lib/grades/catalogue.ts` es una fuente sobre `structural-grades.ts` —la misma base que usa
Basic— con 68 grados metálicos y 38 no metálicos, y expone lo que el punto pide: designación,
norma de producto, familia, procedencia, bandas de espesor con **el código que las tabula**, y
propiedades con la autoridad de cada número. Aluminio, acero e inoxidable quedan diferenciados por
declaración y no por magnitud (`catalogueGradeFamily`), y el aluminio se nombra explícitamente
como no cubierto.

**Nada pendiente.** El único trabajo posible sería ampliar el catálogo con grados nuevos, que es
adquisición de datos y no arquitectura.

### 1.3 Secciones y perfiles — hecho, salvo una familia que no existe

Hecho: `ProfileSource` sobre las tablas de Basic sin duplicarlas, filtros por familia, organismo,
código de diseño y rango de altura, ficha con la base de cada propiedad, comparación de hasta tres,
y **selección persistente por ID de catálogo** — el ID es el nombre del catálogo, que es lo que
`ProfileSpec.profileName` ya guardaba y lo que `resolveProfile` resuelve.

**«Perfiles delgados» tiene dos lecturas y conviene separarlas:**

1. **Formas delgadas paramétricas: existen.** `section-shapes.ts` define `THIN_SHAPES` —
   `hollow-rect`, `hollow-circular`, `I-custom`, `T-custom`, `U-custom`— y `ProSectionsTab`
   (superficie PRO) las ofrece y las aplica al modelo.
2. **Catálogo de perfiles conformados en frío: no existe, y está declarado como ausente.**
   `section-catalog.ts:121` lista `missingFamilies: ['L de alas desiguales', 'C/Z conformados en
   frío (CIRSOC 303)']`. Los únicos conformados en frío del catálogo son los tubos IRAM
   (CHS/RHS/SHS). Agregar la serie C/Z es **adquisición y validación de tablas**: dimensiones,
   radios, y la comprobación de que el contorno reproduce las propiedades publicadas, que es el
   estándar que este catálogo ya cumple para las demás familias. **M2**, y su costo es de datos,
   no de código.

### 1.4 Secciones construidas — se dibujan bien, con dos huecos

- **Composición:** `built-up-section.ts` compone siete disposiciones por ejes paralelos y
  `Section.composition` lo declara.
- **Se visualiza correctamente en «Modelo con secciones»:** confirmado en el código, no supuesto.
  `create-element-mesh.ts:98` llama a `createSectionShapes(opts.section)` cuando
  `renderMode3D === 'sections'`, y `section-profiles.ts:248` arma el contorno **desde la misma
  tabla de posiciones de la que salieron las propiedades**. `built-up-extrusion.test.ts` lo fija.
- **Funciona en generadores y en modelos guardados:** `emit.ts` emite `composition`, el store lo
  carga, y `solver-service.ts` y `cad/draft.ts` la leen.

**Hueco 1 — el constructor de Basic está huérfano.** `SectionShapeBuilder.svelte` existe, tiene
claves i18n en diez idiomas y **ningún componente lo importa**. La capacidad no se perdió —
`SectionChanger` (Basic) y `ProSectionsTab` (PRO) usan `THIN_SHAPES`/`SOLID_SHAPES` directamente—
pero hay un componente completo sin montar. Averiguar si se reemplazó a propósito o se quedó
colgado es **acotado: M1**, y la respuesta puede ser «borrarlo».

**Hueco 2 — una sección construida en `ProSectionsTab` no declara procedencia.** Emite `shape`,
`h`, `b`, `tw`, `tf` y las propiedades calculadas, y **no** escribe `composition` ni una marca de
que fue construida paramétricamente. Así que en el visor cae al `default:` de
`createSectionShape` —el mismo camino que PR21 documentó como «dibujaba un perfil I para todo lo
generado»— y en un `.ded` guardado no queda registro de con qué parámetros se armó. **Acotado:
M1**, y es el hueco más valioso de la lista.

### 1.5 Generadores — conectados, con una propiedad sin verificar

El selector general está conectado a los tres generadores, hay una sola fuente, el ID es el mismo
en selector, generador y `.ded`, y `emit.test.ts` lo fija.

**Sin verificar:** «que cambiar una sección en el selector se refleje en el modelo generado». Hay
que decir qué significa, porque hay dos respuestas y sólo una es correcta:

- **antes de Generar:** el cambio se refleja — la previsualización y los conteos se rearman, y el
  E2E lo cubre;
- **después de Generar:** **no se refleja, y no debería.** Un modelo generado es geometría en el
  store; el selector es el formulario que la creó. Que editar el formulario mutara un modelo ya
  emitido sería sorprendente y rompería el undo.

Lo que falta es un test que **fije esa frontera** en vez de dejarla implícita. **Acotado: M1.**

### 1.6 Workflow guiado — no existe

`reglamento → material → sección → geometría → hipótesis → revisión` no está en ninguna parte como
secuencia. Lo que hay son las piezas en tres pantallas distintas: reglamento en su panel, material
y sección y geometría en Generadores, estados en Metálicas, limitaciones en Uniones.

Y acá hay una decisión de producto antes de cualquier código: **`StageSection` —el componente que
el panel de hormigón usa para exactamente esto— es superficie compartida y H1 es su dueña.** Un
workflow metálico guiado que lo reutilice necesita coordinación; uno que no lo reutilice sería una
segunda navegación en paralelo, que el alcance de M1 prohíbe explícitamente desde PR21.

**M2**, y con un paso previo de coordinación con H1 sobre `StageSection`.

---

## 2. La división propuesta

### M1 — cuatro tareas propias, y una que resultó ser de coordinación

| # | Tarea | Por qué es M1 | Toca |
|---|---|---|---|
| ~~A~~ | ~~Procedencia de la sección construida~~ → **movida a coordinación** al verificar el contrato: necesita un campo nuevo en `interface Section`. Ver §3 | falla la condición 4 del §4 | nada; **no se editó** |
| B | Mostrar edición y nota del adaptador metálico elegido en `SteelPanel` | el dato existe en `roles.ts`; es leerlo | `SteelPanel.svelte`, `locales/steel/*` |
| C | Test de la frontera del selector: antes de Generar refleja, después no muta | fija una propiedad que hoy es implícita | test nuevo |
| D | Resolver el huérfano `SectionShapeBuilder.svelte`: montarlo o borrarlo, con evidencia | un componente completo sin montar es deuda que se lee como capacidad | decisión, después una línea |
| E | Contratos de datos documentados: `ProfileSource`, `GradeSource`, `Section.composition`, el ID de catálogo | es lo que hace reutilizable todo lo anterior, y lo que M2 necesita para no re-decidirlo | documentación |

**Ninguna necesita autoridad de cálculo nueva, ni fórmulas, ni datos que no existan.** La quinta
—la A— resultó necesitar un archivo compartido, y por eso salió de M1 en vez de forzarse: el estudio
se corrigió a sí mismo al verificar el contrato de `Section.composition` en vez de asumirlo.

### M2 — seis, y tres bloqueadas por algo que no es código

| # | Tarea | Bloqueada por |
|---|---|---|
| 1 | Workflow guiado `reglamento → … → revisión` | coordinación sobre `StageSection` (H1) |
| 2 | Verificación CIRSOC 301 completa | **autoridad**: hay texto oficial en el repo y no hay adaptador, mapa de cláusulas ni benchmark |
| 3 | Dimensionamiento metálico integral | idem, y depende de (2) |
| 4 | Catálogo de conformados en frío C/Z (CIRSOC 303) | **datos**: tablas, radios y validación del contorno |
| 5 | Módulo plástico y torsión Bredt | ver `m2-candidates.md` — los dos tienen vía de validación identificada |
| 6 | Dimensionamiento de arriostramientos y «mejor» perfil | demanda inexistente (viento longitudinal) y una decisión de producto sin tomar |

Las tres bloqueadas por autoridad o datos **no se pueden acelerar escribiendo código**, y meterlas
en M1 sería inventar una de las dos.

---

## 3. Lo compartido que aparece, y qué se propone

Una sola cosa, y aparece en la tarea A.

**`src/lib/data/section-shapes.ts`** — `SECTION_SHAPES`, `THIN_SHAPES`, `SOLID_SHAPES` y
`computeSectionProperties`. Lo consumen `SectionChanger` (Basic), `SectionShapeBuilder` (huérfano)
y `ProSectionsTab` (PRO). Si la tarea A necesitara **agregar un campo** a lo que
`computeSectionProperties` devuelve —por ejemplo el juego de parámetros con el que se construyó,
para poder reconstruir el contorno— eso es archivo compartido.

- **Contrato que cambiaría:** el valor de retorno de `computeSectionProperties` gana un campo
  opcional. Aditivo; ningún consumidor actual lo lee.
- **Impacto sobre H1:** ninguno semántico. Basic y PRO leen los mismos campos que hoy.
- **Dueño propuesto:** **M1**, porque el consumidor que lo necesita es PRO y el cambio es aditivo
  — pero **sólo con confirmación**, y si H1 tiene trabajo en vuelo ahí, se posterga.
- **Alternativa que parecía evitarlo, y no lo evita.** El primer borrador de este documento decía
  que guardar los parámetros en el propio `Section` dejaba la tarea A sin superficie compartida.
  **Verificado después, y es falso**, por dos razones:

  1. `Section.composition` **no sirve** para una sección paramétrica. Su contrato nombra un
     `profileName` «exacto del catálogo» (`model.svelte.ts:146`), y una construida con parámetros no
     tiene uno. Inventarle un nombre sería exactamente el defecto que ese campo cerró: la
     composición declarada en el nombre.
  2. Un campo NUEVO hay que declararlo en `interface Section`, que está en
     **`model.svelte.ts:100`** — compartido y explícitamente prohibido.

  Y no hay canal alternativo: `ModelProvenance` es a nivel de modelo, no por sección.

### La tarea A queda FRENADA — contrato y dueño

No se editó nada. El contrato que haría falta:

```ts
// src/lib/store/model.svelte.ts — interface Section
/**
 * Los parámetros con los que se construyó una sección paramétrica.
 *
 * Hermano de `composition` y deliberadamente distinto: `composition` nombra partes del CATÁLOGO,
 * esto registra una forma calculada. Declarativo, como el otro: nada en el camino de propiedades
 * lo lee, y `a`/`iy`/`iz`/`j` siguen siendo autoritativos.
 */
built?: {
  /** id de `SECTION_SHAPES`, p. ej. `I-custom`, `hollow-rect`. */
  shapeType: string;
  /** Los parámetros tal como se ingresaron, en metros. */
  params: Record<string, number>;
};
```

- **Archivo y líneas:** `model.svelte.ts:100` (la interfaz) y el par `snapshot()`/`restore()` que la
  persiste.
- **Impacto sobre H1:** aditivo y opcional; ningún consumidor actual lo lee y ningún resultado de
  hormigón se mueve. El riesgo es de merge, en el archivo con más manos encima del repositorio.
- **Qué habilita:** que el visor dibuje el contorno real de una sección construida en PRO en vez de
  caer al `default:` de `createSectionShape` —que inventa un perfil I a partir del canto, el mismo
  camino que PR21 documentó y cerró para las generadas— y que un `.ded` recuerde con qué parámetros
  se armó.
- **Dueño propuesto: integración común.** El consumidor es PRO metálico, pero `snapshot()`/
  `restore()` es el contrato que sostiene las cuatro rutas de persistencia. No se hace en paralelo.
- **Alternativa segura mientras tanto:** ninguna honesta. El hueco queda documentado y **no** se
  rellena con el nombre ni con un `composition` falso.

Con esto la tarea A sale de M1 y M1 queda con cuatro tareas propias. Es el resultado correcto del
criterio del §4: la A falla la condición 4.

**Lo que NO se toca, confirmado:** `tokens.css`, `OutcomeBadge`, `DesignToolbar`, `ProRibbon`,
`StageSection`, `model.svelte.ts`, el selector general de Basic (`SectionChanger`), los catálogos
compartidos (`steel-profiles.ts`, `structural-grades.ts`, `section-catalog.ts`), los diccionarios
principales y los stores globales.

Nota sobre `model.svelte.ts`: la tarea A escribe en un `Section`, y `Section.composition` **ya
existe** en la interfaz (PR21 la agregó). Así que escribir un `composition` no requiere tocar el
archivo — es usar un campo que está.

---

## 4. Orden y criterio de cierre

Propuesto y ejecutado: **E → C → B**, con **A frenada** y su contrato escrito, y **D** pendiente de
una decisión de producto — el huérfano `SectionShapeBuilder.svelte` sigue sin montar y la capacidad
está disponible por `ProSectionsTab`, así que no hay urgencia funcional en borrarlo ni en montarlo.

**M1 se cierra** con la arquitectura y el selector conectados, que es el estado de hoy más estas
cinco. **No se intenta meter el workflow ni la verificación**: son M2 y una de las dos está
bloqueada por autoridad.

**Criterio para que algo entre a M1 y no a M2**, aplicado arriba y dejado escrito:

1. no necesita una autoridad de cálculo que no exista;
2. no necesita datos que no estén en el repositorio;
3. no necesita una decisión de producto sin tomar;
4. no toca superficie compartida, o su alternativa que no la toca es igual de buena;
5. es reversible en un commit.

Las cinco de M1 cumplen las cinco condiciones. Las seis de M2 fallan al menos una.
