# `Ixy` — handoff de integración

**Estado:** nada implementado, y **no debe implementarse desde M1**. El Z queda como geometría y
catálogo, sin pretensión de análisis completo fuera del plano restringido.

**Lo primero, porque cambia el tamaño del problema:** esto **no es una necesidad del perfil Z**. Es
un hueco **preexistente** que el Z hizo visible, y que hoy afecta a **37 perfiles del catálogo que
un usuario puede elegir**.

---

## 1. El hallazgo que reordena todo: los ángulos ya tienen el mismo problema

Un perfil **L** —un ángulo— no es simétrico respecto de sus ejes geométricos: sus ejes principales
están rotados 45° y su producto de inercia **no es cero**. El catálogo trae **37 ángulos** (27 en
`iram-angles.ts` + 10 europeos en `steel-profiles.ts`), más la familia `invL` de ángulos desiguales.
Todos guardan `iy`/`iz` respecto de los ejes **geométricos** y ninguno guarda `Ixy`, porque el campo
no existe.

Cuánto importa, calculado y **validado contra los valores publicados del propio catálogo**
(descomposición en dos rectángulos, esquinas vivas):

| Perfil | A calc. vs publicada | Iy calc. vs publicada | `Imin / Iz` |
|---|---|---|---|
| `L 63.5x63.5x4.8` | 5,87 vs 6,00 cm² (−2,2 %) | 22,91 vs 22,58 cm⁴ (+1,5 %) | **0,404** |
| `L 50.8x50.8x7.9` | 7,40 vs 7,49 cm² (−1,2 %) | 17,26 vs 17,05 cm⁴ (+1,3 %) | **0,420** |
| `L 15.9x15.9x3.2` | 0,92 vs 0,94 cm² (−2,6 %) | 0,202 vs 0,193 cm⁴ (+4,8 %) | **0,435** |

La descomposición reproduce lo publicado dentro del 1–3 % en área y 1,5–5 % en inercia, así que la
última columna es confiable: **la inercia mínima real de un ángulo de alas iguales es ~40 % de la que
la app guarda como eje débil.** El valor almacenado es **~2,4× demasiado alto**.

Es exactamente el motivo por el cual un ángulo comprimido se verifica respecto de su eje principal
`v-v` y no del eje paralelo al ala. Y es del lado **inseguro**: un pandeo o una flexión débil
calculados con el `iz` guardado quedan **por encima** de la capacidad real.

**Alcance honesto de esta afirmación:** lo verificado es que (a) los 37 ángulos son seleccionables,
(b) se guardan sus inercias geométricas, (c) no existe `Ixy` en ninguna parte de `src/lib`, (d) la
tensión biaxial usa la forma **desacoplada** `σ = N/A + Mz·y/Iz + My·z/Iy`, válida sólo respecto de
ejes principales, y (e) **no hay ninguna advertencia** en el código sobre ejes principales de
secciones asimétricas (grep de `principal|unsymmetric` sólo devuelve el módulo de tensiones de
láminas, que es otra cosa). Lo que **no** medí es el error resultante en un modelo concreto
end-to-end: eso depende de qué combinación de esfuerzos tenga cada barra.

---

## 2. Dónde faltaría el campo

Cuatro lugares, en orden de dependencia:

| Capa | Archivo | Qué falta |
|---|---|---|
| **Modelo** | `lib/store/model.svelte.ts`, `interface Section` | `ixy?: number` (m⁴). Opcional y aditivo, como `built`. `snapshot`/`restore` lo llevarían sin cambios. |
| **Persistencia de share** | `lib/utils/url-sharing.ts` | Una clave más en el objeto opcional. Ver `share-codec-fields.md`: hoy ya pierde cuatro campos. |
| **Resolución canónica** | `lib/section/canonical.ts` | Decidir si `Ixy` se deriva del contorno cuando hay geometría, o si sólo se acepta declarado. |
| **Catálogo** | `lib/data/steel-profiles.ts` | `ixy?` por fila para los 37 ángulos — y **eso es un dato tabulado que hay que conseguir**, no derivar (ver §4). |

**El campo en el modelo es la parte fácil y no es donde está el problema.** Agregarlo sin que nada lo
consuma no arregla nada; agregarlo y consumirlo mal es peor que no tenerlo.

---

## 3. Qué consumidores lo necesitarían

| Consumidor | Archivo | Por qué |
|---|---|---|
| **Rigidez de barra** | `engine/solver-js.ts`, `engine/solver-3d.ts` | Con `Ixy ≠ 0` la flexión en los dos planos **se acopla**: la matriz de rigidez de la barra deja de ser separable en `Iy` y `Iz`. |
| **Tensiones** | `engine/section-stress.ts`, `engine/section-stress-3d.ts` | La Navier biaxial desacoplada **no vale**. La forma correcta lleva `Ixy` en numerador y denominador. |
| **Pandeo** | `engine/buckling.ts` | La carga crítica va con la inercia **mínima principal**, que es la que no está. Es el consumidor donde el error es inseguro y grande (factor ~2,4 en un ángulo). |
| **Modal** | `engine/modal.ts` | Misma rigidez acoplada. |
| **Diagramas** | `engine/diagrams.ts`, `diagrams-3d.ts` | Las deformadas por interpolación de Hermite usan la misma rigidez. |
| **Flujo de corte** | `engine/section-stress.ts` (`computeShearFlowPaths`) | Ni el `'Z'` ni el acople tienen caso. Un Z hoy cae al `default:`. |

**Todos menos el último están del lado del solver, que está fuera de alcance en esta rama por
restricción explícita.** Ése es el hecho central de este handoff: el campo es del modelo, pero el
trabajo es del análisis.

---

## 4. Qué hipótesis hacen falta

Tres decisiones, y ninguna es de código:

1. **¿La app analiza secciones asimétricas, o las declara fuera de alcance?** Son caminos
   distintos: el primero es rigidez acoplada en todos los consumidores del §3; el segundo es una
   advertencia y un estado, mucho más barato y hoy **más honesto que el silencio actual**.
2. **Para un Z con chapa: ¿cuándo vale la restricción fuera del plano?** Una correa restringida por
   la chapa **sí** flexa aproximadamente respecto de un eje geométrico, y por eso la práctica lo
   hace. Pero **la provisión que define cuándo vale esa hipótesis está en CIRSOC 303**, que no está
   incorporada. Sin ella, la app no puede afirmar que la restricción aplica ni negarlo.
3. **Para un ángulo: ¿qué eje se verifica?** Es normativo, no geométrico: qué eje gobierna un ángulo
   comprimido, con qué longitud efectiva, y qué pasa con un ángulo unido por una sola ala. Eso lo
   firma una persona con competencia normativa.

---

## 5. Por qué **no** debe derivarse en silencio

Es la parte que hay que respetar aunque tiente, porque `Ixy` es **fácil** de calcular a partir del
contorno —lo hace `profiles/cold-formed.ts` en veinte líneas— y esa facilidad es la trampa.

1. **Derivarlo requiere un contorno que la mitad del catálogo no tiene con fidelidad suficiente.**
   Los ángulos IRAM traen dos radios de acuerdo; otros perfiles son `propertiesOnly` y **no tienen
   contorno**. Un `Ixy` derivado sería exacto para algunas filas y estimado para otras, sin que el
   consumidor pueda distinguirlas — exactamente lo que la disciplina de procedencia de este
   catálogo existe para impedir (`r` «*must never be guessed or back-solved from A or I*»).
2. **Cambiaría resultados de modelos guardados sin que nadie lo pida.** Si el solver empieza a leer
   un `Ixy` derivado, cada modelo con un ángulo pasa a dar otro número al reabrirlo. Un cambio de
   resultados tiene que ser una decisión visible y fechada, no un efecto de haber agregado un campo.
3. **Un `Ixy` presente implica que el análisis lo usa.** Guardarlo sin acoplar la rigidez es la peor
   de las tres opciones: el dato está, parece tenido en cuenta, y no lo está. Es la misma clase de
   defecto que un `VERIFICADO` sobre un cálculo no verificado.
4. **La discrepancia es enorme, no marginal.** Con un factor de 2,4 en el eje débil de un ángulo, un
   valor derivado a medias no es una mejora incremental: cambia si una barra pasa o no.

**Regla que propongo:** `Ixy` entra **junto con** el consumidor que lo usa, con su procedencia por
fila, o no entra. Y hasta que entre, lo que corresponde es **decirlo** —una advertencia sobre
secciones asimétricas— no seguir callado.

---

## 6. Qué es M3 y qué es integración común

| Trabajo | Dueño | Por qué |
|---|---|---|
| **Advertir que una sección asimétrica se está analizando respecto de ejes no principales** | **integración común**, chico y hoy | No toca el solver: es un estado y un texto. Cubre los 37 ángulos **y** el Z de un solo golpe, y es lo único de esta lista que mejora la honestidad sin cambiar un número. **Lo recomendado como primer paso.** |
| El campo `ixy?` en `interface Section` | **integración común** | Es el archivo con más manos encima; y no debe entrar sin consumidor (§5). |
| `Ixy` tabulado para los 37 ángulos | **integración común** (datos) | Dato de tabla, con procedencia por fila. No derivarlo. |
| Rigidez de barra acoplada | **M3 o posterior** | Toca `solver-js.ts` y `solver-3d.ts`. Fuera de alcance de esta rama por restricción explícita, y con razón: cambia todos los resultados. |
| Navier biaxial acoplada y flujo de corte | **M3** | Depende de la anterior. |
| Pandeo respecto del eje principal mínimo | **M3 + AUTORIDAD** | Necesita además la decisión normativa del §4.3. |
| Verificación de un Z conformado en frío | **fuera de M3** | Necesita CIRSOC 303, que no está incorporada. |

---

## 7. Qué dejó M1, para que nada de esto haya que redescubrirlo

- `profiles/cold-formed.ts` **calcula y expone** `ixyMm4`, el par principal y `principalAngleDeg`
  para C y Z. No para esquivar el límite: para que sea **medible**. Los ejes principales están
  verificados rotando el tensor, no re-derivando la fórmula, y se aseveran los dos invariantes
  (traza y determinante).
- El panel **muestra el ángulo** de un Z con el texto de por qué importa, y **no** lo muestra en un
  C, cuyos ejes geométricos sí son principales.
- `steel.coldFormed.zedAxesNotPrincipal` dice, en es/en/pt, que la app no puede guardar el producto
  de inercia y que la hipótesis que lo salvaría está en la 303.
- **Nada se agregó al modelo ni al solver.** El campo no existe y sigue sin existir.

**Lo único que M1 recomienda hacer pronto es la primera fila del §6**: hoy un usuario elige un
ángulo del catálogo y la app lo analiza respecto de ejes que no son los principales **sin decirlo**.
Eso es preexistente, es de las dos ramas, y es más barato de arreglar que de explicar.
