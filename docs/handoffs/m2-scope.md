# M2 — alcance por fases

**Origen:** `feat/pro-steel-m1` · **Estado:** alcance, no implementación. **Nada de acá está hecho.**

Esto es un handoff de alcance, no un plan de trabajo aprobado. Cada fase dice qué falta y —lo que
importa más— **de qué tipo es lo que falta**, porque las tres clases no se desbloquean igual:

| Marca | Qué significa | Quién lo destraba |
|---|---|---|
| **DATOS** | Faltan tablas, perfiles o el texto de una norma. Es trabajo de carga y verificación. | Se consigue la fuente y se tabula, con procedencia por fila. |
| **AUTORIDAD** | La fuente está, pero alguien tiene que **firmar** que la lectura es correcta. | Una persona con competencia normativa. No lo destraba un agente. |
| **COMPARTIDO** | Toca archivos con más de una mano encima. | Se coordina con H1 antes de escribir. |

Una fase puede llevar más de una marca. **Ninguna fase de M2 se abre sin decir cuál de las tres la
está frenando**, porque confundirlas es cómo se termina inventando una tabla para tapar un problema
de autoridad.

---

## Lo que ya está, y conviene saber antes de leer las fases

Tres hallazgos que cambian el tamaño de M2 y que verifiqué en el código, no supuse:

1. **El asiento del reglamento existe y el acero ya es un rol.** `lib/codes/roles.ts` declara
   `role: 'steel'` con dos opciones —`cirsoc301-2018` (`experimental: true`,
   `maturity: 'UNSUPPORTED'`, nota `textAvailableNotImplemented`) y `eurocode3` (`notImplemented`)—
   y `lib/codes/capability.ts` ya enumera las diez capacidades metálicas: `steelTension`,
   `steelCompression`, `steelFlexure`, `steelLateralTorsionalBuckling`, `steelShear`,
   `steelInteraction`, `steelSectionClassification`, `steelConnections`, `steelBracing`,
   `steelMemberSchedules`. **La fase 1 no arranca de cero: arranca de un asiento vacío.**
2. **El texto oficial de CIRSOC 301-2018 viene con la app.**
   `docs/codes/CIRSOC/markdown/cirsoc-301-2018/` trae los capítulos **A a N** y **ocho apéndices**
   (24 archivos, con `metadata.json`). El comentario de `roles.ts` ya lo dice: «*el obstáculo no es
   la fuente, es que ningún adaptador la implementa*». **Las fases 2 y 4 no están frenadas por
   DATOS.** Están frenadas por implementación y por AUTORIDAD.
3. **CIRSOC 303 no viene.** De CIRSOC embarcan 101-2025, 102-2025, 201-2025, 301-2018 y las cinco
   partes de INPRES-CIRSOC 103. **El reglamento de perfiles conformados en frío no está**, y es
   justamente el que gobierna la fase 3. Esa fase sí está frenada por DATOS **y** por AUTORIDAD, y
   es la única en que las dos coinciden.

---

## Fase 1 — Reglamento seleccionable y adaptadores

**Qué falta:** un adaptador metálico detrás de `cirsoc301-2018`. Hoy un proyecto **puede declarar**
que se diseña a CIRSOC 301 y queda registrado —eso ya funciona y persiste— y la app no produce nada
a partir de esa declaración. La fase 1 es hacer que la declaración tenga consecuencias
**declaradas**: qué capacidades de las diez responde el adaptador y qué capacidades contesta
«no implementada» con motivo.

**Marcas: AUTORIDAD.** Ni DATOS (el texto está) ni COMPARTIDO (`roles.ts` y `capability.ts` son
genéricos por construcción; el comentario de `OPTIONS` dice explícitamente que nada ahí nombra un
reglamento). Lo que hace falta es que alguien firme el mapa capacidad → capítulo. Eso no lo puede
firmar un agente.

**Lo que NO es la fase 1:** implementar una fórmula. Un adaptador que declara diez capacidades y
resuelve cero es un resultado válido y honesto de esta fase, y es el que deja pasar a la 2.

**Criterio de cierre:** el panel muestra, por capacidad, si el reglamento elegido la cubre; y
`steelCountsAsVerified()` sigue devolviendo `false` literal.

---

## Fase 2 — Workflow guiado CIRSOC 301

**Qué falta:** la secuencia reglamento → material → sección → geometría → hipótesis → revisión,
recorrida sin que el usuario tenga que saber en qué pestaña está lo próximo.

**Marcas: COMPARTIDO** (fuerte) **+ AUTORIDAD** (para el contenido de cada paso).

El andamiaje del workflow es de H1: `StageSection.svelte` lo consumen hoy
`ProConnectionsTab.svelte`, `ProRcWorkflowTab.svelte` y `design/ProjectRegulationsPanel.svelte`.
`WorkflowStages`, `DesignOverview` y `ProRibbon` están en la misma lista de no-tocar-en-paralelo.
**Esta fase no se abre antes de acordar con H1 quién escribe el andamiaje y quién sólo lo consume**,
y la respuesta por defecto —consistente con el bloque de tokens— es que el dueño del archivo
compartido escribe y M2 consume.

**Riesgo específico a nombrar:** un workflow guiado insinúa que al final hay un resultado. Mientras
la fase 5 no cierre, el último paso tiene que decir qué **no** entrega, y decirlo en el paso, no en
una nota al pie.

---

## Fase 3 — Catálogo C/Z y perfiles conformados en frío

**Qué falta, con precisión:** el catálogo de perfiles **no tiene ninguna serie conformada en frío**.
Cuidado con un falso positivo: existen familias `C` y `MC`, y **son canales laminados en caliente**
de la serie americana (ASTM A6 / NBR 15980), no perfiles C con labio. El grado sí distingue
`cold-formed` como familia —M1 lo dejó cableado en `grades/catalogue.ts`— así que hoy se puede
declarar un **acero** conformado en frío y no hay ningún **perfil** conformado en frío que ponerle.

**Marcas: DATOS + AUTORIDAD.** Las dos, y por motivos distintos:

- **DATOS:** las tablas dimensionales C y Z (IRAM-IAS y lo que normalicen las acerías locales),
  fila por fila, con la misma disciplina de procedencia que ya cumple el resto del catálogo:
  cada número o es **tabulado**, o es **derivado de la tabla**, o es **derivado de la geometría**, o
  es **no disponible con motivo**. Sin fuente, no entra la fila.
- **AUTORIDAD:** el **método** de verificación de un conformado en frío no es el de un laminado.
  Ancho efectivo, pandeo distorsional, labios como rigidizadores de borde: eso vive en CIRSOC 303 /
  AISI S100, y **el texto de 303 no está en el repositorio**. Cargar los perfiles y verificarlos con
  CIRSOC 301 sería aplicar el método equivocado bajo una etiqueta correcta.

**La consecuencia que hay que aceptar de entrada:** las dos mitades son separables y conviene
separarlas. Cargar las tablas C/Z como **geometría con procedencia** es acotado y útil por sí solo
—se dibujan, se calculan propiedades, se listan— siempre que la verificación quede en
`DEMAND_UNAVAILABLE` o `NOT_APPLICABLE` con el motivo escrito. Lo que no se puede es cargarlas y
dejar que caigan en el camino de verificación de 301.

**Nota de M1 que aplica acá:** el contrato `built` (`ae3a6186`) ya arregló que `tl` —el espesor del
labio— se perdía al dar de alta una sección paramétrica. Es el parámetro que define un conformado
en frío. Conviene que la fase 3 lo dé por hecho y no lo redescubra.

---

## Fase 4 — Hipótesis y resultados normativos

**Qué falta:** que las hipótesis de carga y las combinaciones que el reglamento elegido prescribe
sean las que corren, y que cada resultado diga bajo qué combinación salió.

**Marcas: AUTORIDAD.** El texto está —capítulos B (requerimientos de proyecto) y C (estabilidad),
más el apéndice 8 (análisis aproximado de segundo orden)— y las combinaciones argentinas salen de
CIRSOC 101-2025, que también embarca. Falta la firma sobre qué combinación se usa para qué y con
qué factores, y **falta decidir qué hace la app cuando la combinación prescrita no se puede armar**
con las cargas que el modelo tiene.

**El error a no cometer, escrito para que quede:** presentar un resultado bajo el nombre de una
combinación normativa cuando lo que corrió fue otra cosa. Es el mismo defecto que M1 encontró en
madera —cada clase EN 338 entraba al camino del hormigón, y una C24 se diseñaba como hormigón de
24 MPa— y esa fue una etiqueta correcta sobre un cálculo equivocado. Si la combinación no se puede
armar, el resultado es «no disponible, porque falta esta carga», no un número.

---

## Fase 5 — Autoridad y límites de verificación

**Qué falta:** la decisión de si esta app verifica acero, y con qué alcance.

**Marcas: AUTORIDAD, y sólo AUTORIDAD.** Es la única fase que no tiene componente técnico. El
código ya está construido para que el día que la respuesta sea sí, se cambie en **un** lugar:

```ts
export function steelCountsAsVerified(_status: SteelMemberStatus): false {
  // ... There is no metallic authority in this app; when there is one, this function is where
  // that changes, and the change will be visible in every consumer at once.
  return false;
}
```

El tipo de retorno es el literal `false`, así que un consumidor que intente ramificar sobre un caso
«tal vez verificado» **no compila**. Los cuatro estados (`NOT_DESIGNED`, `EXPERIMENTAL`,
`DEMAND_UNAVAILABLE`, `NOT_APPLICABLE`) y la regla de que ningún estado metálico se muestra en
verde son la otra mitad del mismo compromiso.

**Por qué es una fase y no una nota:** porque las fases 1 a 4 se pueden hacer enteras con esta
cerrada, y el producto resultante es legítimo —declara el reglamento, carga los perfiles, arma la
geometría, corre el análisis— y no dice VERIFICADO en ningún lado. **Esta fase no bloquea a las
otras. Las otras no la presuponen.** Si alguna vez una fase de M2 necesita que ésta esté abierta
para tener sentido, esa fase está mal planteada.

---

## Fase 6 — Integración con `StageSection` y la UI PRO

**Qué falta:** que todo lo anterior aparezca en el mismo lugar y con la misma forma que el resto de
PRO, en vez de en una pestaña metálica al costado.

**Marcas: COMPARTIDO.** Enteramente. `StageSection`, `WorkflowStages`, `DesignOverview`, `ProRibbon`
y el selector general están en la lista de no-editar-en-paralelo, y el precedente ya existe y
funcionó: en el bloque de tokens H1 fue el único que editó `tokens.css` y los consumidores
compartidos, M1 verificó el contrato publicado y arregló lo suyo. **Misma división acá.**

**Va última por una razón, no por comodidad:** integrar antes de la fase 5 es la forma más rápida de
que un estado metálico herede el tratamiento visual de un resultado de hormigón y termine en verde.
La regla de superficie que M1 dejó fijada con tests (`steel-surface-colour-rules.test.ts`,
`state-background-contrast.test.ts`) es lo que hay que hacer valer en esta fase, no reescribir.

---

## Resumen

| Fase | DATOS | AUTORIDAD | COMPARTIDO |
|---|:---:|:---:|:---:|
| 1 · Reglamento y adaptadores | — | **sí** | — |
| 2 · Workflow guiado CIRSOC 301 | — | **sí** | **sí (fuerte)** |
| 3 · Catálogo C/Z conformado en frío | **sí** | **sí** | — |
| 4 · Hipótesis y resultados normativos | — | **sí** | — |
| 5 · Autoridad y límites | — | **sí (única marca)** | — |
| 6 · Integración con StageSection y UI PRO | — | — | **sí** |

**Lo que se puede empezar sin esperar a nadie:** la mitad de DATOS de la fase 3 —tablas C/Z como
geometría con procedencia, verificación en `DEMAND_UNAVAILABLE`— y la declaración de capacidades de
la fase 1. Las dos son acotadas, no tocan archivos compartidos y no presuponen la fase 5.

**Lo que no se empieza sin H1:** las fases 2 y 6.

**Lo que no se empieza sin una firma humana:** la fase 5, y el contenido normativo de 1, 2, 3 y 4.

**Lo que no se hace en ningún caso:** implementar una fórmula o una tabla que falta. Si un número no
tiene fuente, la respuesta es «no disponible» con el motivo escrito, no un valor plausible.
