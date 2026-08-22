# Propuesta — la convención del labio, y los `2t²` que la app se contradice

**Estado:** propuesta con **recomendación adoptada: convención de CARA EXTERIOR.**
**`section-shapes.ts` no se tocó** — contiene también las plantillas de hormigón, así que el cambio
no sale de M1 de forma unilateral, y tiene que aplicarse a las dos formas a la vez.

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

## 3. Cuál recomienda el código existente — y la evidencia que lo cierra

**Cara exterior (B).** El recuento de implementaciones es 2 a 1, pero eso es lo más débil que se
puede decir a favor. Hay tres cosas más fuertes.

### 3.1 B reproduce el contorno dibujado **exactamente**

No «aproximadamente»: momentos del polígono que `createCShape` realmente recorre, contra las
propiedades que devolvería cada convención. Calculado con las fórmulas estándar de momentos de
polígono, en cuatro medidas:

| Sección | | A (mm²) | Iy (mm⁴) | Iz (mm⁴) |
|---|---|---|---|---|
| `C 100x50x15x2.0` | contorno dibujado | 444,000 | 718 012,0 | 156 865,0 |
| | conv. A (hoy) | 452,000 | 732 182,7 | 164 698,6 |
| | **conv. B** | **444,000** | **718 012,0** | **156 865,0** |
| `C 150x60x20x2.5` | contorno dibujado | 750,000 | 2 624 843,8 | 378 842,4 |
| | conv. A (hoy) | 762,500 | 2 676 744,8 | 397 830,5 |
| | **conv. B** | **750,000** | **2 624 843,8** | **378 842,4** |
| `C 200x75x20x3.0` | contorno dibujado | 1134,000 | 6 993 042,0 | 834 600,2 |
| | conv. A (hoy) | 1152,000 | 7 135 566,0 | 881 131,5 |
| | **conv. B** | **1134,000** | **6 993 042,0** | **834 600,2** |
| `C 80x40x12x1.5` | contorno dibujado | 267,000 | 277 071,3 | 60 707,4 |
| | conv. A (hoy) | 271,500 | 282 188,9 | 63 542,3 |
| | **conv. B** | **267,000** | **277 071,3** | **60 707,4** |

**B coincide con el dibujo a precisión de máquina en las tres cantidades, en las cuatro medidas.** La
diferencia de A es exactamente `2t²` en área (8 / 12,5 / 18 / 4,5 mm² — comparar con `2t²` = 8 /
12,5 / 18 / 4,5) y su reflejo en las inercias.

Esto convierte el argumento en algo verificable: **B es la convención bajo la cual el cálculo y el
dibujo describen el mismo objeto.** A no lo es, y no hay una tercera opción que también lo sea.

### 3.2 Bajo A hay un régimen donde el dibujo omite el labio **por completo**

Peor que un corrimiento de `t/2`, y esto apareció al escribir el patch. Las dos guardas no coinciden:

- `createCShape` (línea 140): `if (lip <= tf || lipT <= 0)` → dibuja un **canal sin labio**.
- `computeSectionProperties` (línea 335): rechaza sólo si `c + tf > h/2`; con `c ≤ tf` **calcula
  igual**, sumando `2·c·tl` de labio.

Así que para `c ≤ tf` la app **calcula una sección con labio y dibuja una sin labio**. No es un
desfase: es material que existe en los números y no existe en el contorno.

**B lo cierra por construcción**, sin una guarda nueva: el labio útil es `c − tf`, que es ≤ 0
exactamente cuando el dibujo se niega a dibujarlo. Las dos partes pasan a estar de acuerdo sobre
cuándo hay labio, no sólo sobre dónde está.

### 3.3 La designación

En `C 100x50x15x2`, el `15` es la profundidad total del labio medida **por fuera** — así se leen las
tablas de conformados y así se especifica el producto. Bajo A, quien tipea 15 obtiene un labio de
`15 + t/2` de profundidad real: la app construye una sección distinta de la que el usuario nombró.

**Nota sobre la magnitud:** `2t²` en chapa es chico (1,8 % en el ejemplo, menos al crecer la
sección). El punto no es la magnitud: es que dos partes de la app afirman cosas distintas sobre la
misma sección, y una de ellas contradice la designación con la que el usuario la pidió.

## 4. El patch propuesto

Un solo `case`, en `lib/data/section-shapes.ts`. Las fórmulas están verificadas contra los momentos
del polígono dibujado (§3.1): reproducen A, Iy e Iz exactamente.

```diff
     case 'C-custom': {
       const { h, b, tw, tf, c, tl } = params;
       if (!h || !b || !tw || !tf || !c || !tl || h <= 0 || b <= 0 || tw <= 0 || tf <= 0 || c <= 0 || tl <= 0) return null;
-      if (2 * tf >= h || tw >= b || c + tf > h / 2) return null;
+      // Outer-face convention: `c` is the lip depth measured from the flange's OUTER face, which
+      // is how a cold-formed designation reads it and what both drawing implementations already
+      // do. The lip that adds material is therefore only the part BEYOND the flange.
+      if (2 * tf >= h || tw >= b || c > h / 2) return null;
       const hw = h - 2 * tf;
-      const a = tw * hw + 2 * b * tf + 2 * c * tl;
+      const cl = Math.max(0, c - tf);   // lip beyond the flange; 0 means a plain channel
+      const a = tw * hw + 2 * b * tf + 2 * cl * tl;
       // Iy (about Y horizontal): h-dominated, symmetric
       const iyWeb = (tw * hw ** 3) / 12;
       const iyFlanges = 2 * ((b * tf ** 3) / 12 + b * tf * ((h - tf) / 2) ** 2);
-      const yLipCenter = (h - tf) / 2 - c / 2;
-      const iyLips = 2 * ((tl * c ** 3) / 12 + tl * c * yLipCenter ** 2);
+      const yLipCenter = (h - c - tf) / 2;
+      const iyLips = 2 * ((tl * cl ** 3) / 12 + tl * cl * yLipCenter ** 2);
       // Iz (about Z vertical): z-centroid not centered
-      const zBar = (tw * hw * (tw / 2) + 2 * b * tf * (b / 2) + 2 * c * tl * (b - tl / 2)) / a;
+      const zBar = (tw * hw * (tw / 2) + 2 * b * tf * (b / 2) + 2 * cl * tl * (b - tl / 2)) / a;
       const izWeb = (hw * tw ** 3) / 12 + hw * tw * (tw / 2 - zBar) ** 2;
       const izFlanges = 2 * ((tf * b ** 3) / 12 + b * tf * (b / 2 - zBar) ** 2);
-      const izLips = 2 * ((c * tl ** 3) / 12 + c * tl * (b - tl / 2 - zBar) ** 2);
+      const izLips = 2 * ((cl * tl ** 3) / 12 + cl * tl * (b - tl / 2 - zBar) ** 2);
       return {
         a,
         iy: iyWeb + iyFlanges + iyLips,
         iz: izWeb + izFlanges + izLips,
-        j: (1 / 3) * (hw * tw ** 3 + 2 * b * tf ** 3 + 2 * c * tl ** 3),
+        j: (1 / 3) * (hw * tw ** 3 + 2 * b * tf ** 3 + 2 * cl * tl ** 3),
         b, h, tw, tf,
         t: c,
         tl,
         shape: 'C',
       };
     }
```

Y el espejo en `lib/profiles/cold-formed.ts`, `partsC` y `partsZ` — dos líneas, la misma sustitución:

```diff
-    { w: t, ht: c, uc: b - t / 2, vc: (h - t) / 2 - c / 2 },   // partsC, top lip
+    { w: t, ht: c - t, uc: b - t / 2, vc: (h - c - t) / 2 },   // partsC, top lip
```
```diff
-  const vLip = (h - t) / 2 - c / 2;      // partsZ
+  const vLip = (h - c - t) / 2;          // partsZ, and ht: c - t on both lip parts
```

**Dos sub-decisiones que el patch expone y que hay que tomar a propósito, no por omisión:**

1. **La cota de validez se afloja.** Hoy se rechaza con `c + tf > h/2`; bajo B los labios chocan
   sólo si `c > h/2`. Es más permisivo, y es lo correcto para la convención — pero es un cambio de
   qué secciones se aceptan. `validateColdFormed` (`lipsCollide`) tiene que seguirlo.
2. **`c ≤ tf` deja de ser un error y pasa a ser «canal sin labio».** Es lo que el dibujo ya hace
   (§3.2). El `Math.max(0, …)` lo vuelve computable en vez de rechazado. Si se prefiere seguir
   rechazándolo, hay que decirlo, porque entonces las dos guardas siguen sin coincidir.

## 5. Tests que pasan de «difieren» a «coinciden»

**El test que hay que dar vuelta a propósito** —y que es la señal de que el trabajo se hizo:

`three/__tests__/cold-formed-shapes.test.ts`, el describe
«*the lip convention, and the 2t² the app already disagrees with itself by*». Sus dos casos aseveran
hoy `computed − drawn === 2t²` para el canal **y** para el zeta. Bajo B pasan a `=== 0`, y el nombre
del describe deja de describir nada: conviene renombrarlo a lo que entonces fija —que el cálculo y
el dibujo coinciden— porque un test cuyo título afirma una discrepancia inexistente confunde más de
lo que protege.

**Test nuevo que propongo agregar en el mismo commit**, porque es el que hace que la unificación no
se pueda deshacer sin ruido: momentos del polígono dibujado **iguales** a las propiedades
calculadas, en A, Iy e Iz, sobre una grilla. Es la asersión de §3.1 convertida en test, y es más
fuerte que comparar sólo áreas.

**Los demás, verificado por grep (`C-custom`, `createCShape`, `shape: 'C'`):**

| Archivo | Qué pasa bajo B |
|---|---|
| `profiles/__tests__/cold-formed-geometry.test.ts` | **se mueven los números.** Las dos identidades siguen valiendo —el C reproduce `computeSectionProperties`, y Z y C comparten `iy`— porque las dos derivaciones cambian juntas. Es el test que garantiza eso. |
| `three/__tests__/cold-formed-shapes.test.ts` | el `2t²` → 0, como arriba |
| `utils/__tests__/zed-2d-outline.test.ts` | **intacto**: compara el trazado 2D contra `zedOutline`, y ninguno de los dos cambia |
| `three/__tests__/section-profiles.test.ts` | **intacto**: cuenta vértices de `createCShape`, que no se toca |
| `store/__tests__/built-section-contract.test.ts` | **intacto**: guarda parámetros de entrada, no derivados |
| `engine/__tests__/shear-flow-audit.test.ts` | **revisar**: usa `shape: 'C'`; si asevera áreas o inercias, se mueve |
| `data/__tests__/concrete-sections.test.ts` | **intacto**: ninguna plantilla de hormigón tiene labio (§7) |

## 6. Impacto sobre C y sobre Z

| | C | Z |
|---|---|---|
| **Propiedades** | A, Iy, Iz, J bajan `2t²` y su reflejo | idénticamente lo mismo |
| **Dibujo 3D** | intacto (`createCShape`) | intacto (`zedOutline`) |
| **Dibujo 2D** | intacto (`crossSectionPath`) | intacto |
| **Designación / `built`** | intacto: guarda parámetros de entrada | intacto |
| **Modelos guardados** | **no se recalculan.** `snapshot` guarda A e I, no los reconstruye | idem |

**Las dos formas se tocan juntas, sin excepción.** Hoy la discrepancia es uniforme; arreglar sólo el
canal la volvería asimétrica y **rompería la identidad `iy(Z) == iy(C)`**, que es el chequeo
independiente que valida toda la derivación del zeta. Perder ese chequeo para arreglar la mitad del
problema sería un mal negocio.

En M1 el punto único de cambio son `partsC` y `partsZ`: las dos siguen la convención de
`computeSectionProperties` por diseño, así que el commit compartido y el de M1 tienen que entrar en
el mismo orden que la §8 describe.

## 7. Aviso para H1

**Impacto numérico sobre hormigón: exactamente ninguno.** Verificado recorriendo `SECTION_SHAPES`
con un script: de todas las plantillas, **`C-custom` es la única que declara un parámetro `c` o
`tl`**. Ninguna plantilla de hormigón tiene labio, así que ninguna cambia bajo ninguna convención.

**Impacto de coordinación: sí, y es el motivo de este documento.**

- `lib/data/section-shapes.ts` es el archivo que **contiene** las plantillas de hormigón
  (`concrete-square`, `concrete-rect`, …). Editarlo es tocar territorio compartido aunque el diff no
  roce una línea de hormigón.
- `pro/ProSectionsTab.svelte` —que sirve esas plantillas— arranca en `activeShape = 'concrete-rect'`.
  No hace falta tocarlo, pero H1 debería saber que el archivo de plantillas se mueve.
- Nada de `tokens.css`, `WorkflowStages`, `DesignOverview`, `StageSection`, `ProRibbon` ni del
  selector general está involucrado.

**Qué le pido concretamente a H1:** que confirme que ninguna plantilla de hormigón depende del caso
`C-custom` (mi grep dice que no) y que acuerde quién escribe el commit del §8.

## 8. Procedimiento para aplicar el cambio en las dos implementaciones a la vez

El riesgo no es el cálculo: es aplicar la mitad. Un canal unificado y un zeta no unificado dejan la
app en un estado **peor** que hoy, porque hoy al menos la discrepancia es uniforme y está fijada por
test.

**Un solo commit, cinco cosas dentro:**

1. `lib/data/section-shapes.ts` — el patch del §4, caso `C-custom`, incluidas las dos
   sub-decisiones.
2. `lib/profiles/cold-formed.ts` — `partsC` **y** `partsZ`, y la cota de `validateColdFormed`.
3. `three/__tests__/cold-formed-shapes.test.ts` — el `2t²` dado vuelta a 0 y el describe renombrado.
4. El **test nuevo** de momentos-de-polígono == propiedades, que es lo que impide volver atrás en
   silencio.
5. `profiles/__tests__/cold-formed-geometry.test.ts` — números actualizados, identidades intactas.

**Criterio de aceptación, uno y decisivo:** para una grilla de C y Z, los momentos del polígono que
el renderizador dibuja tienen que igualar A, Iy e Iz calculadas, **a precisión de máquina**. Si eso
pasa, la unificación está completa; si no, quedó a medias. Es exactamente la medición de §3.1, y por
eso el §5 propone dejarla como test permanente.

**Qué NO va en ese commit:** ningún cambio de dibujo (los tres renderizadores ya cumplen B), ningún
recálculo de secciones guardadas, y nada del workflow CIRSOC 301.

**Orden entre ramas:** si H1 escribe el punto 1, M1 escribe los puntos 2 a 5 **después** de que el 1
esté publicado, y verifica el criterio de aceptación sobre el árbol combinado. Es el mismo
procedimiento del bloque de tokens, que funcionó: el dueño del archivo compartido escribe, la otra
rama verifica y ajusta lo suyo.
