# `grade-family.ts` en M1 y en H1 — verificación de equivalencia

**Verificado el 2026-08-20** desde `feat/pro-steel-m1@e417d025`, contra
`origin/feat/pro-concrete-h1@23ce3e34`.
**Resultado: los tres archivos son idénticos byte a byte.** No hay nada que consolidar hoy y no
hay divergencia que reconciliar. La consolidación física queda para una integración posterior.

**M1 no hizo cherry-pick, no integró H1 y no duplicó el módulo.** Esta verificación es de sólo
lectura: `git show`, `diff` y una prueba de merge que no escribe nada.

---

## 1. Las tres copias

| Ref | Digest SHA-256 del archivo (16 hex) |
|---|---|
| `feat/pro-steel-m1` | `f9ccb531308b14d2` |
| `contract/grade-family` | `f9ccb531308b14d2` |
| `origin/feat/pro-concrete-h1` | `f9ccb531308b14d2` |

```sh
diff <(git show feat/pro-steel-m1:web/src/lib/engine/steel/grade-family.ts) \
     <(git show origin/feat/pro-concrete-h1:web/src/lib/engine/steel/grade-family.ts)
# sin salida
```

86 líneas, sin una diferencia: ni de contenido, ni de comentarios, ni de espacios en blanco.

## 2. Cómo llegó a H1

**Independientemente, no por la rama de contrato.**

```sh
git merge-base --is-ancestor 168320b0 origin/feat/pro-concrete-h1   # → falso
git log --diff-filter=A origin/feat/pro-concrete-h1 -- …/grade-family.ts
# 23ce3e34 fix(design): timber C24 was entering the concrete pipeline as 24 MPa concrete
```

El archivo entró a H1 dentro de su propio commit `23ce3e34`, el que arregla la clasificación de la
madera. Su mensaje lo dice explícitamente: tomó el módulo «tal cual en vez de reimplementarlo,
porque dos funciones contestando "de qué familia es este grado" terminarían siendo dos
respuestas», y aclara que las dos copias son «versiones independientes que git fusiona sin
marcar».

Eso significa que `contract/grade-family@168320b0` **ya no es necesaria como vehículo de
entrega**. Queda publicada porque documenta el contrato con su test autocontenido, y borrarla es
una decisión de la integración, no de M1.

## 3. La fusión futura, medida

```sh
git merge-tree --write-tree --name-only feat/pro-steel-m1 origin/feat/pro-concrete-h1
# exit 0, un solo OID de árbol y ninguna ruta en conflicto
```

**Cero conflictos.** Git resuelve un «agregado en las dos ramas» sin marcarlo cuando el contenido
coincide exactamente, que es el caso. La consolidación física no es un trabajo pendiente con
riesgo: es un no-evento.

Una prueba de merge no es una integración: `--write-tree` escribe un árbol en la base de objetos y
no toca ninguna rama, ningún índice y ningún archivo del worktree.

## 4. Los tests: dos archivos, ángulos distintos, cero duplicación

H1 **no** trajo ninguno de los tests de M1, y escribió el suyo. Es la decisión correcta y su
commit la explica. Lo que cubre cada uno:

| | M1 | H1 |
|---|---|---|
| Archivo | `steel/__tests__/grade-family.test.ts` (12) y `grade-family-contract.test.ts` en la rama de contrato (12) | `design/__tests__/declared-grade-classification.test.ts` (17) |
| El lookup contesta para **todo** el catálogo | sí, recorriendo `ALL_GRADES`, `CONCRETE`, `TIMBER` | por familia, un caso representativo cada una |
| `null` para un id desconocido | sí | sí |
| No normaliza la entrada (espacios, mayúsculas) | sí | no |
| Fallback sin `gradeId` | sí, en todo el rango de resistencias | sí, un caso |
| Consecuencias sobre el **inventario metálico** | sí — aviso, `nonFerrousOnly`, warning que desaparece | no (no es su superficie) |
| Consecuencias sobre el **pipeline de hormigón** | no (no es su superficie) | sí — admite/rechaza, y el defecto de la madera fijado |
| El límite entre las dos superficies | no | sí — «madera y mampostería no pertenecen a ninguno» |

Se complementan. Cuando las ramas se integren van a convivir sin que ninguna aserción sea
redundante, y el módulo queda cubierto desde los dos lados que lo consumen.

## 5. Diferencias reales encontradas

**Ninguna en el módulo.** Tres observaciones que no son diferencias del contrato:

1. **H1 modificó `member-context.ts`** (11 líneas) y `design-run.svelte.ts` (33), que es
   exactamente lo que el §7 del contrato proponía y asignaba a H1. M1 no tocó ninguno de los dos,
   ni antes ni ahora.
2. **El caso que H1 arregló es el que M1 midió.** Su commit y
   `m1-grade-family-contract.md` §8 describen el mismo hecho —toda clase EN 338 entraba al
   pipeline de hormigón— y llegaron por caminos distintos: M1 inyectando el lookup en su propia
   llamada para no tocar nada compartido, H1 cableando el sitio de llamada real.
3. **`ContextModelData.materials` sigue sin declarar `gradeId`** en el tipo. H1 confirma en su
   mensaje que el campo «llegaba siempre» porque se le pasa el `modelStore.materials` vivo, así
   que funciona; la interfaz sigue sin nombrarlo. Es la observación 1 del §10 del contrato y sigue
   abierta. **No es de M1** y no se toca desde acá.

## 6. Qué queda para la integración

- **Decidir si `contract/grade-family` se borra.** Su commit no es ancestro de ninguna de las dos
  ramas y su contenido ya está en las dos. Antes de borrarla: la política del repositorio exige
  probar que el trabajo existe en otro lado — y existe, con el mismo digest, en las dos ramas.
- **Conservar los dos archivos de test.** No se pisan y cubren lados distintos.
- **`ContextModelData.materials` y `gradeId`**, si alguien quiere cerrar la observación.
- Nada más. No hay deuda de consolidación en este módulo.
