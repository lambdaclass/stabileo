# Parche preparado — `conn.gap.aluminium.scope`

**Estado: NO APLICADO.** H1 está agregando claves en los mismos tres archivos
(`design.floor.state.*`), así que este parche espera a que su commit de i18n cierre o a una
integración coordinada.

**Dueño funcional:** M1 · **Archivos:** compartidos · **Tamaño:** una clave, tres archivos, una
línea cada uno · **Punto 3** de `m1-h1-coordination.md`.

---

## 1. Qué dice hoy y por qué está mal

La tercera de las cinco limitaciones declaradas del panel de Uniones metálicas afirma que el
inventario metálico **sí** lista los miembros de aluminio. Dejó de ser cierto en el commit
`6d274e37` de M1: al conectar el catálogo de grados, `materialFamilyOf` distingue aluminio de
acero, el inventario admite filas por `isSteel` y por lo tanto **tampoco** los lista — los nombra
en un aviso (`steel.notice.nonFerrousNotCovered`) y, si son el único metal del modelo, informa
`nonFerrousOnly`.

La frase no es peligrosa: sigue advirtiendo sobre el aluminio y sigue diciendo que las tablas de
bulones y electrodos son de acero, que es la mitad que protege al usuario. Pero describe un
comportamiento que la app ya no tiene, y lo hace en el único bloque cuyo valor es que se le pueda
creer.

**La causó M1.** No es deuda heredada.

## 2. Ubicación

Buscar **por clave**, no por número de línea: en `pt.ts` está en otra zona del archivo, y H1 está
insertando claves, así que cualquier número que escriba acá caduca.

| Archivo | Línea al 2026-08-20 | Clave |
|---|---|---|
| `web/src/lib/i18n/locales/es.ts` | 4341 | `'conn.gap.aluminium.scope'` |
| `web/src/lib/i18n/locales/en.ts` | 4348 | `'conn.gap.aluminium.scope'` |
| `web/src/lib/i18n/locales/pt.ts` | **3535** | `'conn.gap.aluminium.scope'` |

## 3. El parche

Reemplazo de valor. La clave, su posición y las cuatro claves hermanas de la misma limitación no
se tocan.

### Español — `locales/es.ts`

```diff
-  'conn.gap.aluminium.scope': 'Modelos con miembros de aluminio: sus nudos pueden quedar fuera de esta lista aunque el inventario metálico sí los liste.',
+  'conn.gap.aluminium.scope': 'Modelos con miembros de aluminio: sus nudos quedan fuera de esta lista, y el inventario metálico tampoco los lista — los nombra en un aviso, porque las tablas de bulones y electrodos son de acero.',
```

### English — `locales/en.ts`

```diff
-  'conn.gap.aluminium.scope': 'Models with aluminium members: their joints can fall outside this list even though the metallic inventory does list them.',
+  'conn.gap.aluminium.scope': 'Models with aluminium members: their joints fall outside this list, and the metallic inventory does not list them either — it names them in a notice, because the bolt and electrode tables are steel’s.',
```

### Português — `locales/pt.ts`

```diff
-  'conn.gap.aluminium.scope': 'Modelos com membros de alumínio: seus nós podem ficar fora desta lista mesmo que o inventário metálico os liste.',
+  'conn.gap.aluminium.scope': 'Modelos com membros de alumínio: seus nós ficam fora desta lista, e o inventário metálico também não os lista — ele os nomeia em um aviso, porque as tabelas de parafusos e eletrodos são de aço.',
```

### Lo que NO cambia

`conn.gap.aluminium.missing` se queda como está. Dice que `materialFamilyOf` no distingue
aluminio de acero por magnitud de `fy` «hasta que el material declare su grado», y eso sigue
siendo literalmente cierto: sin grado declarado, la inferencia sigue sin distinguirlos. Cambiarla
sería sobre-corregir.

## 4. Impacto

**Sobre H1: ninguno semántico.** Es un texto de un panel metálico. H1 no lo lee y nada suyo
depende de él.

**Sobre H1: de merge, y ahí está el motivo de la espera.** Son los tres archivos con más manos
encima del repositorio y H1 está insertando `design.floor.state.*` en ellos ahora mismo. Aplicar
esto en paralelo produce un conflicto de una línea por archivo — trivial de resolver y
completamente evitable esperando.

**Sobre M1: ninguno funcional.** Ningún test de M1 depende del texto viejo; el gate que M1 agregó
verifica que las cinco limitaciones tengan sus cinco facetas en los tres idiomas, y un reemplazo
de valor lo mantiene verde por construcción.

**Sobre el usuario, mientras no se aplique:** una frase de la declaración de limitaciones dice
algo falso en la mitad que habla del inventario. Es el único de los cuatro puntos de coordinación
con vencimiento real.

## 5. Tests

Preparados y **activos** en
`web/src/lib/engine/steel/__tests__/conn-aluminium-scope.test.ts`:

1. **El comportamiento que vuelve falsa la frase** — un modelo cuyo único metal es aluminio no
   lista miembros, informa `nonFerrousOnly` y emite `steel.notice.nonFerrousNotCovered`. Pasa hoy
   y es lo que hace necesario el parche.
2. **El texto propuesto cumple lo que tiene que cumplir** — está en los tres idiomas, menciona el
   aviso, no afirma que el inventario los liste, conserva la advertencia sobre las tablas de
   acero, y sobrevive la regla de `steel-never-verified` (ninguna palabra de aprobación fuera de
   una negación). Se verifica contra el texto de este documento, sin leer los archivos
   compartidos.
3. **El estado actual, declarado como tal** — el diccionario embarcado todavía trae la frase
   vieja. Es la aserción que hay que **invertir** al aplicar el parche, y está marcada en el
   archivo con el comentario que lo dice.

Al aplicar el parche: invertir el test 3 (pasa a exigir el texto nuevo). Los tests 1 y 2 quedan
igual. Un solo lugar para tocar, señalado en el propio archivo.

## 6. Alternativa que se descartó

Sombrear la clave desde `locales/steel/*.ts`. Funciona —la fusión en `store.svelte.ts` es
`{ ...es, ...steelEs }`, así que el namespace de acero gana— y está descartada: si H1 editara la
clave principal, su cambio desaparecería sin rastro y sin error. Es exactamente el cambio
silencioso sobre la otra rama que el protocolo prohíbe.

## 7. Cómo aplicarlo

1. Confirmar que el commit de i18n de H1 cerró (`git log --oneline -- web/src/lib/i18n/locales/es.ts`).
2. Buscar la clave por nombre en los tres archivos, no por línea.
3. Reemplazar los tres valores por los del §3.
4. Invertir el test 3 de `conn-aluminium-scope.test.ts`.
5. Correr `npx vitest run --project unit src/lib/i18n src/lib/engine/steel` — la paridad de claves
   y la regla de no-aprobación cubren el resto.
