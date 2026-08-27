# Huecos de traducción, y por qué los gates no los ven

**Origen:** H1-C (`feat/pro-concrete-h1`, [PR #161](https://github.com/lambdaclass/stabileo/pull/161)).
**Estado: reporte. Nada cambiado por este documento.**
Encontrado de rebote: un cambio de H1 puso en pantalla un mensaje que en portugués no existía.

Esto **no** es parte de H1-C. Lo separo justamente para que no se convierta en su alcance
accidental.

---

## 1. Cómo apareció

`DocumentsSection` ahora dice los motivos de rechazo de una revisión **antes** del click. El
tripwire de idioma del spec falló:

    pt · review-blockers → "The reviewing engineer must be named. There are provisional…"

Las cinco claves `detailing.review.*` existían en `en` y `es`. En `pt` había **una de cinco**. Un
usuario en portugués era rechazado en inglés.

Las cuatro se agregaron en el commit de H1-C, porque ese cambio es el que las pone en pantalla en
un archivo que H1 posee. **El resto no se tocó.**

---

## 2. Alcance

14 diccionarios en `src/lib/i18n/locales/`: `ar de en es fr hi id it ja ko pt ru tr zh`.

Tomando como base las claves que **`en` y `es` tienen las dos** (3 197 + las propias de cada uno):

| diccionario | claves faltantes | claves que tiene |
|---|---:|---:|
| **`pt`** | **1 172** | — |
| `de` | 2 565 | 3 202 |
| `ar` `fr` `hi` `id` `it` `ja` `ko` `ru` `tr` `zh` | 2 570 cada uno | 3 197 cada uno |

`pt` es el caso que importa **porque es uno de los tres idiomas ofrecidos**. Los otros once están
esencialmente sin traducir más allá de un núcleo común, lo cual es coherente con que no se
ofrezcan — pero conviene que sea una decisión escrita y no un hallazgo.

### `pt`, por namespace

| namespace | faltantes | | namespace | faltantes |
|---|---:|---|---|---:|
| `landing.` | 317 | | `ribbon.` | 26 |
| `cad.` | 254 | | `ex.` | 18 |
| `detailing.` | 154 | | `geotechnical.` | 14 |
| `footing.` | 99 | | `perf.` | 14 |
| `loads.` | 90 | | `ai.` | 10 |
| `report.` | 52 | | `cat.` `loadPlan.` `regulations.` | 7 c/u |
| `codes.` | 48 | | `autoLoad.` | 5 |
| `pro.` | 33 | | resto (`kin` `maturity` `advHelp` `edu` `slab` `wall` `proProject` `proRibbon`) | 16 |

**`landing.` + `cad.` son la mitad** (571 de 1 172). Los tres namespaces que un ingeniero ve
trabajando —`detailing.`, `footing.`, `loads.`— suman **343**.

---

## 3. Por qué ningún gate lo detecta

Dos causas, las dos mecánicas y las dos de una línea.

### 3.1 `locale-parity` sólo vigila `design.`

`web/src/lib/i18n/__tests__/locale-parity.test.ts:63`

```ts
.filter((k) => k.startsWith('design.'))
```

El test **sí** compara los 14 diccionarios, y por eso `design.*` está completo en todos —cuando
agregué 31 claves de `design.` en un bloque anterior, este gate me obligó a ponerlas en los 14—.
Todo lo demás está fuera de su alcance. `detailing.`, `footing.`, `loads.`, `report.`, `codes.`
nunca se compararon.

### 3.2 `pro-flow-coverage` no escanea los stores

`web/src/lib/i18n/__tests__/pro-flow-coverage.test.ts:50`

Escanea componentes y `lib/engine/detailing`. Las claves de esta familia las emite el **store**, y
el store lo dice de sí mismo:

> *"The store is the locale boundary, so the engine's refusal is translated HERE. It used to
> arrive as a Spanish sentence built inside a pure module, which told an English-locale user why
> their review was refused in the wrong language."*

Es decir: mover la traducción al store fue **correcto** —arregló un defecto real— y dejó las
claves en una capa que el gate no mira. El arreglo de un problema creó el punto ciego del otro.

---

## 4. Propuesta

### Paso 1 — medir con el gate antes de traducir nada

Ampliar `locale-parity` con un **mapa de namespaces vigilados**, no con un salto a "todos". Un
`.filter()` que abarque todo va a fallar con 2 570 entradas por diccionario y no se va a poder
leer.

```ts
// Vigilados en los 14 diccionarios: lo que un ingeniero ve trabajando.
const GUARDED = ['design.', 'detailing.', 'footing.', 'loads.', 'codes.'];
// Vigilados sólo en los idiomas OFRECIDOS: el resto de la app.
const OFFERED_ONLY = ['report.', 'cad.', 'pro.', 'ribbon.', 'regulations.'];
// Explícitamente fuera: `landing.` tiene su propio ciclo de traducción.
```

Ese recorte convierte 1 172 en dos números manejables y hace que la lista sea una decisión escrita
en vez de un `startsWith` heredado.

### Paso 2 — agregar `lib/store` al escaneo de `pro-flow-coverage`

Una línea en la lista de `:50`. Va a fallar la primera vez, y lo que encuentre es exactamente la
clase de hueco que este documento describe: claves que un componente muestra y que se emiten una
capa más abajo.

### Paso 3 — traducir por namespace, con el gate ya puesto

En orden de lo que un usuario en portugués ve primero:

1. `detailing.` 154 · `footing.` 99 · `loads.` 90 — la superficie de trabajo. **343.**
2. `codes.` 48 · `report.` 52 · `pro.` 33 · `ribbon.` 26 — chrome y salidas. **159.**
3. `cad.` 254 — un bloque propio; es vocabulario de dibujo y merece revisión de un CAD.
4. `landing.` 317 — ciclo de marketing, no de producto.

### Paso 4 — decidir los once no ofrecidos

`ar de fr hi id it ja ko ru tr zh` están a ~2 570 claves cada uno. Las opciones son declararlos
explícitamente como no soportados —y que el gate no los mire— o sacarlos del repo hasta que haya
un plan. Hoy son 11 archivos que parecen soporte y no lo son.

---

## 5. Archivos compartidos

| Archivo | Dueño |
|---|---|
| `lib/i18n/__tests__/locale-parity.test.ts:63` | **Compartido.** Ampliar el filtro afecta a H1, M1, `edu` y la landing a la vez. |
| `lib/i18n/__tests__/pro-flow-coverage.test.ts:50` | **Compartido.** |
| `lib/i18n/locales/*.ts` | Proyecto. H1 agregó 4 claves de `detailing.review.*` y 4 de `detailing.doc.contents.*`, en `en`/`es`/`pt`. |

Ninguno de los cuatro pasos es de H1 por su cuenta. El paso 1 y el 2 hay que hacerlos **antes**
del 3, o la traducción avanza sin nada que la mida.
