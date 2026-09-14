# El codec de share — qué lleva y qué no

**El documento tiene dos mitades, con estados distintos.** Leer el índice antes que el cuerpo:

| Mitad | Qué | Estado |
|---|---|---|
| **§1–§6** | Los cuatro campos de **sección**: `composition`, `profileFamily`, `tl`, `built` | **abierta** — sigue siendo un pedido de decisión, no un parche |
| **§7** | Las **uniones diseñadas** (`jointDesigns`) | **implementada** — `SHARE_VERSION = 5`, `feat/pro-steel-m2` |

**Ojo con `SHARE_VERSION`.** §4 se escribió proponiendo el 5 para los campos de sección, y el 5
**ya se gastó** en las uniones (§7). Eso **no** invalida la propuesta: la restricción de §3 es que
todo campo nuevo entre como **clave del objeto opcional**, y una clave opcional **no necesita un
incremento**. Los cuatro campos de sección se pueden agregar bajo el 5 tal cual; si se quisiera una
etiqueta propia, es el **6**. Lo que la propuesta pide sigue en pie palabra por palabra: nada
posicional, nada obligatorio.

**Origen de §1–§6:** `feat/pro-steel-m1`. Detectado al probar el contrato `built` (`ae3a6186`);
ampliado al abrir el bloque C/Z de M2.

**No es un defecto que introduzca ninguna de las dos ramas.** Es preexistente, y afecta a
funcionalidad de hormigón y de acero por igual. Por eso va como handoff conjunto: el archivo es
compartido y el formato es versionado.

---

## 1. Qué pierde hoy `compressV2`

`utils/url-sharing.ts:187` codifica cada sección como una **tupla posicional**:

```
[ id, name, a, iz, { s?, b?, h?, w?, f?, t?, iy?, j?, rot? } ]
```

Las claves opcionales que escribe son exactamente nueve: `s` (shape), `b`, `h`, `w` (tw), `f` (tf),
`t`, `iy`, `j`, `rot` (rotation).

`interface Section` declara quince campos: `id name a iz b h shape tw tf t tl iy j rotation
profileFamily`, más `composition` y `built`. **El codec lleva once y descarta cuatro.**

| Campo descartado | Qué se pierde con él | Desde cuándo |
|---|---|---|
| **`composition`** | La composición de una **sección armada**: `profileName`, `arrangement`, `gapMm`. Un armado compartido por URL vuelve como una sección lisa con las propiedades correctas y **sin decir de qué está hecho**. | PR21 |
| **`profileFamily`** | La familia de catálogo de un perfil. El nombre sobrevive (va en la posición 1), la familia no. | previo |
| **`tl`** | El espesor del labio de un conformado en frío. `case 'C'` de `createSectionShape` sustituye entonces el espesor **del ala**. | previo |
| **`built`** | La plantilla y los parámetros con que se construyó una sección paramétrica. Contrato `ae3a6186`. | 2026-08 |

Verificable en una línea: `grep -c "composition\|profileFamily\|\btl\b" src/lib/utils/url-sharing.ts`
devuelve **0**.

---

## 2. Impacto, y por qué es más ancho de lo que parece

El link compartido **no es sólo el botón «Compartir»**. Tres consumidores lo usan:

1. **`toolbar/ToolbarProject.svelte`** — el compartir explícito.
2. **`components/FeedbackWidget.svelte:62`** — **cada reporte de feedback adjunta un share link
   generado automáticamente.** O sea: si un usuario reporta un problema con una sección armada o con
   una correa conformada en frío, **el link que llega al issue reconstruye el modelo sin el campo
   del que habla el reporte**. Es el peor caso de los tres, porque el dato se pierde justo cuando
   alguien lo está mirando.
3. **`components/edu/exercise-source.ts`** — los ejercicios de Education se distribuyen por link.
   Un ejercicio autorado con un armado llega al alumno sin el armado.

**Qué NO se pierde:** el `.ded`, el undo/redo y la captura de pestaña llevan todo. Esos van por
`snapshot()`/`restore()`, que desestructura la sección entera y la copia. El agujero es **sólo** del
codec de URL.

**Qué sí sobrevive de una sección compartida:** `name`, `a`, `iz`, y las nueve opcionales. O sea el
**análisis está bien** —el solver tiene área e inercias— y lo que se degrada es la **procedencia** y
el **dibujo**.

---

## 3. Compatibilidad hacia atrás — las dos direcciones

`SHARE_VERSION = 5` hoy — era 4 cuando se escribió esto, y §7 lo movió —, y `decompressSnapshot`
ya hace detección: prefijo
`"2."` → v2, si no → v1 LZ-String heredado, con migración de `hingeStart/hingeEnd` → `releaseI.mz`.
O sea **el mecanismo de versionado ya existe y ya se usó**. Esto no inventa uno.

Las dos direcciones que hay que cumplir:

- **Leer viejo con código nuevo.** Un link v4 no trae los cuatro campos. Tienen que quedar
  **ausentes**, no en cero ni en `null`: los cuatro son opcionales y `undefined` es su estado
  legítimo. Un `tl: 0` sería peor que no tenerlo, porque `case 'C'` distingue `tl > 0` de ausente.
- **Leer nuevo con código viejo.** Un link v5 abierto por una pestaña vieja. La tupla es
  **posicional**, así que agregar claves **dentro del objeto opcional** (posición 4) es compatible:
  un lector viejo ignora las claves que no conoce. Agregar una **sexta posición** al array no lo
  sería.

**De ahí la restricción de diseño:** los campos nuevos van **como claves del objeto opcional**, no
como posiciones nuevas.

---

## 4. Propuesta de migración

**Un solo incremento, que era el `SHARE_VERSION = 5`** — ya gastado por §7, así que hoy esto es
«bajo el 5, sin incremento» o «el 6 si se quiere etiqueta». La forma no cambia:

```
[ id, name, a, iz, { …las nueve actuales…,
                     pf?,   // profileFamily
                     tl?,   // espesor del labio
                     cp?,   // composition → [profileName, arrangement, gapMm]
                     bt? } ] // built → [shapeType, params]
```

Cuatro decisiones y las razones:

1. **Claves cortas.** El codec entero está optimizado para longitud de URL (`MAX_URL_SAFE` es un
   límite real que `ToolbarProject` chequea). Dos letras, igual que las nueve existentes.
2. **`composition` como tripla posicional**, no como objeto: tres campos fijos, siempre presentes
   los tres. Ahorra las tres claves.
3. **`built` como par `[shapeType, params]`**, con `params` como objeto — sus claves son los ids de
   parámetro de la plantilla y no se pueden acortar sin una tabla de alias que habría que mantener
   sincronizada con `SECTION_SHAPES`. **Es el campo más caro en bytes**, y por eso vale medir antes
   de decidir si entra: una sección construida agrega ~40-60 caracteres.
4. **Nada obligatorio.** Las cuatro se escriben sólo si están, como las nueve actuales.

**Orden sugerido, por costo/beneficio:**

| Paso | Campo | Costo en bytes | Por qué en este orden |
|---|---|:---:|---|
| 1 | `tl` | ~6 | Un número. Arregla que el dibujo de un conformado en frío use el espesor del ala. |
| 2 | `pf` | ~10 | Un string corto. Restituye la familia de catálogo. |
| 3 | `cp` | ~25 | Restituye la composición de un armado — la pérdida más visible, funcionalidad de PR21. |
| 4 | `bt` | ~40-60 | El más caro. Decidir con la medición del paso 3 en la mano. |

Los pasos 1 a 3 se pueden hacer juntos en un `SHARE_VERSION = 5`. El 4 puede esperar y no necesita
otra versión (es una clave opcional más).

**Lo que la propuesta NO hace:** inventar una codificación posicional sin versión. Todo campo nuevo
entra como clave del objeto opcional, bajo un `SHARE_VERSION` incrementado, con el lector viejo
ignorando lo que no conoce.

---

## 5. Archivos compartidos implicados

| Archivo | Qué cambia | Riesgo |
|---|---|---|
| **`lib/utils/url-sharing.ts`** | `compressV2` (~línea 187), el decodificador (~línea 367), `SHARE_VERSION` | El único con cambio real. Formato de cable: un error acá rompe todo link compartido. |
| `components/toolbar/ToolbarProject.svelte` | nada, pero **conviene revisar** que el link más largo siga bajo `MAX_URL_SAFE` | bajo |
| `components/FeedbackWidget.svelte` | nada; se beneficia solo | ninguno |
| `components/edu/exercise-source.ts` | nada; se beneficia solo | ninguno |

**Ningún archivo de la lista de no-editar-en-paralelo** (`tokens.css`, `WorkflowStages`,
`DesignOverview`, `StageSection`, `ProRibbon`, selector general) está involucrado.

**Dueño propuesto: integración común.** El campo que más se nota (`composition`) es de hormigón y
acero por igual —los armados los usan las dos ramas—, el formato es un contrato de cable, y las
tres funcionalidades afectadas (compartir, feedback, ejercicios) son transversales. **No es un
bloque de M1 ni de H1.**

---

## 6. Qué tests hacen falta

Lo mínimo para que esto no vuelva a pasar sin que nadie lo note:

1. **Un test de completitud de campos.** Que enumere las claves de `interface Section` y falle si
   alguna no está ni cubierta por el codec ni **declarada explícitamente como excluida**. Es la
   pieza que falta: hoy nada avisa cuando se agrega un campo y el codec no se entera — que es
   exactamente cómo llegaron a ser cuatro.
   **Ya existe una implementación de esto para copiar**, hecha para las uniones en §7.5: un fixture
   `Required<…>` que el tipo obliga a completar, más un test que compara sus claves contra la tabla
   de campos del codec. Las dos mitades se verificaron a mano — sacar un campo de la tabla hace
   fallar el test por nombre, y agregar uno al tipo produce **un error de typecheck nuevo** que
   apunta al fixture. Para `interface Section` es el mismo patrón con `Required<Section>`.
2. **Round-trip por campo**, con una sección que tenga los cuatro a la vez.
3. **Compatibilidad hacia atrás**: un link v4 fijo en el test, que descomprima y deje los cuatro
   campos **ausentes** (no en cero).
4. **Compatibilidad hacia adelante**: un payload v5 leído por el decodificador, verificando que las
   claves desconocidas se ignoran sin romper.
5. **Presupuesto de longitud**: un modelo realista con secciones construidas, aseverando que el link
   queda bajo `MAX_URL_SAFE`.

Mientras tanto la pérdida está **fijada como pérdida declarada** en
`store/__tests__/built-section-contract.test.ts`, que asevera explícitamente que `built`, `tl` y
`composition` **no** sobreviven al share. Si alguien ensancha el codec, ese test falla y tiene que
venir a decir cuál de los tres ahora cubre. **Es el recordatorio, no la solución.**
---

# 7. Las uniones diseñadas — implementado, `SHARE_VERSION = 5`

**Estado: implementado.** Es la otra mitad de I-08, y la que abrió I-06: las uniones viajaban por
`.ded`, undo/redo, captura de pestaña y autosave, y **no** por el codec de URL. Una nave con veinte
nudos diseñados compartida por link llegaba con los veinte sin diseñar.

**No es lo mismo que §1–§6 de este documento.** Los cuatro campos de sección (`composition`,
`profileFamily`, `tl`, `built`) **siguen abiertos**: son una pérdida preexistente, de hormigón y de
acero por igual, y este trabajo no los tocó. Lo que se cerró es la asimetría **nueva**, la que M2
introdujo al poner las uniones en el modelo.

## 7.1 · El formato

Una clave **nueva de primer nivel** del objeto compacto, `jd`. **Ninguna posición nueva en ninguna
tupla existente**, que es la restricción de diseño de §3 y sigue vigente:

```
jd: { v: 1,
      j: [ [ nodeId, memberCount, [x,y,z] | 0, choices ], … ] }
```

Cuatro posiciones fijas por unión, y **todo crecimiento futuro va adentro de `choices`** o de una
clave opcional nueva, nunca como quinta posición.

`choices` tiene cuatro grupos, cada uno con claves de una o dos letras:

| Grupo | Clave | Campos |
|---|---|---|
| `bolts` | `b` | `d` diámetro · `g` grado · `th` roscas · `n` cantidad · `r` filas · `s` paso · `e` distancia al borde · `ef` terminación del borde · `x` exposición · `sp` planos de corte · `dc` deformación considerada |
| `plate` | `p` | `t` espesor · `fu` |
| `weld` | `w` | `l` lado · `ln` longitud · `r` corridas · `fx` FEXX · `tk` parte más gruesa · `tn` parte más delgada · `p` proceso · `ld` tipo de carga · `dm` demanda |
| `battens` | `ba` | `a` disposición · `g` huelgo · `l` longitud · `s` segmentos · `ri` radio de giro del cordón · `m` barra |

**`SHARE_VERSION` pasa de 4 a 5**, y es un incremento compatible en las dos direcciones:

- **leer viejo con código nuevo**: un link v4, v3 o v1 no trae `jd`, y la ausencia se lee como
  «no se diseñó ninguna unión» — **no** como una unión vacía diseñada en cada nudo;
- **leer nuevo con código viejo**: las dos migraciones que existen preguntan `sv >= 3` (convención
  `iy`/`iz`) y `sv >= 4` (liberaciones tipadas). Con `sv = 5` las dos siguen tomando la rama
  correcta, y `jd` es una clave que el decodificador viejo no lee y por lo tanto ignora.

`jd.v` es la versión **del contenedor de uniones**, y es la misma
`JOINT_DESIGNS_SCHEMA_VERSION` que escribe el `.ded`: una sola versión para el campo, en los dos
formatos.

**Y el filo de eso, dicho antes de que lo encuentre alguien de la peor manera.** Acoplar las dos
versiones tiene una consecuencia que no es obvia: `unpackJointDesigns` **rechaza el link entero** si
`jd.v` no es la versión que este build lee (§7.3). Entonces, el día que alguien incremente
`JOINT_DESIGNS_SCHEMA_VERSION` por una razón de **`.ded`** —que es el otro consumidor de la
constante—, todos los links ya compartidos dejan de abrir **completos**, no «sin uniones».

No es un defecto hoy: con una sola versión en circulación el camino es inalcanzable. Es una trampa
para el próximo cambio, y tiene arreglo chico cuando se quiera tomarlo — separar la versión del
contenedor de URL de la del modelo, o tratar una versión desconocida de `jd` como «no puedo leer
estas uniones» en lugar de «no puedo leer este link». **Lo segundo contradice la decisión de §7.3**,
así que no es un parche mecánico: es la misma disyuntiva de esa sección, y hay que elegirla a
propósito. Queda anotado para M3 y no se toca acá.

## 7.2 · Qué NO viaja, y por qué eso es el punto

**Nada calculado.** `packJointDesigns` recorre una **tabla de campos** y no emite nada más, así que
un `capacityKN`, un `utilisation`, un `holesM` o un `checks` que llegara al modelo por un archivo
editado a mano **no puede llegar a una URL**. Capacidades, demandas, contorno de chapa y estaciones
de presilla se recalculan contra el modelo abierto en cada lectura, que es la regla del store desde
I-06 y ahora también la del cable.

**Tampoco viajan los estados de obsolescencia** (`nodeMissing` / `nodeMoved` / `topologyChanged`):
los decide `reconcileJointDesigns` contra el modelo que está abierto, son derivados, y guardarlos
sería guardar una conclusión sobre un modelo que el destinatario no tiene.

**Sí viaja la huella de la que se derivan** — `atMm` y `memberCount` —, porque **eso sí es parte de
la decisión persistida**: registra el nudo que el usuario estaba mirando. Llevarla es lo que
extiende I-07 a la URL: un link abierto sobre otro modelo reporta sus uniones **obsoletas**, con
razón y con remedio, en lugar de emparejarlas por id de nudo y presentar como elegido algo que
nadie eligió para ese modelo. Y un payload **sin** huella reconcilia como `nodeMoved`: nunca como
coincidencia.

## 7.3 · Qué se rechaza, y qué cuesta

Claves conocidas con el tipo equivocado, una entrada que no es una tupla bien formada, o una
versión de contenedor que este build no lee → `unpackJointDesigns` **lanza**, `decompressV2`
devuelve `null`, y el link entero queda inválido.

**Claves desconocidas se ignoran.** Es lo que permite que un campo agregado más adelante como clave
opcional no haga que el build de hoy rechace el link de mañana.

**La limitación, dicha:** un payload de uniones adulterado le cuesta al destinatario **el link
completo**, no sólo las uniones. Es deliberado — los bytes del modelo y los de las uniones vienen
en un solo stream deflate, y tratar la mitad como confiable es la posición más débil— pero tiene un
costo real: por la ruta `#data=`, `loadFromURLHash` devuelve `null` y la app abre vacía, sin decir
por qué. Por la ruta «Pegar enlace», `loadFromShareLink` devuelve `false` y esa superficie sí lo
reporta. **Mejorar el estado de la ruta del hash es trabajo de quien sea dueño de esa carga**, no de
este cambio: es el mismo silencio que ya tiene hoy cualquier link corrupto.

## 7.4 · Presupuesto de longitud

`MAX_URL_SAFE` (2000 caracteres) es un límite que `ToolbarProject` chequea de verdad, así que el
costo se **midió** en lugar de suponerse. El test lo fija: una nave con **veinte** nudos diseñados
—bulones, chapa y soldadura en cada uno— cuesta menos de un presupuesto declarado por nudo, y el
link completo queda bajo `MAX_URL_SAFE`. Las claves se repiten idénticas entre nudos, que es
exactamente lo que deflate comprime bien.

## 7.5 · La guarda contra la deriva

Es la pieza que §6 de este documento pedía y que no existía: **así llegaron a ser cuatro los campos
de sección perdidos**.

Dos mitades, y hay que pasar las dos:

1. **El tipo.** Los fixtures del test son `Required<BoltLayoutChoice>`, `Required<WeldInput>` y sus
   pares. Agregar un campo a `JointChoices` **deja de compilar** hasta que el fixture lo liste.
2. **El test.** Compara las claves del fixture contra la tabla de campos del codec. Un campo que
   está en el tipo y no está en la tabla **falla**, en lugar de dejar de viajar en silencio.

Y las listas de valores permitidos (`ThreadCondition`, `EdgeFinish`, `Exposure`, `WeldProcess`,
`WeldLoading`) se construyen desde un `Record<Union, 1>`, así que agregar un miembro a una de esas
uniones tampoco compila hasta que el cable lo acepte. `BOLT_GRADES` y `BUILT_UP_ARRANGEMENTS` se
**importan**: Tabla J.3.2 y las siete disposiciones tienen una lista cada una, en un archivo cada
una.

## 7.6 · Archivos

| Archivo | Qué cambió |
|---|---|
| `lib/connection/joint-share.ts` | **nuevo** — el codec, puro, sin stores. Puro a propósito: `url-sharing.ts` importa cuatro stores, y por eso `url-sharing.test.ts` prueba una **copia inline** de su codificador. Un formato de cable probado por un duplicado es un formato sin test. |
| `lib/connection/__tests__/joint-share.test.ts` | **nuevo** — el codec, contra el código que corre |
| `lib/utils/__tests__/joint-share-url.test.ts` | **nuevo** — la vuelta completa por `compressSnapshot`/`decompressSnapshot`, el link viejo, la compatibilidad M1/M2 y el presupuesto |
| `lib/utils/url-sharing.ts` | `SHARE_VERSION` 4 → 5; `toCompact` emite `jd`; `fromCompact` lo lee |

Ningún archivo de la lista de no-editar-en-paralelo está involucrado. `FeedbackWidget` y
`exercise-source` no cambian y se benefician solos: el link que un reporte adjunta ahora lleva las
uniones de las que habla el reporte.
