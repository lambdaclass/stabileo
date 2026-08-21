# M1 — checklist de QA ejecutable

**Servidor:** `http://127.0.0.1:4004` — **no** `localhost:4004`.
**Rama que sirve ese puerto:** verificar antes de empezar (§0.2). Si es otra, todo lo de abajo
mide el bundle equivocado.
**Viewport:** 1280×720 para todo. Varios ítems son específicamente sobre ese tamaño.
**Duración estimada:** 35–45 min los tres idiomas; 20 min sólo español.

> No hace falta correrla mientras H1 esté implementando su primer cambio. Está lista.

---

## 0. Preparación

### 0.1 El servidor responde

```sh
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4004/
```

Esperado: `200`. Si no responde:

```sh
cd /Users/bautistachesta/Claude/stabileo-branches/stabileo-steel/web
npm run dev -- --host 127.0.0.1 --port 4004 --strictPort
```

### 0.2 El servidor sirve M1 y no otra rama

```sh
lsof -nP -iTCP:4004 -sTCP:LISTEN -Fp | head -1        # → pNNNNN
lsof -a -p NNNNN -d cwd -Fn | grep '^n'               # → .../stabileo-steel/web
git -C /Users/bautistachesta/Claude/stabileo-branches/stabileo-steel rev-parse --abbrev-ref HEAD
```

Esperado: cwd en `stabileo-steel/web` y rama `feat/pro-steel-m1`. **Este paso no es opcional**:
hay otros worktrees del mismo repo y el 4173 ya se ocupó una vez con el preview de otra rama.

### 0.3 Llegar a las pantallas

Modo **PRO** → menú **Análisis** → **Metálicas** y **Generadores**. Uniones metálicas está en su
propia pestaña del panel PRO.

### 0.4 Cambiar de idioma

Configuración → idioma → `Español` / `English` / `Português`. Los tres ítems marcados **[3×]** se
repiten en los tres.

---

## 1. Materiales y grados — selector PRO

Abrir **Generadores** → cualquier generador → botón **Material** (dice «Sin grado declarado»).

| # | Acción | Esperado |
|---|---|---|
| 1.1 | Leer la línea antes de la lista | Dice que elegir un grado **configura el modelo y no es una verificación**. No se puede cerrar ni condicionar |
| 1.2 | Escribir `EN 10025` | Filtra por norma de producto, no sólo por designación. Aparecen S235/S275/S355/S450 |
| 1.3 | Escribir `f-24` | Aparece F-24, IRAM-IAS U 500-503 |
| 1.4 | Tildar familia **Laminado en caliente** | Aparece el desplegable **Código de diseño** |
| 1.5 | Tildar además **Aluminio** | El desplegable desaparece y sale la frase de que el filtro por código aplica con una sola familia |
| 1.6 | Volver a una familia y elegir código `EN 1993-1-1:2005` | La lista se reduce a los grados europeos |
| 1.7 | Tildar procedencia **Argentina** | Sólo grados AR. Confirmar que **no hay** chips de Australia/India/Sudáfrica — el catálogo no trae grados de esas regiones |
| 1.8 | Bajar con ↓ y subir con ↑ | La ficha de abajo sigue al cursor. `Inicio`/`Fin` van a los extremos |
| 1.9 | Enter sobre S355 | Lo selecciona y cierra el panel |
| 1.10 | Filtrar hasta vaciar la lista | Estado vacío que dice **qué filtro soltar**, no sólo «sin resultados» |

### 1.11 La ficha del grado — lo que hay que mirar de verdad

Con **S355** en el cursor:

- **fy 355 MPa** con etiqueta `Norma de producto` y una nota que dice que es la **primera banda**;
- **Bandas de espesor**: dos filas, y la segunda con fy **menor** (335);
- debajo de las bandas: «Tabuladas por **EN 1993-1-1 t.3.1** — no por la norma de producto».
  Esto es lo más importante de la pantalla: las bandas son de un código de diseño y no de
  EN 10025-2;
- **G** con etiqueta `Derivado` y la nota `G = E / 2(1 + ν)`. Se muestra como **81 GPa** — la
  ficha pasa a GPa por encima de 10 000 MPa. El valor exacto es 80 769 MPa, que es el 81 000 que
  fija CIRSOC 301 capítulo 2 para estos aceros;
- E, ν, γ con etiqueta `Norma de producto`.

Con **A529 Gr.50**: fy y fu con etiqueta **`Valor típico`** (naranja) y la frase de que son
típicos de la aleación y no leídos de la tabla que gobierna.

Con **6082-T6**: las bandas van **al revés** — la segunda fy es **mayor**. Es correcto y está
documentado; si se ve al revés, no es un bug.

### 1.12 Compatibilidad perfil/grado

1. En el generador de cabriadas, poner el perfil de **diagonal** en `L 50x50x5`.
2. Elegir grado **F-36**.
3. Esperado: aviso que nombra **los roles** cuyos perfiles no se laminan habitualmente en ese
   acero, y que aclara que es costo y plazo, no un error, y que no bloquea Generar.
4. Elegir **F-24** → el aviso desaparece.

---

## 2. Perfiles y procedencia — selector PRO

Abrir **Generadores** → fila de cualquier rol → botón con el nombre del perfil.

| # | Acción | Esperado |
|---|---|---|
| 2.1 | Ver los encabezados de grupo | Cada familia muestra su norma dimensional: `EN 10365`, `DIN 1025-1`, `IRAM-IAS U 500-215-6`… |
| 2.2 | Buscar el grupo **L** | El encabezado **no** muestra una norma sino **«2 normas»** en itálica. Hover → tooltip con las dos designaciones |
| 2.3 | Mirar las filas de **L** | Las filas IRAM llevan una etiqueta chica `IRAM-IAS`; las europeas (`L 50x50x5`, `L 100x100x10`) no llevan nada |
| 2.4 | Tildar organismo **IRAM-IAS** + familia **L** | Quedan **once** filas, todas con etiqueta. Antes de M1 esto devolvía cero |
| 2.5 | Tildar organismo **CEN** + familia **L** | Quedan las europeas, sin etiqueta |
| 2.6 | Elegir código **CIRSOC 301** | Desaparecen IPE/HEA/HEB — no están en la práctica de ese código |
| 2.7 | Altura `200`–`300` | Sólo perfiles con h entre 200 y 300 mm, **inclusive** en los dos extremos |
| 2.8 | Vaciar el campo de altura máxima | El límite desaparece y vuelven a aparecer los perfiles más altos. Un campo vacío es «sin límite», nunca cero |
| 2.9 | Teclado ↓ ↑ Inicio Fin Enter | Igual que el de grados. El foco arranca en el perfil ya elegido |
| 2.10 | Tab por todo el panel | Todos los controles reciben un anillo de foco visible, incluidos los chips y el botón ⊕ |

### 2.11 La ficha del perfil — las tres cosas que importan

**IPE 200** (doblemente simétrico):
- `Wy ≈ 194 cm³` y `Wz ≈ 28 cm³`, ambos con etiqueta `Derivado del contorno canónico`;
- `ry ≈ 8,26 cm` con etiqueta `Derivado de la tabla`;
- `J` → **No disponible**, con el motivo: no se deriva del contorno porque la aproximación
  poligonal no es J;
- `r = 12 mm` con etiqueta `De tabla`.

**UPN 200** (simétrico en un solo eje):
- `Wy ≈ 191 cm³` sin nota;
- `Wz` **con nota** de que la sección no es simétrica respecto de ese eje y que se muestra el
  módulo **mínimo**. El valor debe estar **entre 20 y 30 cm³**. Si se ve ≈ 39, está usando medio
  ancho y es un bug;
- bloque **«Lo que esta fuente no da»** con al menos una frase.

**MC18x58** (properties-only):
- `Wz` → **No disponible** con el motivo del centroide desconocido;
- `r` → **No disponible** con «radio de acuerdo no publicado».

**W12x26**: `r` con etiqueta `Derivado de la tabla` y nota de que se despejó del alma libre
publicada (`hw = d − 2(tf + r)`), no de una columna.

**IPN 200** y **UPN 200**: `r` → **No disponible** con «la norma no lo tabula: fija los radios
como reglas…». **No** debe decir que falta un dato: el contorno es exacto.

**C9x20**: `r` → **No disponible** con «el 0 del dato es una ausencia, no un radio nulo
publicado».

### 2.12 Comparación

1. Clic en **⊕** de `IPE 200`, `HEA 200` y `HEB 200`.
2. Esperado: tabla con las tres columnas y las filas h, A, masa, Iy, Wy, ry, Iz, Wz, rz.
3. Clic en ⊕ de un cuarto perfil → **no** entra (el tope es tres).
4. Cambiar los filtros hasta que ninguno de los tres esté en la lista → **la comparación
   sobrevive**. Ese es el punto.
5. **vaciar** → se cierra.
6. Confirmar que la tabla scrollea **sola** en horizontal y que **el panel no** scrollea de
   costado. A 1280×720, crítico.

---

## 3. Generadores — cabriadas, columnas reticuladas, naves

| # | Acción | Esperado |
|---|---|---|
| 3.1 | **Cabriada**: cambiar tipo, luz, flecha, paneles | La previsualización y los conteos por rol se mueven juntos |
| 3.2 | Poner un parámetro inválido (luz 0) | Lista de problemas, **Generar** deshabilitado, y el problema **atado al botón** |
| 3.3 | Corregirlo | El problema desaparece y Generar vuelve |
| 3.4 | Elegir disposición **doble** en un perfil | La figura de la sección muestra **la disposición**, no sólo el perfil |
| 3.5 | Elegir un perfil **MC** con disposición compuesta | La ofrece **no disponible** y explica el centroide desconocido |
| 3.6 | Generar y mirar el número junto a Generar | Es el número de elementos que entra al modelo |
| 3.7 | **Columna reticulada**: divisiones y patrón de celosía | Previsualización coherente; zig-zag por defecto |
| 3.8 | **Nave**: generar con todo por defecto | Genera. Anotar nodos/elementos: es la nave que los tests miden |
| 3.9 | Resolver la nave por defecto | Informa **sin resultados** — un modelo generado sale sin casos de carga, a propósito |

### 3.10 Correas y arriostramiento — el bloque nuevo de M1

1. En **Nave**, destildar **Correas**.
   - Esperado: aviso **antes** de Generar diciendo que la cubierta queda sin restricción fuera de
     su plano. Generar sigue habilitado.
2. Tildar sólo **Arriostramiento de cubierta**.
   - Esperado: aviso de **camino de carga incompleto**, que nombra el recorrido completo (plano de
     cubierta → vertical entre cerchas → aleros → vigas de alero → fachada → suelo) y aclara que
     genera igual.
3. Tildar los tres arriostramientos.
   - Esperado: aparece el selector **Vanos arriostrados** (extremos / todos) y, si **no** hay
     vigas de alero, un aviso de que la reacción sólo llega al suelo en los vanos arriostrados.
4. Tildar además **Vigas de alero**.
   - Esperado: **ningún** aviso de arriostramiento.
5. Generar con los tres + vigas y contar elementos: debe haber más que en 3.8, y el panel debe
   pedir un perfil para el rol **arriostramiento**.
6. Destildar todo el arriostramiento → volver a 3.8 exactamente (mismos conteos). Los defaults no
   se movieron.

---

## 4. Uniones metálicas y las cinco limitaciones

Abrir la pestaña **Uniones metálicas**.

| # | Acción | Esperado |
|---|---|---|
| 4.1 | Leer el encabezado | Banner experimental **antes** de cualquier número, no cerrable |
| 4.2 | Abrir un modelo mixto (hormigón + acero) y mirar la lista de nudos | Dice cuántos nudos **no metálicos** no está listando. No los omite en silencio |
| 4.3 | Seleccionar un nudo mixto | Separa los miembros metálicos de los no metálicos y explica de qué mitad hablan los cálculos |
| 4.4 | Sección **Bulones** con grado **8.8** y calcular | Resultado con corte, tracción, aplastamiento, interacción y gobernante |
| 4.5 | Cambiar el grado a **4.6** | Aparece el aviso de FvExcl **junto al resultado**, no sólo al pie. Con 8.8 no aparece |
| 4.6 | Sección **Soldaduras** y calcular | Garganta, capacidad, rango de tamaño, L ≥ 4a, utilización |
| 4.7 | Abrir **Limitaciones** | **Cinco** entradas, cada una con las cuatro facetas: qué existe, qué falta, si afecta el resultado, alcance |

### 4.8 Las cinco, por nombre

Confirmar que están las cinco y que ninguna desapareció:

1. **Rotura del metal base, no verificada** — afecta el resultado: **sí**.
2. **Geometría del grupo de bulones, incompleta** — afecta: **sí**.
3. **Torsión calculada y no mostrada** — afecta: **no**. Es un hueco de exposición: el número
   existe y no se dibuja. Que diga «no» es lo correcto.
4. **Aluminio fuera del filtro** — afecta: **sí**. ⚠ **La frase de alcance dice hoy que el
   inventario metálico sí lista los miembros de aluminio. Eso es falso desde M1** y hay un parche
   preparado sin aplicar (`patches/conn-gap-aluminium-scope.md`). Verificar el resto de la
   entrada, no esa mitad.
5. **Roscas fuera del plano de corte, sin tabular para 4.6 y 5.6** — afecta: **sí**.

Al pie: la frase de que nada de esto es certificable.

---

## 5. Estados metálicos

Abrir **Diseño → Metálicas**.

| # | Acción | Esperado |
|---|---|---|
| 5.1 | Leer el encabezado | Banner experimental primero, no cerrable |
| 5.2 | Modelo sin resolver | Estado **`—` DEMAND_UNAVAILABLE** con texto, no sólo color |
| 5.3 | Resolver con combinaciones | Pasa a **`○` NOT_DESIGNED**. **Nunca** verde, **nunca** VERIFIED |
| 5.4 | Declarar CIRSOC 301 en Reglamentos | La línea de código dice que está declarado y **marcado experimental** |
| 5.5 | Volver a Metálicas | Sigue en NOT_DESIGNED. Declarar un código no diseña nada |
| 5.6 | Modelo sin elementos | «El modelo no tiene elementos» |
| 5.7 | Modelo todo de hormigón | «Tiene N elementos y ninguno es metálico», con el censo por familia |
| 5.8 | Modelo con material sin resistencia | «Ninguno declara resistencia, así que no puede clasificarse» |

### 5.9 Grado declarado y procedencia — columna nueva de M1

1. Modelo con material del catálogo (elegido en el selector): la columna **Grado** muestra
   designación **y** norma de producto debajo.
2. Modelo viejo (material a mano, sin grado): la celda dice **«sin declarar»** y arriba aparece el
   aviso de que **la familia se dedujo de la magnitud de fy**.
3. Los dos casos en el mismo modelo: conviven, cada fila con lo suyo.

### 5.10 Aluminio

Modelo con un miembro de aluminio del catálogo (6082-T6):

- **no** aparece en la tabla de miembros;
- aparece un **aviso** que lo nombra y dice que ninguna autoridad de aluminio está implementada;
- si es el único metal: «su único metal es no ferroso (aluminio). Es metal, pero no el que esta
  superficie puede tratar». **No** debe decir «ninguno es metálico».

---

## 6. Los tres idiomas **[3×]**

Repetir en `Español`, `English`, `Português`:

| # | Pantalla | Qué mirar |
|---|---|---|
| 6.1 | Metálicas | Banner, columnas de la tabla (incluida **Grado**), estados, avisos, estado vacío |
| 6.2 | Selector de grados | Título, la frase de que no es verificación, chips de familia y procedencia, etiquetas de la ficha, notas de banda y de G, estado vacío |
| 6.3 | Selector de perfiles | «2 normas», etiquetas de base, bloque «lo que esta fuente no da», comparación, estado vacío |
| 6.4 | Generadores | Hints con unidad, avisos de correas y de arriostramiento, nombres de roles, bloque Material |
| 6.5 | Uniones | Banner, cuatro sub-secciones, las cinco limitaciones con sus cuatro facetas, aviso de FvExcl |

**Ninguna cadena debe aparecer como su propia clave** (`steel.algo.otro`). Si aparece una, es un
bug de traducción y hay que anotar la clave exacta.

**Designaciones que NO se traducen** y deben verse igual en los tres idiomas: `EN 10365`,
`DIN 1025-1`, `IRAM-IAS U 500-215-6`, `EN 1993-1-1 t.3.1`, `IPE 200`, `F-24`, `S355`, `6082-T6`.

---

## 7. Layout 1280×720 y accesibilidad

| # | Acción | Esperado |
|---|---|---|
| 7.1 | Poner la ventana en 1280×720 exactos | Ningún panel scrollea en horizontal. La comparación scrollea **dentro de su propio contenedor** |
| 7.2 | Abrir el selector de perfiles | El popover **no tapa** el panel entero. Lista acotada, ficha alcanzable |
| 7.3 | Abrir el selector de grados con la ficha abierta | Cabe. Si hay que scrollear el panel para ver la ficha, anotarlo |
| 7.4 | Tab por Metálicas, Generadores, Uniones y los dos selectores | Todo control alcanzable, anillo de foco **visible** en cada uno, orden de tabulación razonable |
| 7.5 | Escape en cada selector | Cierra |
| 7.6 | Mirar cada estado y cada resultado | **Nunca** sólo color: siempre glifo **y** palabra |
| 7.7 | Con lector de pantalla (o inspeccionando) | Los conteos son `role="status"`; las listas de problemas, `role="alert"`; los avisos de arriostramiento, `role="status"`; la figura de sección tiene nombre accesible con el tamaño ensamblado |
| 7.8 | Zoom 150 % | Nada se corta ni se superpone |

---

## 8. Qué ya está cubierto por automatización

Para no re-testear a mano lo que la suite ya afirma. Si algo de esta lista falla en la app,
**es un bug del test además de un bug de la app**.

| Área | Automatización |
|---|---|
| Conteo junto a Generar = conteo en el modelo | `generators-steel.spec.ts` G1, G1b |
| La figura sigue la disposición | G2, G2b |
| Ningún miembro metálico se presenta verificado | S1, S1b |
| El banner experimental no se puede condicionar | S2, `steel-keys.test.ts` |
| Hints con unidad, foco, 1280×720, estados honestos | `steel-ui-redesign.spec.ts` U1–U7 |
| Módulos, radios, refusals, cuatro casos del radio de acuerdo | `properties.test.ts` |
| Filtros y procedencia del catálogo | `profiles/__tests__/catalogue.test.ts` |
| Fuente de grados, bandas, pairing | `grades/__tests__/catalogue.test.ts` |
| Camino de carga longitudinal y `purlins:false` | `shed-bracing.test.ts` |
| Las cinco limitaciones, por nombre | `steel-surface-audit.test.ts` |
| Ninguna pantalla metálica muestra aprobación | `steel-never-verified.test.ts` |
| Paridad es/en/pt del namespace de acero y de `conn.*` | `steel-keys.test.ts` |
| **Los ítems mecánicos de §1, §2, §3.10, §5.9, §6 y §7** | **`m1-steel-selectors.spec.ts`** — 25 tests, cada uno nombra el ítem que descarga |
| **§3.1–3.10 (los tres generadores) y §4 completo (Uniones)** | **`m1-generators-joints.spec.ts`** — 14 tests, idem |
| **§5 completo (estados), el momento de los avisos, y los tres idiomas en runtime** | **`m1-states-and-languages.spec.ts`** — 18 tests |

### Qué queda estrictamente manual

Con los tres specs en verde —**57 tests** entre ellos— la pasada a mano se reduce a lo que ningún
test ve:

- **que las cosas quepan y se lean**: §7.3 (la ficha del grado con el panel abierto), §7.8 (zoom
  150 %), y en general si el orden de lectura tiene sentido;
- **el momento en que aparece un aviso**: los specs verifican que exista y dónde está respecto de
  otro elemento; que aparezca cuando el usuario espera verlo es criterio;
- **que los tres idiomas suenen escritos por una persona**: el spec verifica que ninguna clave se
  filtre y que las designaciones no se traduzcan, no que la prosa sea buena;
- **si la previsualización se ve bien**: el spec verifica que cambie cuando cambia un parámetro,
  no que el dibujo sea correcto — eso lo cubre `preview-projection.test.ts` a nivel unitario y G2
  para la disposición;
- **§5.4–5.5 y §5.8**: declarar CIRSOC 301 en Reglamentos y cargar un material sin resistencia
  siguen siendo manuales — el primero porque el panel de reglamentos es otra superficie, el
  segundo porque hace falta editar un material a mano. El resto de §5 está automatizado.

### El momento de los avisos, auditado

La checklist pedía revisar que las limitaciones de Uniones aparezcan cuando corresponde. Auditado
y **sin defecto**, con una nota:

- el aviso de **FvExcl** está condicionado al **grado**, no al checkbox de roscas. El comentario
  del código dice que está «atado a una casilla que el usuario está tildando en ese momento», y la
  condición real es más conservadora: aparece al elegir 4.6 o 5.6 **antes de que exista cualquier
  resultado**, así que alguien que nunca toca la casilla igual se entera de que destildarla no
  cambiaría el número. Es la dirección segura y quedó fijada por test;
- desaparece con 10.9 y 8.8, que es lo que evita que el lector aprenda a ignorarlo;
- la sección de bulones no ofrece nada hasta que hay un nudo elegido: ofrecer un diámetro sin nudo
  sería ofrecer verificar nada.

### Tres correcciones más, del turno que automatizó §3 y §4

Todas mías, todas encontradas por los tests:

3. **El ítem 3.5 apuntaba al control equivocado.** El `select` de disposición de una fila de perfil
   no es el primero del panel —ése es el tipo de cercha— y tomarlo por etiqueta agarra las tres
   filas a la vez (15 opciones: 1 de la fila rechazada más 7 de cada una de las otras dos). El
   comportamiento de la app era correcto en las dos pasadas; el localizador no.
4. **`portico2d` no existe** como ejemplo. No está en `fixture-index.ts`, así que cargarlo produce
   un modelo vacío y el fallo aparece como timeout en vez de «no hay tal ejemplo». Para un modelo
   de hormigón, usar `rc-design-qa-8`.
5. **La checklist decía «modelo mixto» para §4** sin decir cómo conseguirlo. La vía más corta:
   generar una cercha (todos los miembros metálicos) o cargar un ejemplo de hormigón y generar
   encima (conviven).

Lo que **sólo** se ve a mano: que las cosas quepan, que el orden de lectura tenga sentido, que un
aviso aparezca en el momento correcto, y que los tres idiomas se lean como escritos por una
persona.

---

## 9. Cómo anotar un hallazgo

Por ítem: número de la checklist, idioma, viewport, qué se esperaba, qué pasó, y si es de M1 o
preexistente. Si es de traducción, la **clave** exacta. Si es de layout, la resolución.

Cosas que **no** son bugs y ya están explicadas arriba: las bandas invertidas de 6082-T6 (1.11),
«sin resultados» al resolver un modelo generado (3.9), y la frase de alcance del aluminio (4.8.4,
parche preparado).

### Dos correcciones a esta checklist, encontradas al automatizarla

La primera versión afirmaba dos cosas que la app no hace, y las dos aparecieron al escribir
`e2e/m1-steel-selectors.spec.ts`. Quedan anotadas porque un revisor manual habría buscado el
número equivocado:

1. **El ítem 2.8 decía que dejar una altura a medio escribir vacía la lista.** No se puede: el
   control es `input[type=number]` y el navegador **rechaza la pulsación no numérica**. Playwright
   falla con `Cannot type text into input[type=number]`. El camino NaN de `queryProfiles` existe y
   está testeado a nivel unitario, pero es **defensivo**: no es alcanzable desde este control.
2. **El ítem 1.11 decía que G se muestra como ≈ 80 769 MPa.** Se muestra como **81 GPa**: la ficha
   convierte a GPa por encima de 10 000 MPa. El número está bien; la unidad no era la que decía
   la checklist.
