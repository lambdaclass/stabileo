# Divergencia C/Z entre H1 y M1 — problema de INTEGRACIÓN

**Estado: no es un cambio pendiente de H1.** H1 ya aplicó lo que le correspondía en `120f15cc` y
**no volverá a tocar la convención**. Lo que falta está en la rama de M1 y M2 tiene que verificarlo
ahí.

Este documento existe para que la divergencia no se descubra en el momento del merge.

---

## 1. El estado de cada rama, hoy

| | `section-shapes.ts` (C) | `cold-formed.ts` (`partsC` / `partsZ`) |
|---|---|---|
| **`feat/pro-concrete-h1`** | **cara exterior** ✅ `120f15cc` | *el archivo no existe en este árbol* |
| **`feat/pro-steel-m1`** | línea media *(sin tocar)* | **línea media** — pendiente |

Las dos ramas calculan **áreas distintas para la misma designación** hasta que integren. En un
`C 100x50x15x2` son 444 mm² contra 452: `2t²`, un 1,8 % en área y hasta **5,6 % en Iz**.

---

## 2. Por qué H1 hizo sólo la mitad

Es lo que la propia propuesta de M1 pedía:

> *"`section-shapes.ts` no se tocó — contiene también las plantillas de hormigón, así que el cambio
> no sale de M1 de forma unilateral, y tiene que aplicarse a las dos formas a la vez."*

H1 es dueño de ese archivo y lo aplicó. **La otra mitad no la puede aplicar**: en el árbol de H1
`lib/profiles/cold-formed.ts` no existe, y tampoco hay ningún Z — las apariciones de `'Z'` en
`section-drawing.ts` son el comando *closepath* de SVG, que es lo que un grep mío encontró y leyó
mal la primera vez.

Z entró en la rama de M1 en `01da50cb` (geometría C/Z y gramática de designación) y `8f80481e`
(`'Z'` en la unión de formas, y el dibujo del zeta). Ninguno está mergeado acá.

---

## 3. Lo que falta, y es de M1

Dos líneas, tal como las escribió M1 en §4 de `m2-lip-convention-proposal.md`†:

```diff
-    { w: t, ht: c, uc: b - t / 2, vc: (h - t) / 2 - c / 2 },   // partsC, labio superior
+    { w: t, ht: c - t, uc: b - t / 2, vc: (h - c - t) / 2 },
```
```diff
-  const vLip = (h - t) / 2 - c / 2;      // partsZ
+  const vLip = (h - c - t) / 2;          // partsZ, y ht: c - t en las dos partes del labio
```

Y una tercera cosa que **no** es de dibujo y es fácil de olvidar:

**`validateColdFormed` / `lipsCollide` tiene que seguir la cota aflojada.** H1 pasó de
`c + tf > h/2` a `c > h/2`. Si el validador conserva la vieja, va a **rechazar secciones que el
cálculo acepta y computa correctamente** — un desacuerdo nuevo, en la dirección opuesta al que se
está cerrando.

---

## 4. Cómo verificarlo en la rama de M1

La evidencia de H1 está en `h1-cz-convention-evidence.md`. Para el espejo, el criterio de
aceptación es el mismo y es reproducible:

1. **Integrar el polígono dibujado y comparar contra el cálculo**, para C **y** para Z. H1 lo hace
   en `cold-formed-lip-convention.test.ts` con Green sobre los vértices de `createCShape`; el
   mismo método aplica a `createZShape`.
2. **Comprobar en las dos direcciones**: revertir la convención debe hacer fallar el test por
   exactamente `2t²` en área. Si no falla, el test no está midiendo el polígono.
3. **`c <= tf` es un canal sin labio**, no un error. `Math.max(0, c - t)` lo cierra por
   construcción — el labio útil es ≤ 0 exactamente cuando el dibujo se niega a dibujarlo.
4. **La cota `c > h/2`**, en `lipsCollide` y en el cálculo, con los mismos tres puntos: 0.049 /
   0.050 / 0.0501 sobre una sección de 0.100.

---

## 5. Orden de integración, y el riesgo si se invierte

**El espejo tiene que entrar en la misma integración que `120f15cc`, no después.**

- Si **H1 mergea primero sin el espejo**: `section-shapes.ts` calcula por cara exterior y
  `cold-formed.ts` por línea media **dentro del mismo árbol**. Dos módulos de secciones que
  discrepan es peor que la discrepancia actual entre ramas, porque deja de ser evidente.
- Si **M1 mergea primero sin el espejo**: lo mismo, con los papeles cambiados.
- Si entran juntos: el árbol queda coherente y los tests de las dos ramas se sostienen.

No hay conflicto de merge que avise: son archivos distintos. **Nada va a fallar en el merge**, y
esa es exactamente la razón de este documento.

---

## 6. Un efecto que sobrevive a la integración

Independiente de quién mergee primero, y ya anotado en la evidencia de H1:

`snapshot`/`restore` guarda A e I en vez de rederivarlos desde `built.params`. Así que una sección
`C-custom` **ya guardada** conserva sus números, y una **nueva** obtiene los de cara exterior.

**Un mismo proyecto puede terminar con dos secciones C de la misma designación y distinta área.**
No es defecto de este cambio —se sigue de que las propiedades se persistan— pero es la clase de
cosa que aparece como reporte de usuario meses después, y conviene que esté escrita antes.

---

† `docs/handoffs/m2-lip-convention-proposal.md` **no está en este árbol**: vive en
`feat/pro-steel-m1`, commit `f936f29c`. Se lee con
`git show f936f29c:docs/handoffs/m2-lip-convention-proposal.md`. Lo cito porque es la fuente de la
convención, no porque esté acá.
