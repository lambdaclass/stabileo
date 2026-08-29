# El codec de share pierde campos de sección — handoff para H1 e integración común

**Estado:** **no implementado**, a propósito. Esto es un pedido de decisión, no un parche.
**Qué propone:** un solo `SHARE_VERSION = 5` que agregue `composition`, `profileFamily`, `tl` y
`built` **como claves opcionales del objeto existente — nunca como posiciones nuevas obligatorias**
(§3 y §4).
**Origen:** `feat/pro-steel-m1`. Detectado al probar el contrato `built` (`ae3a6186`); ampliado al
abrir el bloque C/Z de M2.

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

`SHARE_VERSION = 4` hoy (`url-sharing.ts:15`), y `decompressSnapshot` ya hace detección: prefijo
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

**Un solo incremento: `SHARE_VERSION = 5`.**

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
