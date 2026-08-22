# Propuesta — la convención del labio, y los `2t²` que la app se contradice

**Estado:** propuesta. **`section-shapes.ts` no se tocó.** La decisión no es de M1 y tiene que
aplicarse a las dos formas a la vez.

---

## 1. El hecho

La app mide el labio de un perfil con labio de **dos maneras distintas**, según quién pregunte:

| Implementación | Archivo | Convención | Qué hace |
|---|---|---|---|
| `computeSectionProperties`, caso `C-custom` | `lib/data/section-shapes.ts:332` | **línea media** — `yLipCenter = (h − tf)/2 − c/2` | calcula A, Iy, Iz, J |
| `createCShape` | `lib/three/section-profiles.ts:130` | **cara exterior** — el labio arranca en `−halfH` | dibuja el contorno 3D |
| `crossSectionPath`, caso `'C'` | `lib/utils/section-drawing.ts:147` | **cara exterior** — `−hh + lip` | dibuja el contorno 2D |

Con el mismo `c`, el **cálculo** cuenta `2t²` más material que el **dibujo**. En un
`C 100x50x15x2.0`: 452 mm² contra 444 mm², **8 mm² ≈ 1,8 %**.

Está fijado por test en `three/__tests__/cold-formed-shapes.test.ts`, **sobre el canal además del
zeta**, precisamente para que no se arregle en un lado solo.

**Cómo apareció:** escribiendo el contorno del Z hubo que decidir dónde arranca un labio, y ahí se
vio que la pregunta ya tenía dos respuestas. El Z sigue cada convención donde la sigue el canal, así
que hoy la discrepancia es **uniforme entre las dos formas** — que es lo que hace que esto sea
**una** decisión y no dos.

---

## 2. Las dos alternativas

### Alternativa A — línea media (`c` medido desde la mitad del espesor del ala)

El labio es un rectángulo de largo `c` cuyo centro está a `c/2` del centro del ala.

- **Cambia:** los dos dibujos (3D y 2D).
- **No cambia:** ninguna propiedad. Todo `.ded` guardado sigue dando los mismos A, Iy, Iz, J.
- **A favor:** cero impacto numérico. Ningún modelo existente cambia de área ni de inercia, así que
  ningún resultado de análisis se mueve.
- **En contra:** es la convención **minoritaria en el código** (1 contra 2) y la que **no**
  corresponde a cómo se lee una designación.

### Alternativa B — cara exterior (`c` medido desde la cara externa del ala)

El labio abarca desde la cara exterior del ala hacia adentro, largo total `c`.

- **Cambia:** `computeSectionProperties`, caso `C-custom`. Las propiedades de un C paramétrico bajan
  `2t²` de área y algo de inercia.
- **No cambia:** ningún dibujo.
- **A favor:** es la **mayoritaria en el código** (2 contra 1), y **coincide con la semántica de la
  designación**: en `C 100x50x15x2`, el `15` es la profundidad total del labio medida por fuera —
  así se leen las tablas de conformados. Bajo A, un usuario que tipea 15 obtiene un labio de
  `15 + t/2` de profundidad real.
- **En contra:** **cambia números en modelos guardados.** Una sección `C-custom` creada antes pasa a
  tener un área ~1,8 % menor si se recalcula. Las secciones **ya guardadas** no se recalculan
  —`snapshot`/`restore` guarda A e I, no los reconstruye— así que el efecto es sobre secciones
  **nuevas** y sobre cualquier flujo que rederive de `built.params`.

---

## 3. Cuál recomienda el código existente

**La B, cara exterior, 2 a 1.** Y hay dos razones más allá del recuento:

1. **La designación.** Es el argumento fuerte, y es de dominio, no de estilo: una designación de
   conformado en frío nombra el labio como dimensión **exterior**. Con la convención A la app
   construye una sección distinta de la que el usuario nombró.
2. **El conformado en frío es donde el labio importa.** Las tres implementaciones existen desde
   antes, pero el único producto real con labio que la app ahora cataloga es el C/Z conformado. La
   convención que gobierne debería ser la de ese producto.

**Recomendación:** adoptar **B** para cálculo y dibujo, en un solo commit que toque
`section-shapes.ts` y **nada más** (los dibujos ya la cumplen).

**Nota sobre la magnitud:** `2t²` sobre secciones de chapa es chico —1,8 % en el ejemplo, y baja al
crecer la sección— pero el punto no es la magnitud. Es que dos partes de la app afirman cosas
distintas sobre la misma sección, y eso se arregla o se documenta, no se deja.

---

## 4. Qué cambia en C y en Z

| | C | Z |
|---|---|---|
| **Bajo A** | los dos dibujos se corren `t/2`; propiedades intactas | igual: `zedOutline` cambia, `partsZ` no |
| **Bajo B** | `computeSectionProperties` baja `2t²` de área; dibujos intactos | `partsZ` baja `2t²`; `zedOutline` intacto |

**Las dos formas se tocan juntas, sin excepción.** Hoy la discrepancia es uniforme; arreglar sólo el
canal la volvería asimétrica, y un Z y un C de las mismas cuatro medidas dejarían de compartir `iy`
—identidad que hoy está aseverada y que es el chequeo que valida toda la derivación del Z.

En M1 el punto único de cambio es `partsC`/`partsZ` en `profiles/cold-formed.ts`: las dos leen la
convención de `computeSectionProperties`, así que siguen a `section-shapes.ts` por construcción.

---

## 5. Tests que hay que actualizar

Los que realmente cambian, verificado por grep (`C-custom`, `createCShape`, `shape: 'C'`):

| Archivo | Qué asevera hoy | Bajo A | Bajo B |
|---|---|:---:|:---:|
| `profiles/__tests__/cold-formed-geometry.test.ts` | el C reproduce `computeSectionProperties` **exacto**; Z y C comparten `iy` | intacto | **se mueve** (las dos siguen valiendo, con otros números) |
| `three/__tests__/cold-formed-shapes.test.ts` | el `2t²`, aseverado explícitamente en ambas formas | **la asersión del `2t²` pasa a ser 0** | idem |
| `utils/__tests__/zed-2d-outline.test.ts` | el área 2D contra `zedOutline` | **se mueve** | intacto |
| `three/__tests__/section-profiles.test.ts` | conteo de vértices de `createCShape` | intacto (mismo conteo, otras coordenadas) | intacto |
| `store/__tests__/built-section-contract.test.ts` | round-trip de `built` con `tl` | intacto | intacto (guarda parámetros, no derivados) |
| `engine/__tests__/shear-flow-audit.test.ts` | flujo de corte en un `shape: 'C'` | revisar | revisar |

**La asersión del `2t²` es la que cambia de sentido en los dos casos**: hoy dice «difieren en
`2t²`», y después de unificar tiene que decir «no difieren». Ése es el test que hay que dar vuelta a
propósito, y es la señal de que el trabajo se hizo.

---

## 6. Impacto sobre las plantillas de hormigón

**Numéricamente: ninguno.** Verificado sobre `SECTION_SHAPES`: de todas las plantillas,
**`C-custom` es la única que declara `c` o `tl`**. Las de hormigón (`concrete-square`,
`concrete-rect`, y las demás) no tienen labio, así que ninguna cambia bajo ninguna de las dos
alternativas.

**De coordinación: sí.** `section-shapes.ts` es el archivo que **contiene** las plantillas de
hormigón, y `ProSectionsTab.svelte` —que las sirve— arranca en `concrete-rect`. Editar el archivo es
tocar territorio de H1 aunque el cambio no roce una sola línea de hormigón.

**Por eso esto es una propuesta.** El cambio es chico, está acotado a un `case`, y no se hace
unilateralmente desde M1.

---

## 7. Qué hace falta para ejecutarlo

1. Que se elija A o B. **Recomendación: B.**
2. Que se acuerde **quién** edita `section-shapes.ts` — el precedente que funcionó es el bloque de
   tokens: H1 editó los archivos compartidos, M1 verificó el contrato y arregló lo suyo.
3. Que se apliquen **las dos formas a la vez**, con el test del `2t²` dado vuelta en el mismo commit.
4. Que se decida si `built.params` de secciones ya guardadas se rederiva. Bajo B, rederivar cambia
   números; **no** rederivar deja secciones viejas con la convención vieja y su `built` intacto, que
   es lo más honesto y lo que ya pasa hoy.
