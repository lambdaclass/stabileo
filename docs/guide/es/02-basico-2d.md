# 2. Modo Básico en 2D

El modo Básico resuelve **estructuras de barras**: vigas, pórticos, reticulados, arcos. En 2D la
estructura vive en un plano vertical, el plano **XZ**: X es horizontal y Z es vertical, hacia
arriba. Cada nodo tiene tres grados de libertad: dos desplazamientos (**ux**, **uz**) y un giro
(**θy**).

Este capítulo recorre la cinta de comandos de izquierda a derecha, que es el orden natural para
armar un modelo.

## Vista

- **Mover** tiene dos modos: *mover la vista* (arrastrar desplaza el dibujo) o *mover nodos*
  (arrastrar reubica un nodo, y las barras lo siguen).
- **Selección** elige qué toma un clic o un arrastre: barras, nodos, apoyos o cargas (para tomar
  varios tipos juntos, se marca **Selección de múltiples tipos a la vez**). Arrastrar de izquierda
  a derecha toma lo que queda entero adentro del rectángulo; de derecha a izquierda, todo lo que
  toca. Hay botones **Todo**, **Nada** e **Invertir**, y se puede seleccionar **por id**, con listas
  y rangos como `3, 7-10`.
- **Clic derecho** sobre un nodo o una barra abre un menú para editarlo, subdividirlo, agregarle
  un apoyo o una carga, o borrarlo; con nodos seleccionados, también reflejarlos o girarlos 90°.
- **3D** pasa el modelo al espacio. Ver el [capítulo 3](03-basico-3d.md).

## Dibujar

### Nodos

**Nodo** (tecla `N`) coloca un nodo con cada clic. Si el nodo cae sobre una barra, el programa la
parte en dos automáticamente; se desactiva en **Ajustes → Subdividir barras al colocar nodos sobre
ellas**.

La misma herramienta tiene un segundo modo, **Articulaciones**, para modificar cómo se unen las
barras en un nodo:

- **Rótula.** Libera el momento: el nodo transmite fuerzas pero no momento. Clic en un nodo
  articula todas las barras que llegan a él; clic sobre una barra la parte en ese punto y
  articula los dos extremos nuevos.
- **Desliz. X / Desliz. Z** (deslizaderas). Liberan un desplazamiento relativo en una dirección,
  en ejes globales o locales.

### Barras

**Barra** (tecla `E`) une dos nodos. Antes de dibujar se elige el tipo:

- **Rígida (frame):** barra de pórtico. Transmite axial, corte y momento. Es la barra de las vigas
  y columnas.
- **Articulada (truss):** barra de reticulado. Sólo axial.

Desde la tabla de barras se cambia el material y la sección de cada barra, y las articulaciones se
pueden poner o sacar extremo por extremo (columnas **Art. I** y **Art. J**).

> **Qué es una articulación, internamente.** La matriz de una barra con un extremo articulado es
> la de la barra rígida con el grado de libertad liberado eliminado por **condensación estática**.
> Ver el [capítulo 6](06-fundamentos-teoricos.md#articulaciones).

## Propiedades

### Materiales

Cada material tiene módulo de elasticidad **E** (MPa), coeficiente de Poisson **ν**, peso
específico **ρ** (kN/m³) y tensión de fluencia **fy** (MPa). Se puede partir de una biblioteca
(aceros, conformados en frío, inoxidables, aluminio, hormigones y maderas, según distintas
normas) o cargar uno a medida.

- **E** gobierna la rigidez: es lo único que el cálculo lineal necesita del material.
- **ρ** se usa para el peso propio y para la masa en el análisis dinámico.
- **fy** se usa para expresar las tensiones como aprovechamiento (σ/fy) y en el colapso plástico.

### Secciones

Cada sección tiene área **A**, inercias **Iy** e **Iz** y, en 3D, constante de torsión **J**. Hay
tres caminos para definirla:

1. **Elegir Perfil Estándar:** perfiles laminados y conformados en frío (IPN, UPN, W, HEA, HEB,
   IPE, tubos, ángulos, etc.) según distintas normas.
2. **Construir Sección:** formas paramétricas, de pared delgada (cajón, tubo, doble T, T, U, C con
   labios) o macizas (cuadrada, rectangular, circular, T, L invertida). El programa calcula las
   propiedades a partir de la geometría.
3. **Definir Sección Amorfa:** sólo los números A, I y J. Sirve para resolver, pero no para
   analizar tensiones, porque el programa no conoce la forma.

> En 2D la barra flexiona en el plano XZ, así que la inercia que cuenta es la de flexión en ese
> plano. Si la sección está rotada un ángulo α, se usa Iy·cos²α + Iz·sin²α.

## Condiciones

### Apoyos

**Apoyo** (tecla `S`) coloca un apoyo en un nodo. Los tipos en 2D:

| Tipo | Restringe | Reacciones |
|---|---|---|
| **Empotramiento** (Empot.) | ux, uz, θy | Rx, Rz, My |
| **Articulación** (Artic.) | ux, uz | Rx, Rz |
| **Móvil** | un solo desplazamiento: el vertical o el horizontal | la reacción en esa dirección |
| **Resorte** | nada rígidamente: aporta rigidez kx, ky (vertical) y kθ | proporcionales al desplazamiento |

- El **móvil** puede inclinarse un ángulo α: el plano de deslizamiento se rota y la reacción
  queda perpendicular a él. También puede tomar la dirección de la barra que llega (ejes locales).
- Los apoyos pueden tener **desplazamientos impuestos**: un asentamiento, un giro. El programa los
  trata como una condición de borde con valor distinto de cero.

### Cargas

**Carga** (tecla `L`) aplica cargas del **caso de carga activo**, que se elige en la franja de la
herramienta (por defecto, D). Los tipos:

- **Puntual.** Sobre un nodo, es una fuerza **Fx**, **Fz** o un momento **My**. Sobre una barra,
  es una carga puntual en el punto donde hiciste clic.
- **Distribuida.** Con un valor en cada extremo (**qI**, **qJ**), así que puede ser uniforme o
  trapezoidal. La dirección puede ser global (**Z**) o perpendicular a la barra (**⊥**, la opción
  por defecto), con un ángulo α adicional. En la dirección perpendicular, el sentido sigue el
  orden de los nodos de la barra (de I a J). Una carga sobre un tramo de la barra se define desde
  la tabla de cargas.
- **Térmica.** Un cambio de temperatura uniforme **ΔT** (alarga o acorta la barra) y un gradiente
  **ΔTg** entre caras (la curva). El coeficiente de dilatación es fijo: 12·10⁻⁶ /°C.
- **Peso propio (PP).** Un casillero en la franja de la herramienta: agrega ρ·A a lo largo de
  cada barra, hacia abajo.

Las cargas sobre las barras no se "pasan a los nodos" a ojo: el programa calcula las **fuerzas
de empotramiento perfecto** de cada barra y las ensambla como cargas nodales equivalentes. Ver
el [capítulo 6](06-fundamentos-teoricos.md#el-vector-de-cargas).

### Casos de carga y combinaciones

En la pestaña **Cargas** de la tabla de datos está la sección **Combinaciones**:

- **Casos de carga:** permanente (D), sobrecarga (L), viento (W), sismo (E), o los que definas.
  Cada carga pertenece a un caso.
- **Combinaciones:** un factor por caso. Vienen cuatro de partida: **1.2D + 1.6L**, **1.4D**,
  **1.2D + L + 1.6W** y **1.2D + L + E**. Se pueden editar, borrar o agregar.

Al calcular, el programa resuelve primero **Cargas simples** (todas las cargas juntas, sin
factores), después cada caso y cada combinación, y arma la **envolvente** (máximos y mínimos de
todas las combinaciones). El peso propio se suma sólo a los casos de tipo D dentro de las
combinaciones.

Como el cálculo es lineal, cada combinación es la suma de los casos multiplicados por sus
factores: es el principio de superposición.

## Análisis

- **Calcular** (`Enter`) resuelve el modelo y abre los resultados. Cada cálculo incluye un
  **chequeo cinemático**: si la estructura es un mecanismo lo avisa, y si es estable informa si
  es isostática o hiperestática, y de qué grado.
- **Avanzado** abre las funciones avanzadas. Tienen su propio capítulo: el
  [capítulo 4](04-funciones-avanzadas.md).

## Resultados

Los botones del grupo **Resultados** se habilitan después del primer cálculo:

| Botón | Qué muestra |
|---|---|
| **Ninguno** | Sólo el modelo |
| **Deformada** | La forma deformada, exagerada. Se puede animar. |
| **N** | Esfuerzo axil (positivo = tracción) |
| **Vz** | Esfuerzo de corte |
| **My** | Momento flector, dibujado del lado traccionado |
| **Tensiones** | Un mapa de color de las tensiones en cada barra |

En el panel de **Resultados**:

- **Escala diagrama** agranda o achica el dibujo sin cambiar los valores.
- **Mostrado como:** diagrama, color de barras (sólo para el axial: rojo tracción, azul
  compresión) o mapa de colores.
- Para **Tensiones**, la **medida**: aprovechamiento σ/fy, Von Mises (σvm), tensión normal σ o
  tangencial τ.
- **Cambiar resultados a visualizar:** cargas simples, un caso, una combinación o la envolvente.
  **Comparar** superpone un segundo resultado para verlos juntos.
- La **tabla de resultados**: desplazamientos de cada nodo (ux, uz en mm; θy en mrad),
  reacciones (Rx, Rz, My) y esfuerzos en los extremos de cada barra.

El selector de resultados y la tabla aparecen cuando el modelo tiene combinaciones. Si se borran
todas, dejan de mostrarse.

> **Cómo se dibuja un diagrama.** El programa resuelve los desplazamientos de los nodos y, con
> ellos, los esfuerzos en los extremos de cada barra. Adentro de la barra, los diagramas se
> obtienen **por equilibrio**, integrando las cargas del tramo: no se interpolan entre extremos.
> Por eso el momento de una carga distribuida sale parabólico aunque la barra no esté dividida.

## Convenciones de signos

- **Axial:** positivo en tracción.
- **Momento:** se dibuja del lado de la fibra traccionada. En **Ajustes** se puede cambiar para
  que los valores positivos se dibujen hacia los ejes locales.
- **Reacciones y desplazamientos:** en ejes globales, positivos en el sentido de X y de Z.
- **Tensión normal:** σ = N/A + M·z/I, positiva en tracción.

---

[← Primeros pasos](01-primeros-pasos.md) · [Índice](README.md) · [Siguiente: Modo Básico en 3D →](03-basico-3d.md)
