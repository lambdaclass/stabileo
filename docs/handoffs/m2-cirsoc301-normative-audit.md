# Auditoría normativa local — qué define realmente el texto embarcado

**Rama:** `feat/pro-steel-m2` · PR #164 draft.

Escribí varias veces que faltaba una definición. **En cuatro casos de cinco estaba en el texto que
la app embarca y yo no lo había leído.** Este documento es el relevamiento, cláusula por cláusula,
contra el verificador, `verification-service.ts`, los inputs del workflow, los generadores y el mapa
de cláusulas.

**Fuente:** `docs/codes/CIRSOC/markdown/cirsoc-301-2018/` — capítulos A–N y ocho apéndices, 340
páginas, `sha256 cbfd04b8…`. El índice está en `docs/codes/CIRSOC/CLAUSE-INDEX.md`, que tampoco
había abierto.

---

## 1 · `Lb` — definido, y yo dije que no

**Apéndice 6, §6.1**, textual:

> «Las vigas con puntos de arriostramiento intermedios que satisfagan las especificaciones de la
> Sección 6.3. de este Apéndice podrán proyectarse basadas en la longitud lateralmente no
> arriostrada **Lb igual a la distancia entre puntos intermedios**.»

| Pregunta | Respuesta del reglamento |
|---|---|
| **Definición** | distancia entre puntos arriostrados intermedios |
| **Unidad** | **cm** (§6.2: «Lb la distancia entre riostras, en cm») |
| **¿Qué es punto de arriostramiento?** | uno que **satisface resistencia y rigidez mínimas** de §6.2 (columnas) o §6.3 (vigas). No basta que llegue una barra |
| **Qué NO es** | «el punto de inflexión no será considerado un punto arriostrado, a menos que se haya ubicado una riostra en esa posición» (§6.3) |
| **Lateral vs torsional** | §6.1: **relativo** y **nodal** para columnas y para vigas con arriostramiento lateral; **nodal** y **continuo** para vigas con arriostramiento torsional. El relativo controla el movimiento respecto de los puntos adyacentes; el nodal, sin interacción directa con ellos |
| **Arriostramiento de ala** | §6.3.1: la riostra lateral se une **cerca del ala comprimida**, con dos excepciones — extremo libre de voladizo (ala superior, en tracción) y vigas en doble curvatura (**ambas alas** en el punto cercano a la inflexión) |
| **Vigas** | §6.3: el arriostramiento debe **evitar el giro de la sección**, o sea el desplazamiento relativo entre alas |
| **Inclinadas / diagonales** | §6.1: resistencia y rigidez requeridas **corregidas por el ángulo**, e incluyendo «los efectos de las uniones y detalles de anclaje» |
| **`Lq`** | cuando la distancia real entre puntos arriostrados es **menor** que `Lq`, se toma `Lb = Lq` en las expresiones de rigidez de la riostra |

**Contra el código:** `verification-service.ts:332` pasa `Lb: L`. La **definición** está disponible;
lo que falta es el **campo en el modelo**. Y falta más de lo que creía: aunque el campo existiera, el
reglamento exige que la riostra cumpla rigidez y resistencia **incluyendo el efecto de las uniones**,
que la app no tiene. Así que la app puede **proponer** puntos candidatos desde la topología, y no
puede **certificar** que arriostren.

**Qué puede dar el generador:** la nave coloca `wallBracing`, `roofBracing` y `trussBracing` como
barras reales. Eso es geometría de riostra existente — hoy `emit.ts` no guarda la relación.
**Qué debe declarar el usuario:** que esas riostras cumplen §6.2/§6.3, porque depende de las uniones.
**Qué no puede resolver la app:** la rigidez aportada por la riostra con sus uniones y anclajes.

## 2 · `k = 1` — provisión del reglamento, no supuesto mío

**§6.1**: una columna arriostrada en extremos e intermedios según §6.2 «puede ser proyectada con una
longitud L entre puntos arriostrados y con un **factor de longitud efectiva k = 1**».

El default `Kx = Ky = 1.0` del verificador **está respaldado**, condicionado a que el arriostramiento
cumpla. Antes lo tenía listado como «no inferible».

## 3 · `Cb` — permitido, no inventado

**F.1.1**:

```
Cb = 12,5·Mmáx / (2,5·Mmáx + 3·MA + 4·MB + 3·MC)
```

con `MA`, `MB`, `MC` los momentos absolutos a ¼, ½ y ¾ del **segmento no arriostrado**, en kN·m. Y
enseguida: **«Se permite adoptar conservadoramente un valor Cb = 1 para todos los casos de diagramas
de momento flector.»** Para voladizos con extremo libre no arriostrado, `Cb = 1` es **obligatorio**.

**Contra el código:** `const Cb = 1.0` bajo el comentario «Simplificacion». Es la opción conservadora
que el reglamento ofrece. **Implementar F.1.1 es una mejora, no un arreglo** — y es viable: la app
tiene demandas por estación, así que los tres momentos son obtenibles.

**Premisa de todo el capítulo F**, que conviene registrar (§F.1(2)): las especificaciones «se basan
en que los puntos de apoyo de los miembros flexados están restringidos contra la rotación alrededor
del eje longitudinal».

## 4 · `Mp ≤ 1,5·My` — implementado en este bloque

**F.2.1**: `Mn = Mp = Fy Zx(10-3) ≤ 1,5 My`, con «**My** el momento elástico … (= Fy Sx (10-3) para
secciones homogéneas)».
**F.6.1**: el mismo tope en el eje débil, `Mn = Mp = Fy Zy (10)-3 ≤ 1,5 Fy Sy (10)-3`.

**Faltaba en los dos ejes y ninguno necesitaba un dato nuevo**: `Sx` ya se calculaba (sólo se usaba
para `Lr`) y `Sy` es `Iy/(b/2)`, el espejo exacto de `computeSx`. **Ambos aplicados.**

**Y una condición de alcance que no había visto:** F.2 se aplica «a secciones de doble simetría y a
canales flexados alrededor del eje fuerte, y con **alas y almas compactas** para flexión, tal como se
definen en la Sección B.4.1». Sin clasificar, la app **puede estar aplicando F.2 fuera de su
alcance declarado**.

**F.6.2** define pandeo local del ala para flexión respecto del eje menor. No implementado, declarado
en los pasos.

## 5 · `Ae`, agujeros y área neta — definido, y necesita un dato

**D.3(1)**: cuando la fuerza se transmite **por cada uno** de los elementos de la sección →
`Ae = An`.
**D.3(2)(a)**: cuando la transmiten **algunos pero no todos** → `Ae = An·U`, con
**`U = 1 − x̄/L ≤ 0,9`** (D.3.2), `x̄` la excentricidad de la unión y `L` su longitud, en cm.
**B.4.2**: el ancho a descontar por agujero se toma **2 mm mayor** que la dimensión nominal.
Si hay una sola fila de bulones, `Ae` = área neta de los elementos directamente unidos.

**Contra el código:** `Ae = Ag`. **Exacto** para un miembro soldado sin agujeros; **optimista** para
uno abulonado. Cerrarlo necesita el patrón de agujeros y la longitud y excentricidad de la unión —
un **dato**, no una regla mejor. Se ata al hueco `boltGeometry` ya declarado.

## 6 · `tw`, `tf`, `Fu` — ya resueltos, y no por el reglamento

No son definiciones normativas ausentes: son **inputs**. Este bloque ya dejó de inventarlos
(`missingSteelInputs`), así que el elemento se saltea y se reporta qué falta. Nada que auditar.

## 7 · Clasificación de secciones — **el único hueco de datos real**

**B.4.1** clasifica en compactas / no compactas / con elementos esbeltos contra los límites `λp` y
`λr` de las **Tablas B.4.1a y B.4.1b**.

**Esas tablas son imágenes en el PDF fuente.** El markdown embarcado trae el título, las notas al pie
(`kc`, `FL`, `Fr`, la definición de `My`/`Mp`, la capacidad de rotación inelástica) y la simbología —
**pero no las celdas**. Verificado buscando los valores característicos (`0,38`, `3,76`, `5,70`,
`E/Fy`): cero coincidencias.

**Consecuencia:** la clasificación **no se puede implementar desde este repositorio**. Es el único
ítem de la auditoría bloqueado por **datos** y no por trabajo. Y arrastra la condición de alcance de
F.2 del §4.

## 8 · Compresión, corte e interacción

| Cláusula | Qué dice | Estado |
|---|---|---|
| **E.3.1** | `Pn = Fcr·Ag` | implementado |
| **E.3.2a** | `Fcr = 0,658^(Fy/Fe)·Fy` — la variante que el código evalúa | implementado |
| **E.3.3** | `Fcr = (0,877/λc²)·Fy`, equivalente a `0,877·Fe`; el texto da la equivalencia `kL/r ≤ 4,71√(E/Fy)` | implementado |
| **E.4** | pandeo torsional y flexo-torsional — gobierna en ángulos, tes y cruciformes | **no implementado** |
| **G.2.1** | `Vn = 0,6·Fyw·Aw·Cv` | implementado |
| **G.2.2** | `Aw = d·tw` | implementado |
| **G.2.3–G.2.5** | las tres ramas de `Cv` | implementado |
| **H.1.1 / H.1.2** | interacción, con el conmutador en `Pr/Pc = 0,2` | implementado |
| **H.3** | torsión en la interacción | **no implementado** |

## 9 · Perfiles conformados en frío

Sin cambios y ya auditado: **CIRSOC 301 Cap. A los excluye por nombre** y remite a **CIRSOC 303-2009**,
que no embarca. Ninguna cláusula de 301 aplica, así que no hay definición que trazar. Ver
`m2-cold-formed-limits.md`.

---

## 10 · Balance de la auditoría

| Ítem | Antes decía | Después de leer el texto |
|---|---|---|
| `Lb` | «no inferible» | **definido** (Ap. 6 §6.1); falta el campo, y además la certificación de la riostra |
| `k = 1` | «supuesto» | **provisión del reglamento** (§6.1), condicionada |
| `Cb = 1` | «hipótesis de la app» | **explícitamente permitida** (F.1.1); obligatoria en voladizo |
| `Mp ≤ 1,5·My` | «falta, inseguro» | **implementado**, dos ejes (F.2.1 y F.6.1) |
| `Ae = Ag` | «necesita geometría» | **confirmado**, con la fórmula exacta (D.3.2) y la regla de agujeros (B.4.2) |
| Clasificación B.4.1 | «no se clasifica» | **imposible desde el repo**: las tablas son imágenes |

**Lección, dicha sin adorno:** declaré cuatro huecos que no eran huecos. La regla que sigue de acá es
la que el pedido ya enunciaba: **no asumir que una definición falta porque no está implementada**. El
texto embarcado es la primera consulta, no la última.
