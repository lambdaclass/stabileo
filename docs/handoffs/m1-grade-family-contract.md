# `catalogueGradeFamily` — contrato definitivo

**Para:** H1 (`feat/pro-concrete-h1`), que va a corregir el caso real en que una madera C24 se
clasifica como hormigón por inferencia de `fy`.
**De:** M1 (`feat/pro-steel-m1`), que aporta el módulo y la medición, no el cambio.
**Estado del módulo:** en la rama desde `6d274e37`, en uso, testeado. **Estable: M1 no lo va a
cambiar.** Si hiciera falta cambiarlo para H1, se coordina antes.

---

## 1. Qué es, en una frase

La implementación del *seam* que `material-family.ts` dejó abierto: resuelve un `gradeId`
almacenado en el modelo a la familia estructural del material, leyendo el catálogo de #132. Sin
él, la familia se sigue infiriendo de la magnitud de `fy`.

## 2. Ubicación

```
web/src/lib/engine/steel/grade-family.ts
```

Puro: sin store, sin runes, sin i18n. Importa `structural-grades` y `non-metal-grades` y nada
más. `material-family.ts` **no** lo importa —sigue siendo puro y sin catálogo, que es lo que
mantiene sus tests libres de uno— y por eso el lookup se inyecta en vez de resolverse adentro.

## 3. Firma

```ts
export const catalogueGradeFamily: GradeFamilyLookup;
```

donde el tipo, declarado en `material-family.ts`, es:

```ts
export type GradeFamilyLookup = (gradeId: string) => StructuralMaterialFamily | null;
```

Es un **valor**, no una función declarada: se pasa como argumento, no se llama directamente en
producción. Su único uso previsto es como `opts.lookupGrade`.

## 4. Entradas

Un `string`: el `gradeId` que el modelo guarda. Un `Material` lo trae en
`Material.gradeId?: string` (`model.svelte.ts:67`), escrito por el selector de materiales al
elegir del catálogo y **ausente** en todo modelo anterior a ese campo.

Acepta cualquier string sin validarlo ni normalizarlo: no recorta espacios, no cambia
mayúsculas, no interpreta prefijos. Un id es un id.

Ids que resuelve hoy, todos leídos de los propios arrays del catálogo:

| Fuente | Cantidad | Ejemplos |
|---|---|---|
| `HOT_ROLLED` | 27 | `iram-f24`, `iram-f36`, `astm-a992`, `en-s355`, `nbr-ar350` |
| `COLD_FORMED` | 20 | `astm-a653-50`, `en-s350gd`, `nbr-zar345`, `astm-a500c-shaped` |
| `STAINLESS` | 11 | `ss-1.4301`, `ss-1.4462` |
| `ALUMINIUM` | 10 | `alu-6082-t6`, `alu-6061-t6` |
| `CONCRETE` | 25 | `cirsoc-h25`, `en-c30`, `aci-4000`, `nbr-c35` |
| `TIMBER` | 13 | `en338-c24`, `en338-d60` |

Total: **68 grados metálicos** (`ALL_GRADES`) más 38 no metálicos. Contados del código, no
estimados; un test recorre los tres arrays y exige que el lookup conteste para todos.

## 5. Salidas

`StructuralMaterialFamily | null`, y la distinción entre las dos ramas es todo el contrato:

| Entrada | Salida | Significado |
|---|---|---|
| grado laminado en caliente, conformado en frío o inoxidable | `'steel'` | ferroso |
| grado de aluminio | `'aluminium'` | metal no ferroso |
| grado de hormigón | `'concrete'` | |
| clase de madera | `'timber'` | |
| id que el catálogo no conoce | **`null`** | «este catálogo no puede contestar» |
| string vacío | `null` | idem |

**`null` no significa `'unknown'`.** Significa que el catálogo no tiene la respuesta, y quien
consulta debe caer a lo que tenía. `materialFamilyOf` lo hace: con `null` sigue a la inferencia
por `fy`, que es lo correcto para un proyecto guardado contra un grado que después se retiró.
Devolver `'unknown'` haría que un material con resistencia declarada saliera como inclasificable.

**Nunca devuelve `'unknown'`, `'masonry'` ni lanza.** Un test recorre `ALL_GRADES`, `CONCRETE` y
`TIMBER` y afirma las dos cosas.

El inoxidable resuelve a `'steel'` porque lo es: ferroso, del mismo orden de módulo. No es una
afirmación de que se pueda verificar a CIRSOC 301 —nada metálico se verifica en esta app— es una
afirmación sobre qué es el material.

Los no metales están adentro **a propósito**: `material-presets.ts` escribe `gradeId` también
para hormigón y madera, porque salen del mismo picker. Un lookup que sólo supiera de metales
devolvería `null` para esos y caería en la inferencia — que acierta con el hormigón y **falla con
la madera**, que es exactamente el caso que H1 va a corregir.

El mapeo `GradeFamily → StructuralMaterialFamily` es un `switch` **exhaustivo**: una familia nueva
en el catálogo no compila hasta que se decida su lado.

## 6. Comportamiento cuando falta `gradeId`

Éste es el punto que más importa para H1, y no lo decide este módulo: lo decide
`materialFamilyOf`, y el orden es:

```
material ausente        → { family: 'unknown', basis: 'noData',      caveatKey: …noMaterial }
gradeId presente Y lookup presente Y lookup devuelve no-null
                        → { family: <declarada>, basis: 'declaredGrade' }        ← sin caveat
en cualquier otro caso, se cae a fy:
  fy ausente/≤0/NaN     → { family: 'unknown', basis: 'noData',      caveatKey: …noStrength }
  fy ≤ 80               → { family: 'concrete', basis: 'inferredFromFy', caveatKey: … }
  fy > 80               → { family: 'steel',    basis: 'inferredFromFy', caveatKey: … }
```

En claro:

- **sin `gradeId`** → comportamiento idéntico al de hoy. Pasar el lookup es **aditivo**, no una
  migración: ningún modelo viejo cambia de lado;
- **con `gradeId` que el catálogo no conoce** → también cae a la inferencia;
- **con `gradeId` conocido** → gana la declaración, sin caveat, y `isInferred()` pasa a `false`.

El `basis` es la parte accionable: `'declaredGrade'` frente a `'inferredFromFy'` es la diferencia
entre un hecho registrado y una magnitud interpretada, y es lo que la superficie metálica muestra
u oculta con `steel.panel.inferredWarning`.

## 7. Consumidores

**Hoy, en producción:** uno.

```
web/src/lib/store/steel.svelte.ts        → buildSteelInventory({ …, lookupGrade: catalogueGradeFamily })
```

**En tests:** `grade-family.test.ts` (12), `member-context-lookup-observation.test.ts` (9),
`steel-surface-audit.test.ts`, `conn-aluminium-scope.test.ts`, `emit.test.ts`.

**El que falta, y es de H1:**

```
web/src/lib/store/design-run.svelte.ts:115   buildAllMemberContexts(md, { … })   ← sin lookupGrade
```

`buildAllMemberContexts` **ya acepta** `opts.lookupGrade` (`member-context.ts:170`) y ya lo pasa a
`materialFamilyOf` (`:210`). El cambio es un argumento en el llamador; `member-context.ts` no
necesita tocarse.

```diff
       const contexts = buildAllMemberContexts(md, {
         demands: stationData.demands,
+        lookupGrade: catalogueGradeFamily,
```

con `import { catalogueGradeFamily } from '../engine/steel/grade-family';`.

**M1 no lo implementa** — ni `member-context.ts` ni `design-run.svelte.ts` — y no toca el pipeline
de hormigón.

## 8. Qué cambia y qué no, medido

`web/src/lib/engine/steel/__tests__/member-context-lookup-observation.test.ts` (9 tests) inyecta
el lookup en su propia llamada, así que no toca nada compartido y sus aserciones valen antes y
después de que H1 cablee el sitio de llamada.

| Material | Sin lookup | Con lookup | ¿Cambia el filtro? |
|---|---|---|---|
| acero declarado (`iram-f36`) | `steel`, inferido | `steel`, declarado | **no** — excluido las dos veces |
| aluminio declarado (`alu-6082-t6`) | `steel`, inferido | `aluminium`, declarado | **no** — excluido las dos veces |
| hormigón declarado (`cirsoc-h25`) | `concrete` | `concrete`, declarado | **no** — incluido las dos veces |
| **madera declarada (`en338-c24`)** | **`concrete`** | **`timber`** | **SÍ — pasa de incluido a excluido** |
| sin grado, `fy = 25` | `concrete` | `concrete` | no |
| grado retirado, `fy = 25` | `concrete` | `concrete` | no |

La única fila que se mueve es la madera, y se mueve **hacia** lo correcto. Las trece clases de
EN 338 tienen resistencia característica por debajo del techo de 80 MPa, así que hoy **todas**
entran al pipeline de hormigón y una viga C24 se diseña como hormigón de 24 MPa.

Riesgo residual, dicho explícitamente: el día que alguien cargue un hormigón de alta resistencia
**por encima de 80 MPa sin grado declarado**, hoy queda fuera del pipeline en silencio y con el
lookup sigue quedando fuera, porque sin `gradeId` no hay declaración que lo rescate. El lookup no
arregla ese caso; lo arregla declarar el grado.

## 9. Condición de aceptación

- `rc-baseline-digest.test.ts` → huella **`1bd4d9c1d575b085`**, idéntica. Si se mueve, el cambio
  dejó de ser lo que este documento describe.
- El gate agregado 386/22 de `member-context` → sin cambios.
- `steel-excluded-from-rc.test.ts` → verde; conviene agregarle el caso con `gradeId` declarado.
- Caso nuevo sugerido: una C24 declarada **no** entra al pipeline, y la misma sin grado **sí**.
  Es la única diferencia real y merece quedar fijada del lado del hormigón.

## 10. Dos cosas del vecindario, por si H1 está en esos archivos

Ninguna es necesaria para el cambio; las dos aparecieron midiéndolo.

1. **`ContextModelData.materials` no declara `gradeId`** (`member-context.ts:61`). El campo es
   posterior a la interfaz y `materialFamilyOf` lo lee defensivamente, así que funciona — pero un
   llamador que arme el modelo desde cero no ve el campo en el tipo. En el test de M1 está casteado
   por eso, y está anotado ahí.
2. **`MemberContext` guarda `verdict.family` y descarta el `basis`** (`member-context.ts:245`).
   Una superficie de hormigón no puede decir si la familia fue declarada o deducida — justo la
   distinción que el panel metálico muestra. Si a H1 le sirve, es un campo; M1 no lo agrega porque
   el archivo es compartido.

## 11. Cómo tomarlo sin integrar M1

### El commit mínimo

**`168320b0` en la rama `contract/grade-family`.** Sale de `08917b9f` —la base que M1 y H1
comparten— y contiene **dos archivos nuevos y ninguna edición**:

```
web/src/lib/engine/steel/grade-family.ts                          86 líneas
web/src/lib/engine/steel/__tests__/grade-family-contract.test.ts 148 líneas
```

El commit de M1 que introdujo el módulo, `6d274e37`, **no** sirve para esto: toca siete archivos
—`steel-inventory.ts`, el store metálico y los tres diccionarios de acero— y arrastraría trabajo
de M1 que H1 no necesita. Por eso el contrato se republicó solo.

### Cómo incorporarlo

```sh
git fetch origin contract/grade-family
git cherry-pick 168320b0
```

Sin conflicto posible: los dos archivos son nuevos y la rama sale de la base común. Alternativa
si se prefiere no cargar el commit:

```sh
git checkout origin/contract/grade-family -- web/src/lib/engine/steel/grade-family.ts
```

—aunque entonces el test se queda afuera, y es el que fija que un `gradeId` ausente no cambia
nada.

### Por qué el test es otro que el de M1

`grade-family.test.ts` (el de M1) afirma el contrato **y** sus consecuencias sobre el inventario
metálico: el aviso, `nonFerrousOnly`, el warning que desaparece. Eso depende de cambios de M1 en
`steel-inventory.ts`, así que no viaja solo.

`grade-family-contract.test.ts` (el de esta rama) depende sólo del módulo, del catálogo y de
`material-family.ts` — los tres sin cambios en la base. **Corrido sobre `08917b9f`, sin nada de
M1: 12 tests, todos verdes.** Eso es la prueba de que el contrato es autocontenido.

Los dos coexisten sin molestarse: si H1 toma el contrato y después las ramas se integran, hay dos
suites que afirman lo mismo desde distintos ángulos y ninguna duplica una aserción de la otra.

### Qué NO viene incluido

- El cableado en `design-run.svelte.ts`. Es de H1 y M1 no lo escribe.
- Cualquier cambio en `member-context.ts`. No hace falta: el parámetro ya existe.
- Nada del pipeline de hormigón.
- Nada de la superficie metálica de M1.

## 12. Compromiso de M1

- El módulo no cambia sin coordinar. Si H1 necesita otra firma, otro valor de retorno o que los
  no metales salgan de ahí, se decide antes de que lo cablee.
- M1 no toca `member-context.ts`, `design-run.svelte.ts`, `auto-verify.ts` ni el pipeline de
  hormigón.
- M1 no integra H1.
