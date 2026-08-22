# Validación de `120f15cc` — el patch de H1, medido de forma independiente

**Rama:** `feat/pro-steel-m2` · **Commit validado:** `120f15cc`, en `feat/pro-concrete-h1`.
**Veredicto: sin divergencia. El patch no se modifica.**

Nada de esto confía en el test de H1. Todas las cifras salen de una integración propia por el
teorema de Green sobre el contorno que `createCShape` **efectivamente recorre**, contra las
fórmulas de H1 transcritas del diff. Arnés en
`scratchpad/validate-lip.mjs`.

---

## 1. El polígono dibujado contra A, Iy e Iz

Seis medidas, error relativo peor caso **1,62 × 10⁻¹⁶** — precisión de máquina:

| Sección | ΔA | ΔIy | ΔIz |
|---|---|---|---|
| `C 100x50x15x2` | 0 | 1,62e−16 | 0 |
| `C 150x60x20x2.5` | 0 | 0 | 0 |
| `C 200x75x20x3` | 0 | 0 | 0 |
| `C 80x40x12x1.5` | 0 | 0 | 1,20e−16 |
| `C 250x75x20x2` | 0 | 0 | 0 |
| `C 120x50x15x1.5` | 0 | 0 | 0 |

**El cálculo y el dibujo describen el mismo objeto.** Es el criterio de aceptación que la propuesta
definió, cumplido.

## 2. `c <= tf` → canal sin labio, calculado y no rechazado

Seis casos, en dos secciones, con `c` igual a `tf`, a la mitad y al 99 %:

- **calculado, no rechazado** en los seis;
- **ΔA contra el contorno dibujado = 0** exacto en los seis;
- **idéntico al caso `c === tf`** en los seis, o sea que efectivamente **es** el canal sin labio.

El régimen que era peor que un corrimiento de `t/2` —la app calculaba una sección con labio y
dibujaba una sin labio— quedó cerrado, y sin guarda nueva: `Math.max(0, c − tf)` es ≤ 0 exactamente
cuando el dibujo se niega a dibujar el labio.

## 3. `c > h/2` → rechazado

| `h` | `c` | Resultado |
|---|---|---|
| 100 | 49 | aceptado |
| 100 | 50 (`= h/2`) | aceptado |
| 100 | 50,1 | **rechazado** |
| 100 | 51 | **rechazado** |

La cota se aflojó como estaba previsto: con `tf = 2`, la cota vieja (`c + tf > h/2`) habría
rechazado `c = 49`; la nueva lo acepta. Sub-decisión tomada a propósito y verificada en el borde.

## 4. C y Z bajo una sola convención

| Convención | `Iy(Z) == Iy(C)` | C de M2 vs C de H1 |
|---|:---:|---|
| **línea media** (lo que M2 tiene hoy) | ✅ se mantiene | **5,58 × 10⁻²** ← divergencia |
| **cara exterior** (con el espejo aplicado) | ✅ se mantiene | **1,77 × 10⁻¹⁶** |

Dos cosas, y las dos importan:

1. **El espejo es correcto.** Con `vLip = (h − c − t)/2` y `ht: c − t` en `partsC` y `partsZ`, el C
   de M2 pasa a coincidir con el de H1 a precisión de máquina, y **la identidad `Iy(Z) == Iy(C)` se
   conserva** — que es el chequeo independiente que valida toda la derivación del zeta.
2. **Hoy hay divergencia entre ramas del 5,6 %**, exactamente lo que H1 reportó. No es un error de
   H1 ni de M2: es que el commit está en una rama y el espejo en la otra.

---

## 5. Por qué **no** apliqué el espejo, y no es cautela

Es aritmética, no criterio. **`section-shapes.ts` en el árbol de M2 sigue con la convención vieja**
—verificado: `grep -c "Math.max(0, c - tf)"` da **0**— porque `120f15cc` está sólo en la rama de H1
y M2 no integra H1.

`cold-formed-geometry.test.ts` asevera que el C de `cold-formed.ts` reproduce
`computeSectionProperties` **exactamente**. Ese test es cierto y es el que ataja el catálogo entero
contra el código que M2 no escribió. Si aplicara el espejo solo, se rompería:

| Sección | ΔA que quedaría | `2t²` |
|---|---|---|
| `C 100x50x15x2` | 8,000 mm² | 8,000 |
| `C 150x60x20x2.5` | 12,500 mm² | 12,500 |
| `C 200x75x20x3` | 18,000 mm² | 18,000 |
| `C 80x40x12x1.5` | 4,500 mm² | 4,500 |

O sea: aplicar el espejo ahora **rompe un invariante verdadero** para arreglar una divergencia que
de todos modos no se cierra hasta la integración. El estado correcto de M2 hoy es el que tiene:
**C y Z consistentes entre sí, los dos en línea media, y la diferencia con H1 medida y reportada.**

**El espejo va en el mismo commit que traiga `120f15cc` al árbol**, junto con la cota de
`validateColdFormed` (`lipsCollide`: de `c + t > h/2` a `c > h/2`) y los tests que pasan de
«difieren» a «coinciden». Es un paso atómico, y es el punto 2 al 5 del procedimiento del §8 de la
propuesta. Quien haga esa integración tiene, en este documento, las cuatro mediciones que la
aceptan.

---

## 6. Lo que hay que corregir de la propuesta

`m2-lip-convention-proposal.md` §6 decía que `utils/__tests__/zed-2d-outline.test.ts` queda
**intacto**. **Es falso**, y sale de la medición: ese test compara el trazado 2D contra `zedOutline`,
y `zedOutline` **también** mide el labio desde la cara exterior — o sea que ya cumple la convención
nueva. Los dos lados del test se mueven juntos y por eso no falla, pero la razón no es la que
escribí: no es que no le afecte, es que **le afecta a los dos lados por igual**. Lo mismo vale para
`three/__tests__/section-profiles.test.ts`.

Corregido acá en vez de reescribir la propuesta, para no tocar un documento que H1 ya citó como
fuente de la decisión.

---

## 7. Estado

- `120f15cc` **validado**. Cuatro comprobaciones, ninguna divergencia contra lo que el patch
  promete.
- **El patch no se modificó.** No había divergencia medida que lo justifique.
- El espejo de M2 está **medido y listo**, esperando la integración.
- `section-shapes.ts` **no se tocó** desde esta rama.
