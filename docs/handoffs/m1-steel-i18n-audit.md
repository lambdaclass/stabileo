# Auditoría de idiomas del namespace metálico

**Desde:** `feat/pro-steel-m1@135e3a3d`. **Sólo lectura sobre archivos compartidos.**
**Conclusión corta:** el namespace metálico está **completo en los tres idiomas que la app
ofrece** (314/314/314). Los otros once diccionarios **no son alcanzables por ningún camino de
usuario**, así que traducirlos hoy no cambia nada que alguien pueda ver — y el trabajo que sí
sirve es el inventario de terminología del §6, que vale para cualquier idioma que se ofrezca
después.

**No se publicó ningún texto nuevo.** El pedido decía frenar antes de publicar texto dudoso, y
el §6 es la lista de decisiones que hay que tomar antes.

---

## 1. Tres correcciones a la premisa

El pedido habla de «las 12 lenguas que todavía caen a inglés». Medido:

### 1.1 Son once, no doce

La app embarca **catorce** diccionarios. Tres se ofrecen (`es`, `en`, `pt`) y once no:
`de`, `fr`, `it`, `tr`, `hi`, `ja`, `ko`, `ru`, `zh`, `ar`, `id`.

### 1.2 Ninguno de los once es alcanzable

No es que caigan a inglés: **no se pueden elegir**. Tres barreras independientes, todas en
`lib/i18n/store.svelte.ts`:

```ts
export const OFFERED_LOCALES = ['es', 'en', 'pt'] as const;          // :73

function detectBrowserLocale(): OfferedLocale { … }                  // :88
//   devuelve un OfferedLocale por tipo; cualquier otro código → 'en'

function getInitialLocale(): string {                                // :98
//   un locale guardado que ya no se ofrece NO se honra: cae a detección
}
```

El comentario de `getInitialLocale` dice por qué, y es la parte importante:

> Un locale guardado que ya no se ofrece — alguien que eligió alemán antes de que esto se
> angostara — cae a detección en vez de ser honrado, lo que **resucitaría exactamente el estado
> a medio traducir que esto existe para eliminar**.

O sea: la app **decidió** angostarse a tres idiomas, y lo hizo para no mostrar mitades. Forzar
`localStorage['stabileo-lang'] = 'de'` no da alemán; cae a detección y de ahí a inglés.

**Consecuencia para este bloque:** traducir el namespace metálico a los once no produce ningún
cambio visible. La pregunta real no es «¿traducimos?» sino «¿qué idioma se ofrece después?», y esa
es una decisión de producto que M1 no toma.

### 1.3 Los once no están vacíos — y eso es peor

Cada uno ya trae **22 claves** de la familia metálica, todas `conn.*`:

```
conn.joints        conn.noJoints      conn.elementsShort  conn.support
conn.forcesAt      conn.noResults     conn.boltCheck      conn.weldCheck
conn.grade         conn.shearPlanes   conn.threadsInShear conn.autoFill
conn.verify        conn.shear         conn.tension        conn.bearing
conn.interaction   conn.governing     conn.throat         conn.capacity
conn.sizeRange     conn.utilization
```

Son etiquetas de control y de resultado del panel de uniones — ninguna es una limitación ni una
advertencia. Ninguna colisiona con el namespace `steel/*` (verificado: intersección vacía).

Así que ofrecer un cuarto idioma **no es «traducir 314 claves»**: es traducir 292 y **reconciliar
22 que ya existen**, escritas en otro momento y con otro criterio. Un hipotético usuario alemán
vería hoy 22 cadenas en alemán entre 292 en inglés, dentro del mismo panel.

## 2. Cómo cae el fallback, exactamente

```ts
export function tAt(key: string, locale: string): string {
  const dict = dicts[locale] ?? dicts.en;
  return (dict as any)[key] ?? (dicts.en as any)[key] ?? key;
}
```

Dos escalones y un piso:

1. el diccionario del locale;
2. el inglés — que **sí** tiene el namespace metálico fusionado (`en: { ...en, ...steelEn }`);
3. la clave cruda, como último recurso.

Para el namespace metálico el escalón 3 es inalcanzable en cualquiera de los catorce locales,
porque el inglés está completo. **Ningún idioma embarcado puede mostrar una clave cruda del
namespace metálico**, y eso ahora está fijado por test sobre texto renderizado (§5).

## 3. Las 314 claves, clasificadas

Clasificadas por lo que hacen, que es lo que decide el orden de traducción:

| Categoría | Claves | Qué pasa si se lee en un idioma que no es el del usuario |
|---|---:|---|
| Etiqueta | 197 | Molestia. Un `Wy` o un `Área` en inglés se entiende igual |
| **Advertencia / no disponible** | **64** | **Riesgo.** «No disponible: no se conoce el centroide» es la razón por la que un número falta |
| **Hipótesis del modelo** | **24** | **Riesgo.** Viajan con el modelo a informes y planos |
| Ayuda / descripción | 21 | Molestia |
| **Estado metálico** | **8** | **Riesgo.** Los cuatro estados con su `.desc` cada uno; la descripción es donde se explica «nadie lo intentó» frente a «se calculó sin autoridad» |
| **Total** | **314** | |

**El conjunto prioritario son 96 claves** — advertencias, hipótesis y estados. Son las que afectan
la interpretación de un resultado, y son las que hay que traducir primero si algún día se ofrece un
cuarto idioma. Las 197 etiquetas pueden esperar.

Los números salen del mismo categorizador que usa el test (`steel-locale-coverage.test.ts`), no de
un conteo a mano: un primer borrador de este documento dijo 193/66/30/4 porque contaba con una
regex más laxa que también atrapaba claves con `.assume` en el medio. Los de arriba son los
exactos, y si la clasificación cambia, el test falla antes que el documento envejezca.

Las cinco limitaciones de Uniones metálicas (`conn.gap.*`, 25 claves con sus cuatro facetas) viven
en los diccionarios principales y no en el namespace `steel/*`, así que se cuentan aparte: están
completas en los tres idiomas ofrecidos (77 claves `conn.*`, 77/77/77) y **no** están en los once.

## 4. Estado de paridad, medido

| | es | en | pt |
|---|---:|---:|---:|
| `locales/steel/*` | 314 | 314 | 314 |
| `conn.*` en los diccionarios principales | 77 | 77 | 77 |

Sin faltantes en ninguna dirección. La puerta que lo sostiene es
`steel-keys.test.ts`, que compara los tres conjuntos de claves y expande desde las uniones de
tipos las claves que se arman por plantilla.

Los diccionarios principales tienen un hueco propio y **preexistente**: `pt` está 1176 claves por
detrás de `es`, y `en` una. No es de M1 —idéntico en `08917b9f`— y no es del namespace metálico.

## 5. Lo que quedó fijado por test

`e2e/m1-steel-i18n-fallback.spec.ts` y `steel-keys.test.ts`, sobre **texto renderizado** donde
corresponde:

1. **Ningún idioma ofrecido muestra una clave cruda** en ninguna superficie metálica — ya cubierto
   por `m1-states-and-languages.spec.ts` y extendido acá al selector de grados y a la ficha de
   perfil.
2. **Un locale no ofrecido no se puede forzar.** Poniendo `stabileo-lang = 'de'` con la marca
   manual, la app arranca en un idioma ofrecido y las superficies metálicas se leen en inglés, no
   en una mezcla. Es el test que evita que el estado a medio traducir vuelva por la puerta de
   atrás.
3. **Las 96 claves prioritarias existen en los tres**, expandidas por categoría y no listadas a
   mano, así que una advertencia nueva sin traducir falla. El test también atrapa el caso
   inverso: un valor idéntico entre español e inglés, que casi siempre es un pegado. Encontró una
   excepción legítima —`steel.status.EXPERIMENTAL` es «Experimental» en los tres idiomas, cognado y
   no copia— y quedó como exención nombrada, no como regla relajada.

## 6. Lo que hace falta decidir antes de traducir — inventario de terminología

Ver `m1-steel-terminology.md`. Resumen: de los términos que aparecen en las 96 claves
prioritarias, **once** no tienen una traducción única en la literatura técnica y **traducirlos es
una decisión, no una búsqueda**. Publicar una elección sin validación humana en un texto que
explica por qué un número no está disponible es exactamente lo que este documento no hace.

## 7. Superficie compartida que haría falta, y no se tocó

Ofrecer un cuarto idioma requiere **dos cambios en `lib/i18n/store.svelte.ts`**, que es archivo
compartido:

```diff
+import steelDe from './locales/steel/de';
 const dicts: Record<string, Translations> = {
   es: { ...es, ...steelEs },
   en: { ...en, ...steelEn },
   pt: { ...pt, ...steelPt },
-  de, fr, it, tr, hi, ja, ko, ru, zh, ar, id,
+  de: { ...de, ...steelDe },
+  fr, it, tr, hi, ja, ko, ru, zh, ar, id,
 };
-export const OFFERED_LOCALES = ['es', 'en', 'pt'] as const;
+export const OFFERED_LOCALES = ['es', 'en', 'pt', 'de'] as const;
```

**M1 frenó antes de editarlo.** Archivo, líneas y contrato:

- `web/src/lib/i18n/store.svelte.ts:36-41` (el mapa de diccionarios) y `:73` (`OFFERED_LOCALES`).
- Contrato que cambia: `OFFERED_LOCALES` es un tipo del que dependen `isOfferedLocale`,
  `detectBrowserLocale` y el selector de idioma. Agregarle un valor obliga a que **todo** el
  namespace `design.*` —que es de hormigón— esté completo en ese idioma, porque
  `pro-flow-coverage.test.ts` exige que cada clave que una superficie PRO renderiza exista en
  todos los ofrecidos.
- **Impacto sobre H1: alto.** Ofrecer un idioma es un compromiso sobre el diccionario entero, no
  sobre el namespace metálico. La mayor parte del trabajo sería de hormigón.
- **Dueño propuesto: producto, y después una integración común.** No es de M1 ni de H1 por
  separado: es una decisión sobre qué idiomas sostiene el producto, y recién después un trabajo de
  traducción repartido por namespace.

## 8. Recomendación

1. **No traducir los once ahora.** Es trabajo invisible y quedaría sin puerta que lo verifique.
2. **Mantener la paridad de tres** y la puerta que la sostiene, que es lo que hoy garantiza que el
   namespace metálico no se degrade.
3. **Cerrar el inventario de terminología del §6** cuando haya un ingeniero que valide los once
   términos. Eso es lo que convierte «traducir» en un trabajo mecánico en vez de una serie de
   decisiones.
4. **Si producto elige un cuarto idioma**, el orden es: las 8 claves de estado, las 24 hipótesis,
   las 64 advertencias, las 25 facetas de las limitaciones, y por último las 197 etiquetas y las 21
   de ayuda. Y reconciliar las 22 `conn.*` que ya están escritas.
