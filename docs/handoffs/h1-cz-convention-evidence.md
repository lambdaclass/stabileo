# Evidencia para M2 — la convención de cara exterior, aplicada en `120f15cc`

**Rama:** `feat/pro-concrete-h1` · **Commit:** `120f15cc` · **Archivo:** `web/src/lib/data/section-shapes.ts`
**Test:** `web/src/lib/data/__tests__/cold-formed-lip-convention.test.ts` — 9 aserciones

La convención **no se volvió a cambiar**. Este documento es sólo la evidencia pedida.

---

## 1. A, Iy e Iz contra el polígono

El test integra el contorno que **`createCShape` realmente recorre** —Green sobre sus vértices,
vía `shape.getPoints(1)`— y lo compara contra lo que devuelve `computeSectionProperties` para los
mismos parámetros.

| sección | A (mm²) | Iy (mm⁴) | Iz (mm⁴) |
|---|---:|---:|---:|
| `C 100x50x15x2.0` | 444.0 | 718 012.0 | 156 865.0 |
| `C 150x60x20x2.5` | 750.0 | 2 624 843.8 | 378 842.4 |
| `C 200x75x20x3.0` | 1134.0 | 6 993 042.0 | 834 600.2 |
| `C 80x40x12x1.5` | 267.0 | 277 071.2 | 60 707.4 |

**Coinciden con el polígono a 1e-12 absoluto en área y 1e-9 relativo en las dos inercias**, en las
cuatro medidas. Son exactamente los números de la tabla §3.1 de
`m2-lip-convention-proposal.md`, reproducidos de forma independiente: yo no copié la tabla, el
test integra el contorno.

**Tolerancia relativa y no absoluta**, a propósito: las cuatro secciones abarcan de 267 a 1134 mm²
y de 10⁻⁷ a 10⁻⁵ m⁴, y un solo epsilon no puede ser correcto para las dos puntas.

### Verificado en las dos direcciones

Un test que sólo pasa no prueba que mida algo. Revertí la convención a la línea media y volví a
correr:

```
expected 0.000452  to be close to 0.000444   diff 8.0e-6   (C 100x50x15x2.0)
expected 0.0007625 to be close to 0.00075    diff 1.25e-5  (C 150x60x20x2.5)
expected 0.001152  to be close to 0.001134   diff 1.80e-5  (C 200x75x20x3.0)
expected 0.0002715 to be close to 0.000267   diff 4.5e-6   (C 80x40x12x1.5)
```

Las cuatro diferencias son **exactamente `2t²`** para t = 2, 2.5, 3 y 1.5 mm.

---

## 2. Diferencia antes / después

| sección | A antes | A después | ΔA | `2t²` | ΔIy | ΔIz |
|---|---:|---:|---:|---:|---:|---:|
| `C 100x50x15x2.0` | 452.0 | **444.0** | 8.0 | 8.0 | −1.97 % | −4.99 % |
| `C 150x60x20x2.5` | 762.5 | **750.0** | 12.5 | 12.5 | −1.98 % | −5.01 % |
| `C 200x75x20x3.0` | 1152.0 | **1134.0** | 18.0 | 18.0 | −2.04 % | −5.58 % |
| `C 80x40x12x1.5` | 271.5 | **267.0** | 4.5 | 4.5 | −1.85 % | −4.67 % |

**Iz cae bastante más que Iy** —del 4.7 % al 5.6 % contra ~2 %— y vale señalarlo porque la
propuesta no lo tabulaba: el labio está en la punta del ala, lejos del centroide en z y cerca de
él en y, así que su brazo pesa mucho más en Iz. Para un perfil conformado flexionado en el eje
débil el cambio es del orden del 5 %, no del 2 %.

Ninguna de las cuatro cambia de signo ni de orden de magnitud, y todas **bajan**: la convención de
cara exterior cuenta menos material, nunca más.

---

## 3. `c <= tf` — canal sin labio

El régimen que era peor que un corrimiento de `t/2`. `createCShape` dibuja un canal **sin labio**
cuando `lip <= tf` (línea 140), y el cálculo sumaba `2·c·tl` igual: la app **calculaba una sección
con labio y dibujaba una sin labio**.

`Math.max(0, c - tf)` lo cierra **por construcción**, sin guarda nueva: el labio útil es ≤ 0
exactamente cuando el dibujo se niega a dibujarlo.

Tres aserciones:

1. `c === tf` → A, Iy e Iz coinciden con el contorno dibujado (que es el canal sin labio);
2. `c < tf` → **computa** en vez de ser rechazado, y coincide con el contorno;
3. el resultado **iguala a un `U-custom` de la misma chapa** — la forma más fuerte de decir "sin
   labio, ES el canal".

---

## 4. La cota `c > h/2`

Antes: `c + tf > h/2`. Ahora: `c > h/2`. **Es una relajación**, y es la correcta bajo la
convención: los labios se tocan cuando sus profundidades por cara exterior suman `h`.

Aserido en tres puntos sobre una sección de h = 100 mm, tf = 2 mm:

| `c` | antes | ahora |
|---|---|---|
| 49 mm | **rechazada** (49 + 2 > 50) | aceptada |
| 50 mm | rechazada | aceptada (exactamente `h/2`) |
| 50.1 mm | rechazada | rechazada |

**Consecuencia para M2:** `validateColdFormed` / `lipsCollide` tiene que seguir esta cota, o el
validador va a rechazar secciones que `computeSectionProperties` acepta y calcula bien.

---

## 5. Impacto sobre plantillas y modelos guardados

**Plantillas de hormigón: ninguno.** El cambio está contenido en el `case 'C-custom'`.
`section-shapes.ts` también tiene `concrete-square`, `concrete-rect`, `U-custom`, etc., y ninguno
se tocó — verificado por la suite completa: **375 archivos / 7022 tests**, sin un solo fallo, así
que nada dependía de los valores viejos de C.

**Modelos guardados: no se recalculan.** `snapshot`/`restore` guarda A e I, no los reconstruye
desde `built.params`. Así que:

- una sección `C-custom` **ya guardada** conserva sus números y ningún resultado de análisis se
  mueve al abrir un `.ded` viejo;
- una sección **nueva**, o cualquier flujo que rederive desde `built.params`, obtiene los valores
  de cara exterior.

Eso implica que **un mismo proyecto puede contener dos secciones C con la misma designación y
distinta área** si una se creó antes y otra después. No es un defecto de este cambio —es la
consecuencia de que las propiedades se persistan— pero conviene tenerlo escrito antes de que
aparezca como sorpresa.

---

## 6. Z: **no está en el árbol de H1**

El brief pedía actualizar C y Z juntas. En `feat/pro-concrete-h1` **no hay Z en absoluto**: ni
cálculo en `section-shapes.ts` ni caso de dibujo. Las apariciones de `'Z'` en
`section-drawing.ts` son el comando *closepath* de SVG — lo encontré con un grep y lo leí mal la
primera vez.

El Z vive en `lib/profiles/cold-formed.ts` de M1 (`partsC` / `partsZ`), agregado en `01da50cb` y
`8f80481e`, **sin mergear acá**. Su espejo son dos líneas y está en §4 de la propuesta:

```
vLip = (h - c - t) / 2        y   ht: c - t   en las dos partes del labio
```

**Estado actual entre ramas:** la C de H1 sigue la cara exterior; la C **y** la Z de M1 siguen la
línea media. Son áreas distintas para la misma designación hasta que integren, y el orden importa:
si se mergea H1 sin el espejo, `cold-formed.ts` y `section-shapes.ts` van a discrepar dentro del
mismo árbol.

---

## 7. Qué revisar

1. Que los números de §1 coincidan con la tabla de la propuesta. **Coinciden**, y en las dos
   direcciones.
2. Que la caída de **~5 % en Iz** (§2) sea la esperada. La propuesta no la tabulaba.
3. Que la cota aflojada (§4) sea la deseada, y que `lipsCollide` la siga.
4. **Que el espejo de `cold-formed.ts` entre en la misma integración** (§6). Es lo único que puede
   dejar el árbol inconsistente.
