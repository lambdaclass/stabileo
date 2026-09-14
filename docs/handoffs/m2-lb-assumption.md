# El supuesto `Lb = L` — dónde debería venir de verdad

**Rama:** `feat/pro-steel-m2`. **No implementado**, y no se reemplaza por una cifra inventada.

---

## 1. Qué pasa hoy

`verification-service.ts` arma los parámetros del verificador y pasa:

```ts
L, Lb: L,
```

O sea: **la barra se supone no arriostrada de punta a punta**. `checkSteelFlexure` toma `Lb` para
decidir si la sección llega al momento plástico o si hay que reducir por pandeo lateral-torsional:

```
Lp = 1.76 · ry · √(E/Fy)      →  si Lb ≤ Lp, Mn = Mp
```

**Para una viga, esto suele decidir el resultado.** Y a diferencia de las otras seis invenciones que
había en ese bloque —espesores, `Fu`, inercias, canto, ancho— **ésta no se puede quitar exigiendo el
dato**, porque el modelo no tiene dónde registrar un arriostramiento.

**Es conservador tomado solo:** `Lb` más grande da capacidad más chica. Por eso se tolera. Pero es
un supuesto que el usuario nunca hizo, y hasta este commit se aplicaba sin decirlo.

**Un detalle que importa:** el verificador **recibe `Lb` como parámetro propio y honesto**. El
supuesto está en el llamador, no en el cálculo. Así que arreglarlo no toca las 769 líneas.

---

## 2. Lo que ya está en el árbol y sirve

`generators/shed.ts` (M1) genera arriostramiento **explícito** y como barras del modelo:
`wallBracing`, `roofBracing`, `trussBracing`, con `bracingBays: 'end' | 'all'`. Eso salió de la
investigación del camino de carga longitudinal de la nave, donde un modelo sin arriostrar daba
2,4·10¹¹ m de desplazamiento.

**Ahí está la respuesta**: un arriostramiento real ya existe en el modelo, como barras. Lo que falta
no es el dato, es **la relación** entre esas barras y las que arriostran.

---

## 3. Cómo debería venir el dato — tres caminos, en orden de honestidad

### 3.1 Derivado de la topología (recomendado)

Un nodo intermedio de una barra donde llega **otra** barra con componente perpendicular al plano de
flexión es un punto de arriostramiento. `Lb` es entonces la distancia máxima entre puntos así.

- **A favor:** no pide ningún dato nuevo. La topología ya está. Y es lo que un proyectista lee del
  dibujo.
- **En contra:** «con componente perpendicular» necesita un criterio numérico, y una barra que llega
  no siempre arriostra —depende de su rigidez y de cómo esté vinculada—. Y una barra modelada como
  una sola pieza de punta a punta **no tiene nodos intermedios**, así que en muchos modelos daría
  `Lb = L` de todos modos, correctamente.
- **Requiere:** un umbral de perpendicularidad y una regla de qué cuenta como arriostramiento
  efectivo. **Es AUTORIDAD, no geometría** — es la provisión que un reglamento define.

### 3.2 Declarado por el usuario, por barra o por familia

Un campo `Lb` opcional en el elemento, o en una familia de elementos.

- **A favor:** explícito, verificable, y quien lo declara es quien puede responder por él.
- **En contra:** un campo más en un modelo que ya tiene muchos, y **nadie lo va a llenar** salvo que
  el flujo lo pida en el momento correcto — que es exactamente lo que la etapa 4 del workflow hace.
- **Requiere:** un campo nuevo en el modelo (`Element` o una familia). **Archivo compartido.**

### 3.3 Del generador, cuando el generador sabe

Una nave generada con `roofBracing: true` sabe dónde puso las riostras. Ese conocimiento hoy se
tira: `emit.ts` emite las barras y no emite la relación.

- **A favor:** el caso más común de estructura metálica en esta app **es** una estructura generada,
  y ahí el dato es exacto y gratis.
- **En contra:** sólo cubre lo generado. Un modelo dibujado a mano queda en 3.1 o 3.2.
- **Requiere:** que la emisión lleve la relación arriostrante → arriostrado. **Aditivo**, y es de M2
  o M3 metálico, sin tocar hormigón.

---

## 4. Recomendación

**Las tres, en este orden, y ninguna sola.**

1. **3.3 primero**, porque es exacto donde más se usa y no necesita ninguna decisión normativa: el
   generador ya sabe.
2. **3.2 después**, como escape para lo dibujado a mano, pedido desde la etapa 4 del workflow en vez
   de como un campo huérfano en una tabla.
3. **3.1 al final o nunca**, porque necesita una regla de arriostramiento efectivo que **está en el
   reglamento** y no en la geometría. Derivarla nosotros sería inventar autoridad — el mismo error
   que las siete invenciones que este bloque acaba de sacar.

**Mientras tanto:** `Lb = L` se queda, **documentado en tres lugares** — el comentario del llamador,
`steel.assume.unbracedLengthIsMemberLength` en el adaptador de capacidades, y la etapa 4 del workflow
metálico, que está **bloqueada** y lo nombra. La etapa 7 lo lista entre sus bloqueos pendientes.

**Lo que no se hace:** reemplazarlo por `L/2`, por `L/n` con `n` los nodos intermedios, ni por
ninguna fracción. Sería cambiar un supuesto declarado y conservador por uno indeclarado y
posiblemente inseguro.
