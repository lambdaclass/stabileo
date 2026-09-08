# M2 · perfiles conformados en frío C/Z — qué entrega y qué **no**

**Rama:** `feat/pro-steel-m1` · **Commits:** `01da50cb` (geometría), `8f80481e` (unión de formas y
dibujo), `280c4870` (catálogo, selector y estado).

Este es el primer bloque de M2 y es deliberadamente el más chico que sirve: **geometría y catálogo,
sin verificación normativa**. Lo que sigue son los cinco límites reales, cada uno con la evidencia
que lo sostiene y qué haría falta para levantarlo. Ninguno es una omisión por olvido.

---

## Lo que sí entrega

| | |
|---|---|
| **Geometría** | C y Z conformados en frío, definidos por cuatro números (`h × b × c × t`) y **un** espesor. Área, ambas inercias, producto de inercia, valores principales, ángulo principal y torsión de sección abierta — todo **derivado**, nada tabulado. |
| **Z, que no existía** | La app no tenía forma Z: ni plantilla, ni propiedades, ni dibujo. Ahora tiene contorno, se despacha desde `Section.shape` y se dibuja en el visor. |
| **Designación** | `C 100x50x15x2.0` parsea y se formatea de ida y vuelta. El ID **es** la especificación. |
| **Selector** | Fuente con filtros por forma, canto, espesor y texto, sobre una serie **inyectable**. |
| **Persistencia** | El ID sobrevive `snapshot`/`restore` y vuelve a resolver después. |
| **Estado** | `NOT_DESIGNED` con una razón que nombra la exclusión normativa. Nunca verde, nunca verificado. |
| **Tests** | 61 casos nuevos en tres archivos. |

---

## Límite 1 — **no hay verificación, y no es una deuda de implementación**

Es una exclusión normativa explícita, citada del texto que la app embarca. CIRSOC 301-2018,
Capítulo A:

> «Para el proyecto de elementos estructurales resistentes de: (a) chapa de acero doblada o
> conformada en frío de sección abierta y sus uniones se aplicarán las especificaciones del
> Reglamento **CIRSOC 303-2009** Reglamento Argentino de Elementos Estructurales de Acero de
> Sección Abierta Conformados en Frío y sus versiones posteriores»

Y **CIRSOC 303-2009 no está en `docs/codes/`**. De CIRSOC embarcan 101-2025, 102-2025, 201-2025,
301-2018 y las cinco partes de INPRES-CIRSOC 103. La 303 no.

Así que no es que falte escribir el adaptador: **el reglamento que gobierna estas secciones no está
disponible**, y el que sí está las excluye por nombre. Cargar los perfiles y verificarlos con 301
sería aplicar el método equivocado bajo una etiqueta correcta.

**Consecuencia de diseño, y una desviación del pedido.** El pedido decía `DEMAND_UNAVAILABLE`. Ese
estado está documentado como algo más angosto: «*the member is metallic and the forces are not there
— no solve, no combinations. Distinct from the two above because the remedy is the user's and it is
obvious*». Un C/Z tiene geometría y, después de calcular, tiene fuerzas. Resolver de nuevo no cambia
nada. Decirle a ese usuario que calcule sería mandarlo a arreglar lo que no está roto —
exactamente el defecto que esta superficie existe para evitar. Se usa **`NOT_DESIGNED`** con razón
`steel.reason.coldFormedOutOfScope`.

**Para levantarlo:** el texto de CIRSOC 303-2009 (**DATOS**) *y* una firma humana sobre el mapa
cláusula → capacidad (**AUTORIDAD**). El método no es el de un laminado: ancho efectivo, pandeo
distorsional, labios como rigidizadores de borde.

---

## Límite 2 — **la serie ship vacía; no hay tablas**

`NO_SOURCED_SERIES` es `[]` y `list()` devuelve nada. `seriesStatus()` responde
`{ available: false, reason: 'noSourcedSeries' }` para que un picker diga algo cierto en vez de
mostrar un blanco.

**Por qué no hay filas.** Lo que iría ahí es la lista de combinaciones (canto, ala, labio, espesor)
que una acería efectivamente conforma. Es un hecho **comercial**, no normativo: varía por acería y
por mercado, y no está en este repositorio ni en ninguna norma embarcada. Una lista que parece
plausible y no tiene fuente es **peor** que una vacía, porque el usuario no la puede distinguir de
un catálogo real.

**Lo que hace que esto no bloquee nada.** El ID es autodescriptivo, así que `byId()` resuelve
cualquier designación válida **sin consultar tabla**, y resuelve idéntico esté o no en una serie —
está aseverado, porque un proyecto no puede analizar distinto según qué biblioteca esté abierta.
Un proyecto guardado abre sin catálogo detrás.

**Para levantarlo:** un catálogo de acería o la norma dimensional que corresponda (**DATOS**). Es un
commit de datos, no un cambio de diseño: el tipo `readonly ColdFormedSpec[]` ya es toda la interfaz.
Y cuando llegue, sigue siendo **`derivedFromGeometry`** — una serie con fuente no vuelve tabuladas
las propiedades.

---

## Límite 3 — **el producto de inercia de un Z no tiene dónde vivir** (el más serio)

Un C es simétrico respecto de su eje horizontal: sus ejes geométricos **son** los principales. Un Z
es sólo **puntualmente** simétrico: su producto de inercia no es cero, sus ejes principales están
rotados, y **no existe ningún campo `ixy` en toda la app** (verificado por grep sobre `src/lib`).

No es despreciable. Para un `Z 100x50x15x2.0` el producto de inercia supera **la mitad** del momento
débil y el ángulo principal pasa de **10°** — ambos aseverados en el test, no afirmados acá.

**`rotation` no es el lugar.** Ese campo es el giro **físico de montaje** de la sección: lo consumen
los offsets de `scene-sync.ts` y `despiece-3d.ts`. Usarlo para anotar ejes principales sería
secuestrarle el significado.

**Qué significa en la práctica, sin exagerar en ninguna dirección.** Analizar un Z respecto de sus
ejes geométricos es incorrecto **salvo** que el miembro esté impedido de flexar fuera de ese plano —
que es justamente el caso habitual de una correa de techo, restringida por la chapa. Pero **la
provisión que define esa restricción y cuándo vale está en el reglamento de conformados en frío**,
o sea en la 303, que no está. Así que la respuesta honesta no es «está mal» ni «está bien»: es
**«la hipótesis que lo haría válido no la podemos citar»**.

**Para levantarlo:** no alcanza con datos. Requiere que el modelo pueda transportar un producto de
inercia y que el análisis lo use — o sea, **el solver**, que está fuera de alcance en esta rama por
restricción explícita. Es una decisión de **integración común**, no de M2 metálico.

**Y no es un problema del Z.** Es preexistente: un perfil **L** tampoco es simétrico respecto de sus
ejes geométricos, y el catálogo trae **37 ángulos** seleccionables hoy. Calculado y validado contra
los valores publicados del propio catálogo, **la inercia mínima real de un ángulo de alas iguales es
~40 % de la que la app guarda como eje débil** — el valor almacenado es ~2,4× demasiado alto, y del
lado inseguro. Detalle completo, consumidores y reparto de trabajo en
**`m2-ixy-integration-handoff.md`**.

**Mientras tanto**, el módulo reporta `ixyMm4`, el par principal y el ángulo. No para esquivar el
límite: para que sea **medible** y que un consumidor pueda mostrarlo en vez de deducirlo.

---

## Límite 4 — **esquinas vivas**

Un plegado real tiene radio interior. Acá las esquinas son rectas, y la regla del radio pertenece a
la norma de conformado: inventar `r = 2t` sería exactamente la conjetura que `steel-profiles.ts`
prohíbe para los radios de acuerdo («*must never be guessed or back-solved from A or I*»).

**Cuantificado, no agitado.** Una esquina recta cuenta `t²` donde el plegado más agudo posible
cuenta `(π/4)t²`. Para un `C 100x50x15x2.0`: cuatro esquinas de 0,86 mm² sobre 452 mm² = **0,76 %**,
y **siempre en la misma dirección** — este modelo nunca reporta menos material que el que tiene un
plegado real. En toda la grilla probada el peor caso queda **bajo 3 %**, creciendo con `t²/A`.

**Para levantarlo:** la regla de radio de la norma de conformado (**DATOS**).

---

## Límite 5 — **la app ya se contradice consigo misma por `2t²`** (preexistente)

Escribir el Z obligó a decidir dónde arranca un labio, y eso destapó una inconsistencia que ya
estaba, **en el canal**:

- `computeSectionProperties` mide el labio desde la **línea media** del ala: `(h − tf)/2 − c/2`.
- `createCShape` lo dibuja desde la **cara exterior** del ala.

Mismo `c`, y el dibujo tiene `2t²` menos material que el cálculo: **8 mm² de 452** en un
`C 100x50x15x2.0`, ~1,8 %.

No lo introduce este bloque. El Z sigue cada convención donde la sigue el canal, así que la
discrepancia queda **uniforme** y arreglarla después es **una** decisión y no dos. Está aseverada
sobre el **canal** además del Z, porque una inconsistencia que nadie escribió es la que se arregla
en un lado solo.

**Para levantarlo:** decidir cuál convención vale y aplicarla a las dos. Propuesta escrita, con las
dos alternativas, cuál recomienda el código existente (**cara exterior, 2 implementaciones a 1**),
qué tests hay que dar vuelta y por qué el impacto numérico sobre hormigón es **nulo**:
**`m2-lip-convention-proposal.md`**.

---

## Hueco de vocabulario, para el día de la unificación

`ColdFormedEntry` **no** es `ProfileEntry`, y no por gusto: los tres valores de `GeometryFidelity`
—`exact`, `nominalDimensions`, `propertiesOnly`— **presuponen que existe una tabla publicada a la
cual ser fiel**. No hay valor que signifique «el contorno es exacto y las propiedades se derivan de
él», que es lo que es un conformado en frío. Archivarlo como `exact` («*verified against published
data*») sería una afirmación sobre datos que no existen.

El tipo quedó estructuralmente parecido para que unificar sea un renombre y no un rediseño. **Lo que
la unificación necesita** es un cuarto valor de fidelidad —algo como `derivedFromGeometry`— y que
`ProfileFamily` acepte familias sin tabla. Las dos cosas tocan tipos compartidos: **no se hacen
unilateralmente**.

---

## Lo que este bloque NO agregó, según lo pedido

Ni fórmulas de CIRSOC 301, ni resistencia, ni certificación, ni módulo plástico, ni
arriostramientos, ni workflow guiado, ni reglamentos nuevos, ni tablas sin fuente. `WorkflowStages`,
`DesignOverview`, `StageSection`, `ProRibbon`, el selector general y `tokens.css` **no se tocaron**.

Los dos archivos compartidos que sí se movieron, los dos con una sola línea aditiva:
`model.svelte.ts:107` y `steel-profiles.ts` (la unión de formas), porque **sin el literal `'Z'` un
zeta no se puede dibujar ni guardar** — `createSectionShape` despacha sobre ese campo. Reportado a
H1.

---

## Resumen de qué destraba qué

| Límite | DATOS | AUTORIDAD | COMPARTIDO |
|---|:---:|:---:|:---:|
| 1 · Sin verificación (301 excluye, 303 ausente) | **sí** | **sí** | — |
| 2 · Serie sin fuente | **sí** | — | — |
| 3 · El `ixy` del Z no tiene dónde vivir — **y de los 37 ángulos** | — | **sí** (la hipótesis de restricción) | **sí** (modelo y solver) |
| 4 · Esquinas vivas | **sí** | — | — |
| 5 · Discrepancia de `2t²` | — | — | **sí** |
| Hueco de vocabulario de fidelidad | — | — | **sí** |

**Lo único que se puede levantar sin firma ni coordinación son el 2 y el 4: los dos son commits de
datos.**
