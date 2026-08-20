# M1 — Selectores metálicos PRO, propiedades con base declarada y el camino de carga longitudinal

**Rama:** `feat/pro-steel-m1` · **Base:** `feat/pro-steel-family@08917b9f` (PR21 final, PR
[#135](https://github.com/lambdaclass/stabileo/pull/135))
**Continúa:** `pr21-integration.md`, `pr21-decisions-and-generators.md`,
`pr21-lattice-cap-idealisation.md`, `pr21-steel-pro-audit.md`
**Estado:** alcance de esta iteración cerrado. Deuda y coordinación en §7 y §8.

---

## 1. Verificación de partida

| | |
|---|---|
| Rama base | `feat/pro-steel-family` |
| SHA final de PR21 | `08917b9f9a6adbf6be6bdec7894669a74b56f5eb` |
| Remoto | `origin` → `git@github.com:lambdaclass/stabileo.git` (push), HTTPS en fetch |
| Worktree | `/Users/bautistachesta/Claude/stabileo-branches/stabileo-steel` |
| Árbol al crear M1 | limpio, `0` commits por delante del remoto |
| `origin/main` | `09842722` (merge de #149) |
| Backup local del SHA base | rama `pr21-final-backup-08917b9f` + tag `pr21-final-08917b9f` |
| M1 parte de | exactamente `08917b9f` — verificado por `rev-parse` de las tres refs |
| H1 | **no integrado.** Ninguna rama de H1 es ancestro de M1 |

M1 se creó en el worktree existente en vez de uno nuevo: PR21 queda intacta en su rama y
pusheada, y así se evita un segundo `node_modules` y un segundo preview compitiendo por un
puerto. Cambiar de rama no toca PR21.

## 2. El PR #151 no trae los selectores

El pedido dice «los selectores de materiales y secciones incorporados a main mediante PR #151».
Medido:

```
PR #151  basic/stress-maps-and-selection   42 archivos — mapas de tensión, selección,
                                           paso a 2D. Ningún selector de material o sección.
PR #132  audit/basic-advanced-features    111 archivos — MaterialPresetSelector,
                                           SectionChanger, structural-grades.ts,
                                           non-metal-grades.ts, commercial-default.ts,
                                           code-lore.ts, PairingNote.svelte
```

Los selectores entraron por **#132**, cuyo merge es `d1ba4fb2`. Y ese commit **es el
merge-base de PR21 con main**, así que todo el material ya estaba en el árbol de M1 antes de
empezar: `#132`, `#145` (bandas de espesor), `#148` y `#152` son ancestros. Lo que falta de main
son 26 commits — #149, #151, #153, #155 — todos de Basic, e2e y CI, ninguno de selectores.

**Consecuencia:** no se hizo merge ni rebase de main. Integrar 26 commits de Basic para
conseguir cero selectores habría metido a M1 en un área restringida por el propio pedido («no
tocar Basic/Education») sin ganar nada.

## 3. Lo que se hizo, commit por commit

| SHA | Qué |
|---|---|
| `6d274e37` | el grado declarado llega a la superficie metálica |
| `956defce` | la familia de ángulos declara cuál de sus dos normas trae cada fila |
| `b2a559e3` | el catálogo publica módulos, radios y lo que no puede derivar |
| `b68115e9` | selector de grados PRO, sobre una fuente que el catálogo posee |
| `5def6ca0` | la nave gana camino de carga longitudinal, y la medición que lo encontró faltando |
| `a3465903` | el modelo generado lleva el grado que el usuario eligió |
| `4504845c` | el selector de perfiles filtra por organismo, código y altura, y muestra la ficha |
| `c8560d99` | el inventario dice qué grado declara cada miembro; la puerta i18n cubre uniones |

### 3.1 Integración de #132 (Fase 1)

`steel.svelte.ts` pasaba `lookupGrade: undefined` con un comentario que decía que el catálogo de
grados «no está en esta rama». Está. `grade-family.ts` es la implementación del seam —
`material-family.ts` sigue funcionando sin catálogo, que es lo que mantiene sus tests libres de
uno — y resuelve también los no metales, porque el picker escribe `gradeId` para hormigón y
madera y un lookup que sólo supiera de metales archivaría una clase de madera D60 (60 MPa) como
hormigón.

Dos consecuencias visibles:

- el aviso «familia deducida» desaparece para un miembro con grado declarado y se mantiene para
  todo modelo guardado antes de que el picker tuviera el campo;
- **el aluminio se separa del acero por primera vez.** La inferencia por magnitud de fy no podía
  distinguirlos y archivaba 6082-T6 como acero. La declaración sí, así que un miembro de aluminio
  sale de una lista cuya regla de admisión es `isSteel`. Perder filas en silencio es la falla
  contra la que se escribió ese archivo, así que el inventario lo dice: un aviso nombra los
  miembros no ferrosos y un modelo cuyo único metal es aluminio informa `nonFerrousOnly` en vez
  del falso «ninguno es metálico».

### 3.2 Procedencia por fila (Fase 1 / Fase 3)

`PROFILE_FAMILIES.L` es `[...L, ...IRAM_L]` mientras `FAMILY_CLASSIFICATION.L` declara
`EN 10056-1` para toda la familia: once filas IRAM-IAS archivadas bajo una norma europea. PR21 lo
registró como hueco heredado.

La procedencia se lee de **qué array de origen** trae la fila, que es un dato que las tablas
tienen y el array fusionado pierde. Nada se parsea de un nombre. La familia se reporta con dos
normas — `mixed`, no una de las dos haciendo de las dos — el encabezado del grupo muestra la
cantidad con las designaciones en el tooltip, y las filas cuya norma no es la de su familia
llevan su organismo como etiqueta. Filtrar por organismo ahora funciona sobre la fila: pedir
ángulos IRAM-IAS antes devolvía nada.

### 3.3 Propiedades con base (Fase 3)

`properties.ts` agrega lo que una ficha PRO necesita y las tablas no publican:

- **radio de giro** `√(I/A)`: aritmética exacta sobre dos valores tabulados, siempre disponible.
  Reproduce el 8,26 cm publicado del IPE 200 y satisface la identidad contra la que se validaron
  las tablas de tubos.
- **módulo resistente** `I/c`: `c` no está en ninguna tabla. Media altura sólo vale donde la
  simetría pone el centroide en el centro del cajón. El centroide del UPN 200 está a 20,1 mm del
  dorso del alma, así que medio ancho da Wz = 39,5 cm³ donde el que gobierna es 27,0 — una
  sobreestimación del 46 % que parece perfectamente razonable. `c` sale de `resolveProfile`, que
  construye el contorno canónico y devuelve el cajón medido desde el centroide.
- **torsión**: tabulada para los tubos IRAM y ausente en todo lo demás. **No se deriva.**

Cada cantidad lleva su base: `tabulated`, `derivedFromTable`, `derivedFromGeometry`,
`unavailable` con motivo. En un eje asimétrico se informa el módulo **mínimo** con una nota que
dice que es uno de dos. Donde nada lo sostiene — el eje débil de MC, cuya conicidad de ala ningún
contorno reproduce — la fila lo dice en vez de mostrar un número.

**El radio de acuerdo resultó significar cuatro cosas distintas** y aplanarlas habría
tergiversado tres: tabulado (IPE), despejado del alma libre publicada (W, C — una inversión, no
una columna), fijado por la norma como regla sobre las propias dimensiones (IPN, UPN, tubos —
nada falta, el contorno es exacto), y las tres C9 que traen `r: 0`, que en `iram-c.ts` significa
«sin radio usable, se dibuja con esquinas vivas». Un cero mostrado como valor tabulado atribuye a
la norma una decisión nuestra.

### 3.4 Selector de grados PRO (Fase 2)

`lib/grades/catalogue.ts` le da a `structural-grades.ts` el seam de consulta que no tenía. El
filtro por código se delega a `gradesForCode` —incluida su decisión de devolver la familia
completa cuando un código no coincide con nada— y se ignora, en vez de adivinarse, cuando hay más
de una familia seleccionada, porque un código de diseño cubre exactamente una.

La ficha declara la autoridad de cada número, que es lo que Basic no puede mostrar: valores de la
norma de producto; las resistencias de los 45 grados que la fuente marca como típicos de la
aleación; el módulo de corte, derivado por `G = E/2(1+ν)` y etiquetado como derivado — da 80 769
MPa para los aceros EN, que es el 81 000 que fija CIRSOC 301 capítulo 2, confirmación
independiente de que la identidad es la correcta; y las bandas de espesor, siempre con el código
de diseño que las tabula y nunca junto a la norma de producto sin calificar.

No se reusó `MaterialPresetSelector`: es un modal sobre toda la app, ofrece hormigón y madera, no
tiene recorrido de teclado ni eje de procedencia, y su única marca de origen es un `~`.

### 3.5 El camino de carga longitudinal (Fase 4)

PR21 resolvió la nave generada bajo carga **vertical**. Bajo carga **a lo largo del edificio** la
misma nave devuelve **2,4·10¹¹ m** para 20 kN: no es matriz singular, así que toda comprobación
`isFinite` pasa. Es exactamente el modo de falla del §7 de
`pr21-lattice-cap-idealisation.md`, en una dirección que nadie había cargado.

El instrumento es el que estableció ese archivo. Restringir traslación a lo largo del edificio en
**todos los nudos por encima del alero** baja la respuesta a exactamente cero; restringir la
línea de aleros no cambia nada. El cuerpo libre es la cubierta, y la razón es estructural: una
cercha plana con alma articulada no tiene rigidez fuera de su plano, así que todo el cordón
superior, atado pórtico a pórtico por las correas, se traslada de costado como una pieza.

Tres miembros hacen el camino y ninguno lo hace solo:

```
plano de cubierta → arriostramiento vertical entre cerchas → línea de aleros
                  → vigas de alero → fachada arriostrada → suelo
```

| Configuración | Desplazamiento máximo, carga longitudinal 20 kN |
|---|---|
| nave por defecto | 2,4·10¹¹ m |
| + arriostramiento de cubierta y de fachada | 1,7·10¹¹ m |
| arriostramiento vertical sin fachada | 1,9 m |
| sistema completo, vanos extremos | **4,4 mm** |
| sistema completo, todos los vanos | **2,3 mm** |
| sistema completo sin vigas de alero | 33 mm |

Once órdenes de magnitud es lo que separa un camino de carga de un mecanismo más rígido.

**`purlins: false`** queda contestado en sus dos mitades. Arriostrar sólo los vanos extremos deja
a los pórticos interiores sin sujeción lateral, así que sigue siendo mecanismo. Arriostrar
**todos** los vanos aporta la restricción que aportaban las correas y resuelve verticalmente en
4,8 mm — que es una afirmación sobre cuál restricción faltaba, no una sugerencia de que una
cubierta pueda ir sin correas. La declaración `roofWithoutPurlins` sigue viajando con el modelo
con cualquier arriostramiento, porque habla de las correas y no de la rigidez.

Las diagonales apoyan sólo en acero que ya está ahí: `findNode` no puede crear un nudo —una
diagonal dibujada a una posición calculada dejaría un nudo sostenido por dos barras y nada más,
un nudo libre introducido por el miembro que venía a quitar uno— y un test afirma que la cantidad
de nudos no cambia en ninguna configuración, así que una diagonal omitida en silencio falla en
vez de embarcar una fachada sin cruz.

Los tres arrancan en `false`: la nave que sale al apretar Generar es la que PR21 midió.

### 3.6 Generadores y grado (Fase 4)

`GeneratorMaterial.gradeId` existía desde PR21 y nunca había recibido un valor. Ahora el panel
elige un grado, uno para todo el modelo porque un pórtico se fabrica de un acero, y reporta la
consecuencia **por rol**: los roles no comparten familia de sección —los cordones de una nave son
perfiles I y sus diagonales ángulos— así que la pregunta de compatibilidad tiene una respuesta
cada uno, y el panel nombra los roles cuyos perfiles ese acero no se lamina habitualmente. Costo
y plazo, nunca corrección, y no bloquea nada.

Se usa el `fy` de cabecera, no un valor de banda: un generador coloca perfiles y no los
dimensiona, así que el espesor que gobierna no se conoce ahí y resolver una banda sería inventar
la decisión que elige una.

### 3.7 Uniones metálicas (Fase 5)

**Auditoría: sin cambios de comportamiento necesarios.** Las cuatro sub-secciones siguen, las
cinco limitaciones siguen visibles con sus cuatro facetas, y el aviso de `FvExcl` para 4.6 y 5.6
sigue junto al resultado y no sólo en el pie — verificado por posición en el test.

Lo que faltaba era la puerta: las 77 claves `conn.*` viven en los diccionarios principales, no en
el namespace de acero, así que la comprobación de paridad nunca las vio. Ahora se verifican en
es/en/pt, con los ids leídos del propio panel para que una sexta limitación sin sus cinco frases
falle ahí.

El filtro metálico del panel lee el mismo veredicto del inventario, así que conectar el catálogo
lo hizo más estricto gratis: a un miembro de aluminio ya no se le ofrece un grupo de bulones.

## 4. Solapamientos con H1 — nada editado, todo reportado

M1 no tocó **ningún** archivo de la lista de alto riesgo. Concretamente: `ProPanel`, `ProRibbon`,
`StageSection`, `DesignOverview`, `model.svelte.ts`, `member-context.ts`, `DocumentModel`,
`tokens.css`, `App.svelte`, los diccionarios i18n principales y los tests globales de PRO están
sin modificar.

Cómo se logró: todo lo nuevo vive en módulos propios de acero (`lib/grades/`, `lib/profiles/`,
`lib/engine/steel/`, `lib/engine/generators/`, `components/pro/steel/`,
`components/pro/generators/`) y **todas** las claves i18n nuevas van a `locales/steel/{es,en,pt}`,
que se fusionan en `store.svelte.ts` sin tocarlo. `StageSection` se usa como componente, sin
editarlo.

Cuatro cosas necesitan coordinación, ninguna urgente:

1. **`lib/engine/auto-verify.ts:46`** — `const CONCRETE_FY_CEILING = 80` duplica la constante
   exportada por `lib/engine/steel/material-family.ts:54`, mismo valor a propósito. Contrato: una
   constante numérica. Impacto sobre H1: nulo si se importa en vez de redeclarar; el valor no
   cambia, así que ningún resultado de hormigón se mueve. Propuesta: `import { CONCRETE_FY_CEILING }
   from './steel/material-family'` y borrar la línea 46. Dos líneas.

2. **`lib/engine/design/member-context.ts`** — `buildAllMemberContexts` acepta
   `opts.lookupGrade` y sigue recibiendo `undefined`. Pasarle `catalogueGradeFamily` convertiría
   también la exclusión de metálicos del pipeline de hormigón en una declaración. Impacto medido:
   nulo en práctica —el hormigón catalogado llega a 50 MPa y ningún grado metálico baja de 130—
   pero el archivo es compartido y `rc-baseline-digest` lo guarda, así que la decisión es de quien
   coordine. Propuesta: un solo argumento en el sitio de llamada, con la huella
   `1bd4d9c1d575b085` como condición de aceptación.

3. **`lib/i18n/locales/{es,en,pt}.ts` · clave `conn.gap.aluminium.scope`** — dice «sus nudos
   pueden quedar fuera de esta lista aunque el inventario metálico sí los liste». Dejó de ser
   cierto en esta rama: el inventario tampoco los lista, los nombra en un aviso. Propuesta de
   reemplazo (es): «Modelos con miembros de aluminio: sus nudos quedan fuera de esta lista, y el
   inventario metálico tampoco los lista — los nombra en un aviso, porque las tablas de bulones y
   electrodos son de acero.» No se editó: archivo compartido, y sombrear la clave desde el
   namespace de acero sería cambiar en silencio un texto de la otra rama.

4. **`profileSelector.*` en los diccionarios principales** — PR21 puso ahí las claves del picker.
   M1 agregó las suyas bajo `steel.profileSelector.*` para no tocar el archivo, así que el
   componente lee de dos prefijos. Consolidarlas en el namespace de acero es un movimiento
   mecánico que conviene hacer cuando H1 y M1 se integren, no antes.

## 5. Tests

Nuevos: `grade-family.test.ts` (12), `properties.test.ts` (18), `grades/catalogue.test.ts` (23),
`shed-bracing.test.ts` (17), más ampliaciones de `profiles/catalogue.test.ts` (+8),
`emit.test.ts` (+3) y `steel-keys.test.ts` (+3 y paridad en portugués).

Dos agujeros de test cerrados en la propia puerta i18n del acero: el portugués no lo verificaba
nada, y las claves `steel.panel.empty.*` estaban listadas a mano, así que la cuarta razón de
vacío habría embarcado mostrando su propia clave. Ambas ahora se expanden de las uniones de las
que salen.

## 6. Puertas

| Puerta | Resultado |
|---|---|
| `npm run typecheck` | 479 errores, baseline 479 — **sin errores nuevos** |
| `npx vitest run --project unit` | **6994 pasan**, 12 skip, 1 todo, 0 fallan |
| `npx vitest run --project build` | 14 pasan |
| `npm run build` | ✓ en 16,3 s |
| `npm run check:gate` | ✓ sin errores en rutas guardadas |
| `E2E_PORT=4291 playwright --grep @smoke` | **270 pasan**, 4 skip, 0 fallan |
| `E2E_PORT=4292 generators-steel.spec.ts` | 10 pasan (G1, G2, S1, S2 incluidos) |
| `rc-baseline-digest` | huella `1bd4d9c1d575b085` **sin cambios** |

`E2E_PORT` explícito en las dos corridas. El 4173 **estaba ocupado** por el preview de otro
worktree durante esta sesión, que es exactamente la trampa que documenta el §5 de
`pr21-integration.md`.

## 6b. Los cinco huecos de Uniones metálicas, como referencia fija

La lista canónica vive en el panel (`ProConnectionsTab.svelte`, constante `GAPS`) y sus textos en
las 77 claves `conn.*` de los diccionarios principales. Acá quedan los cinco por nombre, con el
único campo que no es prosa, para que se puedan verificar sin abrir la app y para que quitar uno
sea un cambio visible en un diff.

| id | De qué habla | ¿Afecta el resultado? |
|---|---|---|
| `baseMetal` | Rotura del metal base: `checkFilletWeld` recibe el espesor de chapa y no su Fu, así que no compara el cordón contra la chapa | **sí** |
| `boltGeometry` | Geometría del grupo: filas, pasos, gramiles y excentricidad respecto del baricentro | **sí** |
| `torsion` | Mx se calcula por barra y por extremo, y no se dibuja. Hueco de **exposición**, no de cálculo | **no** |
| `aluminium` | El filtro admite por `isSteel`, y las tablas de bulones y electrodos son de acero | **sí** |
| `fvExcl` | `FvExcl` sin tabular para 4.6 y 5.6: la caída al valor con roscas incluidas es correcta y silenciosa | **sí** |

Dos propiedades que se mantienen y están testeadas: `affects` distingue «un estado límite que
nadie calcula» de «un número que existe y no se muestra» —una lista donde todo afectara el
resultado sería una lista de disculpas— y el aviso de `fvExcl` aparece **junto al resultado**,
porque un hueco que vive sólo en un pie de página es uno que nadie lee en el momento en que
importa. `steel-surface-audit.test.ts` fija los cinco ids por nombre y los cinco valores de
`affects`; `steel-keys.test.ts` verifica las cuatro facetas de cada uno en los tres idiomas.

**Salvedad vigente:** la faceta `scope` de `aluminium` dice hoy que el inventario metálico sí
lista los miembros de aluminio, y eso es falso desde `6d274e37`. Parche preparado y sin aplicar en
`patches/conn-gap-aluminium-scope.md`; espera el commit de i18n de H1.

## 7. Deuda que M1 deja abierta

- **La ficha de perfiles no tiene módulo plástico.** `Wpl` necesita el eje neutro plástico, que no
  sale de las tablas y no se derivó. Ausente, no aproximado.
- **Torsión de secciones cerradas por Bredt** sigue fuera de alcance, como en PR21. `j: null`
  declarado; el catálogo IRAM publica `j` para RHS/SHS y sigue siendo la vía de validación.
- **La comparación no marca el mejor valor de cada fila.** Tres columnas de números sin resaltar
  cuál gobierna es menos de lo que un ingeniero espera; se dejó fuera porque «mejor» depende del
  eje que gobierna y eso es una decisión de diseño, no de formato.
- **Los arriostramientos no se dimensionan.** Colocan geometría y declaran su hipótesis. Ninguna
  autoridad metálica los verifica, como nada metálico se verifica acá.
- **12 idiomas fuera de es/en/pt** siguen cayendo a inglés en el namespace de acero, igual que en
  PR21 y que casi todos los namespaces fuera de `design.*`.
- **§8 de `pr21-lattice-cap-idealisation.md` quedó desactualizado**: dice que la causa de
  `purlins: false` «no está demostrada», y el comentario de `shed.ts` que dejó el commit
  `606ca6e4` sí la demuestra. No se editó ese documento porque pertenece a PR21, que está en
  revisión; se registra acá.

## 8. Estado de QA y autoría

**QA manual pendiente** (dev server en `http://127.0.0.1:4000/`, no `localhost`):

1. Diseño → Metálicas: la columna Grado muestra designación y norma; un modelo viejo muestra «sin
   declarar» y conserva el aviso de familia deducida.
2. Generadores → Nave: elegir grado, ver el aviso de combinación inusual poniendo F-36 con
   diagonales de ángulo; tildar sólo Arriostramiento de cubierta y leer el aviso de camino
   incompleto.
3. Selector de perfiles: filtrar por IRAM-IAS y familia L y confirmar que aparecen las once filas
   con etiqueta de organismo; abrir la ficha de un MC y confirmar que Wz dice «no disponible» con
   motivo; fijar IPE 200 y HEA 200 y comparar.
4. Los tres idiomas en las tres pantallas, a 1280×720.

**Autoría:** ocho commits, `Author` y `Committer` = `Bauti <syngoviano@gmail.com>`, todos con
firma verificada (`%G? = G`), cero trailers `Co-authored-by`, cero pie de agente en commits o
documentación. No se reescribió historia: ningún rebase, ningún force-push.

**¿M1 lista para revisión?** El alcance de esta iteración sí: puertas verdes, hormigón intacto,
nada metálico presentado como verificado, y los cuatro estados conservados. Falta el QA manual de
§8 y la decisión de coordinación sobre los cuatro puntos de §4 antes de integrar.
