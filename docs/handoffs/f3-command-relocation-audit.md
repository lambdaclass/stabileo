# Los comandos del pipeline y la etapa a la que pertenecen — auditoría previa

**Estado: auditoría. Ningún comando movido por este documento.**

Es el paso que la instrucción de F3 pide antes de editar: *"auditá todos los consumidores, testids
y accesos; identificá qué acciones necesitan estar disponibles en más de una etapa; evitá
duplicar comandos o crear dos fuentes de verdad"*.

---

## 1. Dónde están hoy, y por qué es un problema

Los once comandos viven en `DesignToolbar.svelte`, que `ProDesignTab` monta y que F2 metió
**dentro de la etapa Diseñar**. Así que la franja dice cinco etapas y las acciones de las cinco
están en una.

No es un problema estético y ya se manifestó: navegar a **Detalle** por la franja **cierra la
etapa Diseñar**, que es la que contiene `cmd-generate-detailing` — el comando que Detalle
necesita. La spec de F3a tuvo que abrir el disclosure directamente para esquivarlo.

| grupo actual | comandos | etapa a la que pertenece |
|---|---|---|
| `cmd-group-verify` | `cmd-compute-demands` | **Reglamentos** — las solicitaciones salen del cálculo, y §1 exige separarlas del diseño |
| | `cmd-code-check` | **Diseñar** — verificar armaduras es lo que *termina* la etapa, no un paso previo |
| `cmd-group-design` | `cmd-autodesign`, `cmd-autodesign-menu`, `cmd-autodesign-undesigned` | **Diseñar** ✅ ya está |
| | `cmd-design-all`, `cmd-design-scope` | **Diseñar** ✅ ya está |
| `cmd-group-detailing` | `cmd-generate-detailing` | **Detalle** |
| | `cmd-open-3d` (+ `-count`, `-error`) | **varias** — ver §3 |
| | `cmd-cancel` | **Diseñar** — cancela `designRunStore` |

`cmd-code-check` es el que más cambia de sentido al mudarse: hoy está en el grupo *Verificar*,
antes del grupo *Diseñar*, y eso repite en la barra de comandos exactamente la afirmación que F1
sacó de la franja — verificación antes de que exista armadura.

---

## 2. Radio de impacto, medido

| comando | refs en E2E | specs |
|---|---:|---:|
| `cmd-generate-detailing` | **47** | **28** |
| `cmd-design-all` | 22 | 8 |
| `cmd-open-3d` | 14 | 5 |
| `cmd-code-check` | 5 | 5 |
| `cmd-compute-demands` | 5 | 4 |
| `cmd-autodesign` | 4 | 2 |
| `cmd-cancel` | **0** | **0** |

Dos lecturas que importan:

- **`cmd-generate-detailing` es el más caro de mover y el que más lo necesita.** 28 specs lo
  tocan, y es justamente el comando cuya etapa no lo contiene. Mover el botón sin mover el testid
  no rompe nada: lo que cambia es **de qué disclosure cuelga**, y las specs que abren Diseñar
  antes de buscarlo seguirán encontrándolo sólo si Detalle está abierta. Hay que revisarlas una
  por una, no en lote.
- **`cmd-cancel` no tiene un solo test.** Cancela una corrida de diseño y nadie lo ejercita. Es
  un hallazgo aparte de esta reubicación y vale anotarlo.

---

## 3. Lo que sí tiene que estar en más de una etapa

**Abrir el visor 3-D**, y ya está resuelto correctamente. Cuatro entradas —`DesignOverview`,
`DesignToolbar`, `DocumentsSection` y `ProRibbon`— y **una sola función**: `openRebar3D` en
`lib/store/rebar-open.ts`. Los propios comentarios del árbol lo dicen: *"All of them call
`openRebar3D`, so the cage on screen is a projection of one document instance — three ways in,
one thing that happens. A fourth viewer is exactly what this must not be."*

Eso es el patrón a repetir para cualquier otro comando que necesite dos puntos de acceso: **una
función compartida, varios botones**, nunca dos implementaciones. No es duplicar un comando; es
una operación con varias puertas.

Ningún otro comando de la lista necesita más de una etapa.

---

## 4. El obstáculo real, y por qué no lo moví en este bloque

Los handlers **no son propiedades sueltas**. `ProDesignTab` los envuelve:

```ts
onComputeDemands={() => { diagnosticsWarning.arm(); designRunStore.computeDemands(); }}
onCodeCheck={()      => { diagnosticsWarning.arm(); designRunStore.runCodeCheck(); }}
```

`diagnosticsWarning` es estado local de `ProDesignTab`. Un botón mudado a la etapa Reglamentos que
llamara sólo a `designRunStore.computeDemands()` **perdería el armado del aviso de diagnósticos**
— un cambio de comportamiento silencioso, del tipo que esta rama viene evitando.

Y `generateDetailing` y `open3d` no son props en absoluto: son funciones internas de
`DesignToolbar`, con su lógica de prerrequisitos (`detailing-prerequisites`, `detailing-auto`)
alrededor.

**Entonces la reubicación no es mover markup: es extraer las acciones a un lugar que las cinco
etapas puedan alcanzar.** El orden correcto es:

1. **Extraer las acciones** a un módulo de comandos —`lib/flow/rc-commands.ts` o un store fino—
   que envuelva `diagnosticsWarning`, los prerrequisitos y las llamadas al store. Sin mover
   ningún botón todavía. Verificable con la suite actual completa: nada debe cambiar en pantalla.
2. **Mudar `cmd-compute-demands`** a Reglamentos. Es el más barato (5 refs / 4 specs) y el de
   semántica más clara.
3. **Mudar `cmd-code-check`** a Diseñar, junto al comando de diseño. Cierra en la barra la misma
   afirmación que F1 cerró en la franja.
4. **Mudar `cmd-generate-detailing`** a Detalle. El caro: 28 specs, una por una.
5. **Retirar los tres `cmd-group-*`** cuando queden vacíos o con un solo comando; el agrupador
   dejó de tener sentido cuando cada etapa contiene lo suyo.

Cada paso es un commit y cada uno corre la lista de gates completa.

---

## 5. Lo que no hay que hacer

- **No dejar el mismo comando en dos etapas** "por compatibilidad". Un comando en dos lugares es
  dos fuentes de verdad sobre qué está permitido, y es lo que ya pasó con `cmd-design-all` y
  `cmd-design-families` en F2.
- **No dejar la barra completa donde está y agregar atajos** en las otras etapas: mismo problema.
- **No mover el testid junto con el botón.** Los testids son el contrato con 28 specs; lo que se
  muda es de qué disclosure cuelgan.
- **No borrar specs para evitar migrarlas.** `cmd-cancel` ya demuestra qué pasa cuando un comando
  no tiene ninguna.
