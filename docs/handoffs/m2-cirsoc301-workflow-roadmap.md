# M2 reordenado — el workflow CIRSOC 301 es el objetivo central

**Rama:** `feat/pro-steel-m2`, PR #164 draft. **Ninguna rama nueva. Ningún PR nuevo.**

El objetivo de M2 no es catálogos ni visualización: es **un workflow completo de diseño de
estructuras metálicas con CIRSOC 301**. Este documento audita los nueve puntos contra lo que
realmente existe y dice qué falta en cada uno. La visualización de uniones queda como subfase 10.

**M2 no se declara cerrado** mientras el workflow no exista o no esté documentado con precisión qué
queda afuera por falta de autoridad normativa.

---

## El hallazgo que reordena el punto 9

**El verificador CIRSOC 301 ya existe, corre, y está deliberadamente apagado.**

`lib/engine/codes/argentina/cirsoc301.ts` son **769 líneas de AISC 360 LRFD** con seis funciones
exportadas: `checkSteelTension`, `checkSteelCompression` (con Fe/Fcr), `checkSteelFlexure` (con
Lp/Lr y reducción lateral-torsional), `checkSteelShear` (con Cv), `checkSteelInteraction` (H1) y
`verifySteelElement`. Se invoca desde `verification-service.ts:336`.

Y M1 ya lo auditó, declarando **todas** las facetas de **todas** las capacidades metálicas en
`false` (`engine/design/adapters/cirsoc301-capabilities.ts`), con cuatro razones escritas:

| # | Bloqueo | ¿Quién lo destraba? |
|---|---|---|
| 1 | **Cero tests.** Ni benchmark externo, ni fixture a mano, ni test de propiedad. Verificado: no existe ningún archivo de test para ese módulo. | **M2** — es trabajo, no autoridad |
| 2 | **No cita ninguna cláusula** en el sentido de `ClauseRef`, así que `deriveMaturity` no podría promoverlo de `UNSUPPORTED` ni con benchmarks. | **M2** para el mapeo; **AUTORIDAD** para firmar que cada cláusula es la correcta |
| 3 | **`Lb = L`.** `verification-service.ts:332` pasa la longitud entera como longitud no arriostrada. Para una viga eso **suele decidir el resultado**. | **decisión de modelo**: hace falta un dato de arriostramiento |
| 4 | **Inventa valores faltantes**: `tw = b/10`, `tf = b/15` cuando la sección no los trae, y `fu = 1,25·fy` cuando el material no lo trae. | **M2** — o se exige el dato, o se declara `unavailable` |

**Lo que esto cambia:** el punto 9 no es «preparar una verificación futura». Es **«decidir qué hace
falta para encender la que ya está»**, y los cuatro bloqueos están enumerados. Tres son trabajo
acotado de M2. Sólo el 2 necesita firma humana, y sólo para la mitad normativa.

**Nota importante sobre el 3:** el verificador **recibe `Lb` como parámetro propio y honesto** —el
problema está en el llamador, no en el cálculo—. Y conecta directo con el trabajo de arriostramiento
que M1 ya hizo en el generador de naves (`wallBracing`, `roofBracing`, `trussBracing`), que es
exactamente de dónde saldría un `Lb` real.

---

## Auditoría de los nueve puntos

| # | Punto | Estado | Qué falta |
|---|---|---|---|
| **1** | Reglamento seleccionable y visible | **casi** | `codes/roles.ts` declara el rol `steel` con `cirsoc301-2018` (`experimental`, `UNSUPPORTED`, nota `textAvailableNotImplemented`) y `eurocode3`. `SteelPanel` muestra código, **edición** y **madurez**. Falta que la declaración tenga **consecuencias declaradas**: qué capacidad de las diez responde y qué contesta «no implementada» con motivo. |
| **2** | Materiales y grados | **hecho** | `grades/catalogue.ts` con `GradeSource`, filtros por región/familia/código, tablas de banda por espesor, `GradePickerPanel`, y `catalogueGradeFamily` cableado. El aluminio se separa del acero y lo dice. |
| **3** | Perfiles y secciones | **hecho** | `profiles/catalogue.ts` con `ProfileSource`, procedencia **por fila** (`tabulated` / `derivedFromTable` / `derivedFromGeometry` / `unavailable` con motivo), estándares por familia, filtros por canto. |
| **4** | Paramétricas y construidas | **hecho** | Campo `built` (contrato `ae3a6186`), plantillas `SECTION_SHAPES`, y el C/Z conformado en frío paramétrico con designación como especificación. Convención del labio unificada e integrada. |
| **5** | Hipótesis y estados | **parcial** | Los cuatro estados existen y son sólidos (`steel-status.ts`), con razones i18n y `steelCountsAsVerified()` devolviendo el literal `false`. `SteelMemberState.experimental.assumptions` **existe como campo y nadie lo llena**, porque nada produce un resultado experimental todavía. Falta la superficie de hipótesis del diseño: arriostramiento, longitudes efectivas, continuidad. |
| **6** | Flujo guiado | **el hueco** | Hay `ProRcWorkflowTab` (305 líneas) para hormigón y **no hay equivalente metálico**. Ver abajo: se puede construir **sin editar nada compartido**. |
| **7** | Resultados y limitaciones | **parcial** | `steelStore.capabilityGaps` recorre las diez capacidades y explica cada una vía `explainUnsupported`, más los cinco `conn.gap.*` de uniones. Falta el lado de **resultados**, porque no hay resultados. |
| **8** | Integración con generadores | **hecho** | Tres generadores (cabriada, columna reticulada, nave) con selector de perfiles por rol, una sola fuente de catálogo, ID idéntico en selector/generador/`.ded`, y el camino de carga longitudinal de la nave corregido. |
| **9** | Preparación para verificación | **reformulado** | Ver arriba: el verificador existe. El trabajo es destrabarlo, no escribirlo. |

**Resumen:** 2, 3, 4 y 8 están hechos. 1, 5 y 7 están parciales y lo que les falta depende de que
haya un flujo. **6 es el hueco real**, y 9 es más chico de lo que parecía.

---

## El punto 6, y por qué se puede hacer sin tocar archivos compartidos

`StageSection.svelte` es **genérico por construcción**. Su API completa:

```ts
interface Props {
  step: number;          // posición en el pipeline
  title: string;
  purpose: string;       // una oración: para qué es este stage
  state: 'done' | 'current' | 'blocked' | 'optional';
  blockedBy?: string;    // qué falta, cuando no puede correr
  badge?: string | number;
}
```

Nada de hormigón. `ProRcWorkflowTab` lo **consume**, no lo extiende. Así que un
`ProSteelWorkflowTab.svelte` —archivo nuevo, mío— puede consumirlo igual. **Consumir no es editar**,
y es la única manera de tener flujo guiado sin pisar a H1.

### La regla que hay que escribir antes de cablear nada

`state: 'done'` renderiza **un ✓ en `--st-ok`** (verde), verificado en
`StageSection.svelte:74,173,187`.

> **Un stage metálico sólo puede llegar a `'done'` si registra una ELECCIÓN del usuario, nunca si
> insinúa que se verificó algo.**

Declarar el reglamento, elegir el material, elegir la sección: son completitudes reales y `'done'`
es honesto. Cualquier stage que un lector pueda leer como «esto se chequeó» tiene que quedar en
`'blocked'` con su `blockedBy`, o en `'optional'`. Un ✓ verde al lado de un stage metálico es
exactamente la afirmación que M1 y M2 llevan todo este trabajo negándose a hacer.

### Los stages propuestos

| # | Stage | `state` alcanzable hoy | `blockedBy` |
|---|---|---|---|
| 1 | Reglamento | `done` cuando está declarado | — |
| 2 | Material y grado | `done` cuando todo miembro metálico tiene grado | «hay miembros sin grado declarado» |
| 3 | Sección | `done` cuando toda barra tiene sección resoluble | «hay barras sin sección del catálogo» |
| 4 | Geometría y arriostramiento | **`blocked`** | «no hay dato de arriostramiento: `Lb` se toma igual a la longitud entera» |
| 5 | Hipótesis | `current` / `optional` | — |
| 6 | Análisis | `done` cuando hay solve y combinaciones | «falta calcular» |
| 7 | Verificación | **`blocked`, siempre, hoy** | los cuatro bloqueos del §1, nombrados |
| 8 | Resultados y límites | `optional` | — |

**El stage 7 nunca es `done`** mientras `steelCountsAsVerified()` devuelva `false`, y ése es
justamente el punto de que esa función devuelva el literal: un `state: 'done'` ahí no compilaría
como decisión defendible.

---

## Uniones y visualización — dentro de M2, sin rama propia

La investigación ya hecha queda donde está: `m2-metallic-visualisation-study.md`, con la auditoría
de `connection-design.ts` (307 líneas: dos capacidades desde escalares tipeados, más topología; **no
hay geometría de unión en ninguna parte**, y `model.connectors` es un primitivo de rigidez, no una
unión).

Los tres niveles, para no repetirlos: **topología** existe y es sólida; **capacidad** existe con
cinco huecos declarados y la de bulones es explícitamente «un techo»; **geometría** no existe.

Lo que falta para chapas, presillas, bulones y soldaduras está tabulado ahí, elemento por elemento.
**No se inventa geometría ni autoridad**, y el único elemento con geometría real —la sección
espalda-con-espalda— declara una separación `gapMm` sostenida por presillas que no existen.

**Se evalúa después del workflow.** Si entra en M2 o necesita otro PR es una decisión explícita, no
mía.

---

## Radio de nodos — medido, y en espera

`node-picking-bench.test.ts` (commit `81c27283`) mide antes y después. Resultado honesto:

- **El defecto es sólo visual**: el radio fijo de 0,07 m da 8 px con la cabriada entera en pantalla
  y **144 px** al acercarse a 1 m — 18× de crecimiento en el rango de trabajo.
- **No hay robo de clicks**: 0 % a las cinco distancias. Hipótesis refutada.
- **El picking no está roto**: las tasas de 92/67/0 % de mi primera versión eran un artefacto de
  apuntar al centro matemático exacto, que en una vista de elevación cae sobre la **singularidad
  polar** de la esfera teselada. Con clicks realistas: 100 % siempre.
- Un gizmo de 7 px constantes mantiene 100 % de acierto y 0 % de robo en todo el barrido.

**No lo implementé.** La medición dice que el cambio es seguro y que el problema es cosmético; bajo
el orden nuevo, eso va después del workflow. Queda como mejora acotada, lista para cuando se decida.

---

## Lo que M2 puede cerrar, y lo que no

**Puede, sin nadie:**
- el punto **6** completo, consumiendo `StageSection` sin editarlo;
- del punto **9**, los bloqueos 1 y 4: tests para las 769 líneas, y reemplazar los valores
  inventados (`tw = b/10`, `tf = b/15`, `fu = 1,25·fy`) por un `unavailable` con motivo;
- del punto **1**, la declaración de qué capacidad responde y qué no;
- del punto **5**, la superficie de hipótesis, incluido el dato de arriostramiento que el punto 4
  del §1 necesita.

**No puede sin firma humana:**
- el mapeo cláusula → capacidad del bloqueo 2, que es lo que `deriveMaturity` exige para pasar de
  `UNSUPPORTED`;
- por lo tanto, **encender la verificación**. Nada de lo de arriba hace que un miembro metálico
  aparezca como verificado, y `steelCountsAsVerified()` sigue devolviendo `false`.

**Lo que queda afuera de M2 por falta de autoridad normativa, dicho con precisión:** la verificación
metálica en sí. El workflow puede estar completo —reglamento declarado, material y sección elegidos,
geometría e hipótesis registradas, análisis corrido, resultados mostrados con sus límites— y el
último stage seguir diciendo, con motivo, que nadie firmó las 769 líneas que producirían el número.
