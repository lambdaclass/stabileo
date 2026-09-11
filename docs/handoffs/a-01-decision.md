# A-01 — el botón único de alta de secciones: qué cambió para el usuario, y qué falta decidir

**Estado: decisión pendiente. No se implementó nada.** Cambia comportamiento visible, así que el
criterio es del dueño del producto y no una corrección técnica que se pueda hacer y reportar.

**Origen:** `m1-m2-qa-manual-inventory.md` § A-01, prioridad **3** de su tabla final.
**Rama:** M2 (#164), commit `4a458b39`. **Propuesta escrita:**
`m1-m2-open-findings-proposals.md` § 1.

---

## 1 · Qué ve el usuario

**Hoy, en M2.** PRO → cinta **Modelo** → *Propiedades* → pestaña **Secciones**. Hay **un** control
que da de alta una sección: el botón *Agregar sección*, que abre un diálogo centrado y modal. El
diálogo tiene dos divisiones: **Elegir sección estándar** (el catálogo de las quince familias, con
filtros de organismo, código de diseño y altura, comparación y ficha de procedencia) y
**construcción** (las plantillas paramétricas). Debajo del botón queda la tabla de secciones del
modelo, que es de **lectura y borrado**.

**Antes, en `main`.** La misma pestaña mostraba, sin abrir nada:

- una tira de quince botones de familia, un buscador y una **tabla de perfiles cuyas filas
  agregaban la sección al hacer clic**;
- un **formulario de construcción paramétrica inline**, con sus propias pestañas de categoría y su
  grilla de parámetros;
- y, al lado de todo eso, el botón que abre el diálogo.

O sea: eran **tres** vías de alta y ahora es **una**. El panel pasó de 724 a 205 líneas.

## 2 · Qué comportamiento afecta

Afecta **por dónde se entra**, y una de las tres vías no era equivalente:

| Vía retirada | ¿Era equivalente a lo que quedó? |
|---|---|
| **Tabla de perfiles inline** | **No.** Llamaba a `modelStore.addSection` directo: la sección entraba sin disposición, sin huelgo y sin rotación, y no construía `ProfileSpec` — así que un doble ángulo elegido acá y uno elegido en un generador **no eran el mismo objeto**. La fila era `<tr onclick>`: sin tab stop, sin Enter, sin rol. Y no ofrecía organismo, código ni filtro de altura, con lo cual el catálogo **parecía más chico de lo que es**. |
| **Formulario de construcción inline** | **Sí.** Leía las mismas listas (`SECTION_SHAPES`, `THIN_SHAPES`, `SOLID_SHAPES`), calculaba con la misma `computeSectionProperties` y escribía el mismo registro `built`. El que sobrevive, `BuiltSectionPanel`, además acepta `initial` — o sea **una sección construida se puede volver a abrir y editar**, cosa que el inline no hacía — y es el único de los dos que tenía tests. |

Entonces, en términos de comportamiento:

- **se corrigió** el camino que producía una sección no componible y no operable por teclado;
- **se conservó** la capacidad de construir una sección paramétrica, con una capacidad **de más**
  (poder editarla después);
- **se movió** esa capacidad de «siempre visible en el panel» a «segunda división del diálogo»:
  **un clic más**.

La divergencia con la propuesta escrita es exactamente ese tercer punto. La propuesta mínima decía
«que la pestaña muestre sólo el botón, con la tabla removida; **no se toca** el modal, ni
`ProfilePicker`, ni el builder». Se tocó el builder, porque la instrucción de ejecución fue que el
modal quedara como única fuente de **creación** y dejar el formulario inline habría dejado una
segunda fuente de alta.

`ColdFormedPanel` **no** se tocó: el catálogo paramétrico C/Z no es una de las quince familias y no
tiene equivalente en el diálogo, así que sigue siendo un tercer camino de alta a propósito.

## 3 · ¿Implica pérdida o confusión de datos?

**Pérdida de datos: no.** Ningún formato cambió, ningún proyecto guardado se lee distinto, ninguna
sección existente pierde un campo. El prerrequisito que la decisión destapó —que una sección
construida **por el diálogo** descartaba `tw`, `tf`, `t` y `tl`, y quedaba `properties-only` sin
dibujo— **se arregló antes de borrar nada** (`806e1289`). Borrar el camino que funcionaba antes de
arreglar el que quedaba habría cambiado un duplicado por una rotura; no fue lo que pasó.

**Confusión: se redujo, y queda un resto.** Lo que se fue era la confusión seria: dos «IPE 200»
distintas según por dónde entraran, una componible y una no, sin que nada en pantalla lo dijera. Lo
que queda es **hábito**: quien conocía la tabla inline no la va a encontrar, y **no hay ningún
cartel que diga dónde fue**. Es una molestia de descubribilidad, no una ambigüedad sobre el dato.

## 4 · ¿Es visible en QA?

**Sí, y es de las primeras cosas que se ven.** A-01 está marcado **QA obligatorio** y su chequeo es
literalmente «contar cuántos controles del panel dan de alta una sección; esperado: exactamente
uno». Un pase manual sobre la pestaña Secciones lo detecta en el primer paso, sin modelo cargado.

## 5 · ¿Bloquea el merge?

**Por lo técnico, no.** No rompe nada, no perdió capacidad, el prerrequisito está arreglado, y las
compuertas pasan. Tres regresiones de contrato afirman la **ausencia de la maquinaria** —que la
pestaña no importe el catálogo, que escriba al modelo exactamente una vez y a través del tipo de
elección, y que su vía de entrada sea un botón y no una fila— y un E2E afirma que el disparador es
alcanzable sin gesto previo.

**Por lo de producto, es lo único que conviene resolver antes.** No porque esté mal, sino por el
**costo de revertir**: la pestaña se reescribió de 724 a 205 líneas, tres tests ahora afirman que la
maquinaria no está, y el `<details>` que la envolvía se retiró. Revertir hoy es deshacer un commit;
revertir después del merge es reconstruir una superficie y aflojar tres guardas. Por eso el
inventario la pone en prioridad 3 y la llama «la divergencia de mayor alcance de M2».

## 6 · La corrección mínima

**Sólo si el criterio era conservar el builder.** No traer nada de vuelta: **montar el que ya
existe en un segundo lugar.** `BuiltSectionPanel` es un componente con `onApply`; ponerlo también en
la pestaña Secciones, debajo del botón, deja **un** componente con **dos** puntos de montaje, sigue
escribiendo por `toSectionFields` y conserva la edición de una sección ya construida.

Qué **no** hace la corrección mínima: no devuelve la tabla de perfiles. Ésa era el defecto real —la
sección no componible, la fila sin teclado, el catálogo aparentemente más chico— y ninguna de esas
tres cosas mejora por tenerla a mano.

Costo: un componente renderizado en un segundo lugar, y las tres regresiones de ausencia pasan de
«ninguna maquinaria de alta» a «ningún segundo **catálogo**». La regla de QA pasa de «exactamente un
control de alta» a «exactamente un control de alta **de catálogo**».

## 7 · Las alternativas, con lo que cuesta cada una

| # | Alternativa | A favor | En contra |
|---|---|---|---|
| **1** | **Dejarlo como está.** Una sola vía de alta. | Es lo que la instrucción de ejecución pedía; una superficie que probar; el catálogo profundo y la ficha de procedencia son lo que el usuario encuentra al primer clic. | Un clic más para construir; el corte de hábito no tiene cartel. |
| **2** | **Corrección mínima (§6).** Builder inline otra vez, catálogo sólo en el diálogo. | Honra la propuesta escrita al pie de la letra; cero clics para construir. | Dos superficies de alta en la pestaña otra vez —aunque **no** dos catálogos—; hay que aflojar tres guardas y reescribir la regla de QA. |
| **3** | **Dejarlo como está + un cartel.** Sin cambio funcional: que se pueda llegar a la división de construcción desde la pestaña —un segundo botón *Construir una sección* que abre el diálogo ya en esa división. | Contesta el corte de hábito sin agregar una segunda vía de alta: dos botones, **un** diálogo, **un** camino de creación. Es el cambio más chico que responde al problema real. | Dos botones donde había uno; hay que decidir el texto y su i18n en tres idiomas. |
| **4** | **Revertir la decisión 1 completa**, con tabla inline incluida. | Vuelve exactamente a lo que había antes de M2. | Restituye la sección no componible y la fila sin teclado, y vuelve a mostrar un catálogo sin filtros. Es el defecto que la decisión existía para cerrar. **No recomendada.** |

## 8 · Recomendación, y qué necesito de vos

**Mi recomendación es la 3** si lo que preocupa es que la construcción paramétrica quedó menos a
mano, y la **1** si no preocupa. La **2** sólo si el «no se toca el builder» de la propuesta escrita
era un requisito duro y no una nota de alcance. La **4** no la recomiendo por ningún criterio.

**La decisión que necesito**: ¿el builder inline se conserva, se señaliza, o se deja donde está?
Hasta que eso esté contestado, A-01 queda como está y este documento es su registro — no como
sorpresa después del merge, sino como decisión a la vista, que es para lo que se escribió
`m1-m2-open-findings-proposals.md`.
