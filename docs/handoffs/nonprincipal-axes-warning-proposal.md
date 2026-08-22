# Propuesta — advertir cuando una sección se analiza respecto de ejes no principales

**Estado:** propuesta de **integración común**. Ningún consumidor compartido editado.
**Qué NO propone:** agregar `Ixy`. Eso es otra cosa, es más caro, cambia números, y está en
`m2-ixy-integration-handoff.md`. **Esto es el camino honesto y reversible.**

---

## 1. El problema, en una línea

La app analiza secciones asimétricas respecto de sus ejes **geométricos**, que **no** son sus ejes
principales, y **no lo dice en ninguna parte**.

No es un problema del perfil Z que acaba de entrar. Afecta a **37 perfiles L que un usuario puede
elegir hoy**, y es preexistente a M1 y a H1.

---

## 2. Los perfiles L existentes

**37 ángulos catalogados**: 10 europeos en `steel-profiles.ts` (`family: 'L'`) y 27 IRAM-IAS U
500-558 en `iram-angles.ts`. Todos guardan `iy`/`iz` respecto de ejes paralelos a las alas. Ninguno
guarda producto de inercia, porque el campo no existe.

Cuánto importa, con la descomposición en dos rectángulos **validada primero contra los valores
publicados del propio catálogo**:

| Perfil | A calc. vs publ. | Iy calc. vs publ. | `Imin / Iz` |
|---|---|---|---|
| `L 63.5x63.5x4.8` | 5,87 vs 6,00 cm² (−2,2 %) | 22,91 vs 22,58 cm⁴ (+1,5 %) | **0,404** |
| `L 50.8x50.8x7.9` | 7,40 vs 7,49 cm² (−1,2 %) | 17,26 vs 17,05 cm⁴ (+1,3 %) | **0,420** |
| `L 15.9x15.9x3.2` | 0,92 vs 0,94 cm² (−2,6 %) | 0,202 vs 0,193 cm⁴ (+4,8 %) | **0,435** |

La descomposición acierta el área dentro del 1–3 % y la inercia dentro del 1,5–5 %, así que la
última columna es confiable: **la inercia mínima real de un ángulo de alas iguales es ~40 % de la
que la app guarda como eje débil.** El valor almacenado es ~2,4× demasiado alto, y del lado
**inseguro**.

Por eso un ángulo comprimido se verifica respecto de su eje `v-v` y no del paralelo al ala.

**Dato útil para después:** `engine/section-teaching.ts` **ya** descompone un L en dos rectángulos
y ya calcula su centroide (`centroidWorking`). El día que se agregue `Ixy`, el punto de partida
existe; no hay que implementar una descomposición nueva.

## 3. El perfil Z

Mismo fenómeno, origen distinto: un Z es **puntualmente** simétrico, así que su producto de inercia
no se cancela y sus ejes principales están rotados. Para un `Z 100x50x15x2.0` el producto supera **la
mitad** del momento débil y el ángulo pasa de **10°** — los dos aseverados en
`profiles/__tests__/cold-formed-geometry.test.ts`, no afirmados acá.

**Diferencia con el ángulo, que importa para el texto del aviso:** un Z de correa está normalmente
**restringido** por la chapa, y entonces flexa aproximadamente respecto de un eje geométrico. La
provisión que define cuándo vale esa restricción está en **CIRSOC 303**, que no está incorporada. Un
ángulo no tiene esa salida.

Así que el aviso no puede decir «está mal». Tiene que decir **qué hipótesis haría falta** y que no
se la puede citar.

## 4. Por qué `Ixy` no existe hoy

No es un olvido: es una consecuencia de cómo creció la app.

- El solver 2D es de **3 GDL por nodo** (`ux`, `uy`, `θz`): una sola flexión, y con una sola flexión
  el producto de inercia **no aparece en ninguna ecuación**. `Ixy` sólo tiene sentido cuando hay dos
  planos de flexión a la vez.
- El solver 3D llegó después, con 6 GDL, y reusó la misma descripción de sección: `A`, `Iy`, `Iz`,
  `J`. Ésa es exactamente la descripción correcta para una sección **doblemente simétrica** —que es
  lo que era todo el catálogo original: IPE, IPN, HEB, HEA, UPN, RHS, CHS.
- Los ángulos entraron como **datos** (una tabla más), no como un tipo nuevo de sección. La tabla
  publica `Iy` e `Iz`; nadie tuvo que decidir si eran principales.
- La Navier biaxial se escribió en su forma **desacoplada**, `σ = N/A + Mz·y/Iz + My·z/Iy`
  (`engine/section-stress-3d.ts`), que es válida **sólo** respecto de ejes principales.

Verificado: `grep -rn "ixy\|Ixy\|productOfInertia" src/lib` no devuelve **nada**, y
`grep -rin "principal|unsymmetric"` sólo devuelve el módulo de tensiones de **láminas**, que es otro
tema. `section-teaching.ts` habla del centro de corte de un ángulo y **no** de sus ejes principales.

## 5. Ejes geométricos y ejes principales — qué tiene que entender el lector

Lo mínimo, y el aviso debería poder explicarlo sin un curso:

- Los **ejes geométricos** son los que la app usa para guardar `Iy` e `Iz`: horizontal y vertical,
  alineados con cómo se dibuja el perfil.
- Los **ejes principales** son el único par respecto del cual la flexión en un plano **no arrastra**
  flexión en el otro. Es una propiedad de la sección, no una elección.
- Coinciden cuando la sección tiene **un eje de simetría**. Un I, un U, un T, un tubo: coinciden. Un
  ángulo y un Z: **no**.
- Cuando no coinciden, `Iy` e `Iz` geométricas **no describen la rigidez a flexión de la barra**, y
  la inercia mínima real es **menor** que la menor de las dos guardadas. De ahí que el error sea
  inseguro y no conservador.

## 6. Ningún número del solver se modifica

Es la propiedad que hace esta propuesta reversible, y se puede garantizar por construcción:

- El aviso es una **función pura de `Section.shape`**. No lee resultados, no lee esfuerzos, no lee
  combinaciones, no lee nada que el solver produzca.
- **No agrega ningún campo** al modelo, así que `snapshot`/`restore`, el `.ded`, el undo y el codec
  de share quedan exactamente como están.
- No toca `solver-js.ts`, `solver-3d.ts`, `section-stress*.ts`, `buckling.ts`, `modal.ts` ni
  `diagrams*.ts`.
- Un modelo abierto antes y después de esto da **los mismos números**. Lo único que cambia es que
  dice algo que antes no decía.

**Test que lo fija:** correr un modelo con un ángulo antes y después y comparar desplazamientos,
reacciones y esfuerzos por igualdad exacta. Si algo se mueve, la implementación se pasó de alcance.

## 7. Dónde debe aparecer el aviso

Ordenado por dónde un usuario puede actuar, y marcando quién es dueño de cada superficie:

| Superficie | Archivo | Dueño | Por qué ahí |
|---|---|---|---|
| **Al elegir o crear la sección** | `pro/ProSectionsTab.svelte` | compartido | Es el momento en que la decisión se puede cambiar sin costo. **El lugar más valioso.** |
| **En la ficha de la sección** | `PropertyPanel.svelte` | compartido | Donde alguien va a leer `Iy`/`Iz`. Un número sin la advertencia al lado es el problema. |
| **En la tabla de secciones** | `DataTable.svelte` | compartido | Una marca por fila, no una oración: es una tabla. |
| **En el panel de tensiones** | `stress/CrossSectionDrawing.svelte` | compartido | La Navier desacoplada se aplica ahí. Es donde el número mostrado **es** el afectado. |
| **En el inventario metálico** | `pro/steel/SteelPanel.svelte` | **M1** | Ya lo hace para el Z, vía `ColdFormedPanel`. Sirve de precedente y de plantilla. |

**Lo ya hecho, para no rehacerlo:** `steel.coldFormed.zedAxesNotPrincipal` existe en es/en/pt, dice
que la app no puede guardar el producto de inercia y que la hipótesis que lo salvaría está en la
303, y **muestra el ángulo calculado**. El aviso general puede reusar esa forma; el texto del Z ya
está validado por E2E.

**Recomendación de secuencia:** empezar por `PropertyPanel` y `ProSectionsTab`. Son los dos donde el
usuario ve el número y donde puede cambiar de sección. Los otros tres pueden esperar.

## 8. Cómo no presentarlo como verificación

Es el riesgo real de esta propuesta: un aviso con forma de resultado se lee como un resultado.

**Prohibido:**
- pasar por `OutcomeBadge`, `SteelStatusBadge` o cualquier componente de estado de diseño;
- usar `--st-ok`, o cualquier tratamiento verde;
- mostrar un ratio, un aprovechamiento, una capacidad o un porcentaje de nada;
- las palabras verificado / aprobado / certificado / apto / cumple / no cumple;
- entrar en cualquier censo, conteo o resumen de verificaciones;
- aparecer en un certificado o en un export como si fuera un chequeo.

**Lo que sí es:** una nota sobre **cómo la app representa la sección**. No dice que la barra falle
ni que pase; dice que los números que muestra son respecto de ejes que no son los principales, y
qué haría falta para que eso estuviera justificado.

**Forma sugerida:** el mismo patrón de `inv.notices` que ya usa `SteelPanel` — una lista de claves
i18n, renderizada como texto, sin insignia. Neutra o `--st-warn`, nunca `--st-ok`. Y **contraste
AA verificado**: si va sobre fondo teñido, medirlo compuesto sobre la superficie real, como quedó
fijado en `state-background-contrast.test.ts`.

## 9. Tests de presencia y ausencia según simetría

La tabla es el test. Presencia **y** ausencia, porque un aviso que aparece en todo no informa nada:

| `shape` | ¿Ejes geométricos = principales? | Aviso | Por qué |
|---|:---:|:---:|---|
| `I`, `H` | sí | **no** | doblemente simétricas |
| `RHS`, `rect`, `CHS` | sí | **no** | doblemente simétricas |
| `U`, `C` | sí | **no** | simétricas respecto del eje horizontal |
| `T` | sí | **no** | simétrica respecto del eje vertical |
| `L` | **no** | **sí** | ángulo: principales a 45° si las alas son iguales |
| `invL` | **no** | **sí** | ángulo desigual: rotación distinta de 45° |
| `Z` | **no** | **sí** | sólo simetría puntual |
| `generic` | **no se puede saber** | **no** | sin contorno. Ver abajo. |

Tests que propongo, en tres niveles:

1. **Unitario del predicado** — sobre la tabla completa, exhaustivo por construcción: recorrer
   `SectionShape` entera y exigir una decisión para cada literal, de modo que **agregar una forma
   nueva rompa el test** en vez de caer silenciosamente del lado de «no avisar».
2. **Unitario del catálogo** — que los **37** perfiles `L` disparen el aviso y que ninguno de los
   IPE/IPN/HEB/HEA/UPN/RHS/CHS lo dispare. Cuenta exacta, para que borrar la mitad de la familia
   falle.
3. **E2E de renderizado** — que el aviso se **vea** con un ángulo seleccionado y **no exista** con
   un IPE, más la lista de palabras prohibidas del §8 sobre el texto renderizado. El precedente
   está en `m2-cold-formed-selector.spec.ts`, que ya hace exactamente esto para el Z.

**El punto ciego, declarado:** `generic` son los perfiles `propertiesOnly` — sin contorno, así que
la app **no puede** saber si sus ejes son principales. No avisar es la conducta actual y la
propuesta la mantiene, porque un aviso ahí sería una conjetura y **afirmar simetría que no se puede
verificar sería peor que callar**. Queda anotado como límite, no resuelto.

## 10. Qué pido

1. Que se acepte o rechace el aviso como pieza de **integración común**. Es chico, no cambia un
   número, y cubre los 37 ángulos y el Z de una sola vez.
2. Que se defina **quién** edita `PropertyPanel` y `ProSectionsTab`. El precedente que funcionó es
   el bloque de tokens: el dueño del archivo compartido escribe, M1 verifica y arregla lo suyo.
3. Que se decida si el aviso queda **también** cuando llegue `Ixy`. Mi recomendación: **sí**,
   mientras el análisis no acople la rigidez. Tener el dato y no usarlo es peor que no tenerlo, y el
   aviso es lo que impide que eso pase inadvertido.

**Y lo que no pido:** agregar `Ixy` ahora. El aviso es reversible; el campo no.
