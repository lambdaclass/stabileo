# CIRSOC 201 (2025) — CAPÍTULO 12. DIAFRAGMAS

> Source: `CIRSOC 201-2025.pdf` · PDF pages 239–254
> Extraction: `pdftotext -layout` text layer, verbatim. No text was rewritten or inferred.

<a id="c12.1"></a>
### 12.1 ALCANCE                                                   C 12.1. ALCANCE  <sub>p.239</sub>



<a id="c12.1.1"></a>
### 12.1.1 Los requisitos de este capítulo se aplican al           C 12.1.1. Normalmente, los diafragmas son elementos  <sub>p.239</sub>

diseño de diafragmas no pretensados y pretensados,              planos horizontales o casi horizontales que sirven para
incluyendo los incisos desde (a) hasta (d):                     transferir fuerzas laterales a los elementos verticales del
                                                                sistema de resistencia ante fuerzas laterales (ver la Figura
(a) Diafragmas que comprenden losas construidas                 C 12.1.1). Los diafragmas también vinculan los elementos
    in situ.                                                    de la edificación entre sí conformando un sistema
                                                                tridimensional completo y dan arriostramiento lateral a
(b) Diafragmas que comprenden una capa de                       esos elementos conectándolos al sistema de resistencia ante
    compresión in situ sobre elementos prefabri-                fuerzas laterales. En general, los diafragmas también sirven
    cados.                                                      como losas de entrepiso y cubierta, o como rampas
                                                                estructurales en estacionamientos y, por lo tanto, soportan
(c) Diafragmas que comprenden elementos prefabri-               cargas gravitacionales. Un diafragma puede incluir
    cados con fajas de borde formadas por una capa              cordones y colectores.
    de compresión construida in situ o por vigas de
    borde.                                                      Cuando se encuentran sometidos a cargas laterales, tales
                                                                como fuerzas inerciales actuando en el plano del diafragma
(d) Diafragmas de elementos prefabricados interco-              de cubierta de la Figura C 12.1.1, el diafragma actúa
    nectados sin una capa de compresión colocada                esencialmente como una viga que se extiende
    in situ.                                                    horizontalmente entre los elementos verticales del sistema
                                                                de resistencia ante fuerzas laterales. El diafragma,
                                                                entonces, desarrolla flexión y corte en su plano y
                                                                posiblemente otras acciones. Cuando los elementos
                                                                verticales del sistema de resistencia ante fuerzas laterales
                                                                no se extienden a lo largo de toda la dimensión del
                                                                diafragma, se pueden necesitar colectores que reciban el
                                                                corte del diafragma y lo transfieran a los elementos
                                                                verticales. En ocasiones, se usa el término “distribuidor”
                                                                para describir un colector que transfiere fuerzas desde un
                                                                elemento vertical del sistema de resistencia ante fuerzas
                                                                laterales hacia el diafragma. Este capítulo describe los
                                                                requisitos mínimos para el diseño y el detalle, incluyendo
                                                                la configuración, modelos de análisis, materiales y
                                                                resistencia de diafragmas y colectores.

                                                                Este capítulo cubre solo los tipos de diafragma incluidos en
                                                                el alcance, otros tipos de diafragmas, tales como
                                                                reticulados horizontales, se han usado con éxito en
                                                                edificios, pero este capítulo no incluye disposiciones
                                                                prescriptivas para estos tipos de diafragma.


<a id="c12.1.2"></a>
### 12.1.2 Los diafragmas en estructuras sismorresis-  <sub>p.239</sub>

tentes deben cumplir con los requisitos establecidos
en INPRES-CIRSOC 103 - Parte II - 2026.


<a id="c12.2"></a>
### 12.2 GENERALIDADES                                             C 12.2. GENERALIDADES  <sub>p.239</sub>



<a id="c12.2.1"></a>
### 12.2.1 El diseño debe considerar fuerzas de (a)                C 12.2.1. Como se ilustra parcialmente en la Figura  <sub>p.239</sub>

hasta (e), según corresponda:                                   C 12.1.1, los diafragmas resisten fuerzas provenientes de
                                                                distintos tipos de acciones (Moehle et al. 2010):
(a) Fuerzas en el plano del diafragma debidas a
    cargas laterales que actúan sobre el edificio.              (a) Fuerzas en el plano del diafragma – Las fuerzas
                                                                    laterales provenientes de las combinaciones de carga,
(b) Fuerzas de transferencia en el diafragma.                       incluyendo viento, sismo y presiones horizontales de
                                                                    fluidos o empuje del suelo, generan acciones de corte,
(c) Fuerzas de conexión entre el diafragma y los                    axiales y de flexión en el plano del diafragma a
                                                                              que éste cubre el espacio entre elementos


<!-- page 239 -->

                   REGLAMENTO                                             COMENTARIO

    no estructurales.                                     verticales del sistema de resistencia ante fuerzas
                                                          laterales y transfiere fuerzas a ellos. Para cargas de
(d) Fuerzas resultantes del arriostramiento de            viento, la fuerza lateral es generada por la presión del
    elementos verticales o inclinados del edificio.       viento que actúa sobre la fachada de la edificación y
                                                          es transferida por los diafragmas a los elementos
(e) Fuerzas fuera del plano del diafragma debidas a       verticales. Para las fuerzas de sismo, las fuerzas
    cargas gravitacionales u otras cargas aplicadas       inerciales se generan dentro del diafragma y las áreas
    en la superficie del diafragma.                       tributarias de tabiques, columnas y otros elementos, y
                                                          luego son transferidas por los diafragmas a los
                                                          elementos verticales. Para edificios con niveles
                                                          subterráneos, las fuerzas laterales son generadas por el
                                                          empuje ejercido por el suelo contra los muros del
                                                          sótano. En un sistema típico, los muros de contención
                                                          de los sótanos se extienden verticalmente entre los
                                                          entrepisos que sirven también como diafragmas, los
                                                          cuales a su vez distribuyen las fuerzas laterales del
                                                          empuje del suelo hacia otros elementos resistentes a
                                                          fuerzas.

                                                      (b) Fuerzas de transferencia del diafragma – Los
                                                          elementos verticales del sistema de resistencia ante
                                                          fuerzas laterales pueden tener diferentes propiedades a
                                                          lo largo de su altura, o bien sus planos de resistencia
                                                          pueden cambiar de un piso a otro, creando
                                                          transferencias de fuerzas entre los elementos
                                                          verticales. Una ubicación común donde cambian los
                                                          planos de resistencia es a nivel del terreno de un
                                                          edificio con una planta subterránea de mayor tamaño.
                                                          En estos casos las fuerzas pueden transferirse desde la
                                                          torre más angosta hacia los muros de contención de
                                                          los sótanos a través de un diafragma de podio (ver la
                                                          Figura C 12.1.1).

                                                      (c) Fuerzas de conexión – La presión del viento que
                                                          actúa sobre las superficies expuestas de la edificación
                                                          genera fuerzas fuera del plano de esas superficies. Del
                                                          mismo modo, la vibración producida por un sismo
                                                          puede generar fuerzas de inercia en los elementos
                                                          estructurales verticales y en los no estructurales como
                                                          son los de la fachada. Estas fuerzas son transferidas
                                                          desde los elementos donde se desarrollan las fuerzas
                                                          hacia el diafragma a través de las conexiones.

                                                      (d) Fuerzas de arriostramiento de las columnas – Las
                                                          configuraciones arquitectónicas a veces requieren
                                                          columnas inclinadas, que pueden provocar grandes
                                                          empujes dentro del plano de los diafragmas debidos a
                                                          las cargas de gravedad y de volcamiento. Estos
                                                          empujes pueden actuar en diferentes direcciones
                                                          dependiendo de la orientación de la columna y de si se
                                                          encuentra en compresión o en tracción. Cuando estos
                                                          empujes no están balanceados localmente por otros
                                                          elementos, las fuerzas deben transferirse al diafragma
                                                          de modo que puedan ser transmitidas a otros
                                                          elementos apropiados del sistema de resistencia ante
                                                          fuerzas laterales. Dichas fuerzas son usuales y pueden
                                                          ser significativas en columnas prefabricadas cargadas
                                                          excéntricamente y que no están construidas
                                                          monolíticamente con la estructura adyacente. El
                                                          diafragma también da arriostramiento lateral a las
                                                          columnas que no están diseñadas como parte del
                                                          sistema de resistencia ante fuerzas laterales,
                                                                            a otros elementos que aportan

Reglamento CIRSOC 201-25                                                                             Cap. 12 - 208


<!-- page 240 -->

                     REGLAMENTO                                                       COMENTARIO

                                                                     estabilidad lateral a la estructura.

                                                                (e) Fuerzas fuera del plano del diafragma – La
                                                                    mayoría de los diafragmas forman parte de la
                                                                    estructura de entrepiso y cubierta y, por lo tanto,
                                                                    soportan cargas gravitacionales. El Reglamento
                                                                    CIRSOC 101-2025 puede además exigir que se
                                                                    consideren las fuerzas fuera del plano debidas a la
                                                                    fuerza de succión del viento en una losa de cubierta y
                                                                    a la aceleración vertical debida a los efectos del
                                                                    sismo.


<a id="c12.2.2"></a>
### 12.2.2 El diseño debe considerar el efecto de las              C 12.2.2. Ver artículo C 7.2.1.  <sub>p.241</sub>

aberturas y vacíos dentro de la losa.

                                                                Figura C 12.1.1. Acciones típicas en el diafragma.


<a id="c12.2.3"></a>
### 12.2.3 Materiales  <sub>p.241</sub>



<a id="c12.2.3.1"></a>
### 12.2.3.1 Las propiedades de diseño del hormigón  <sub>p.241</sub>

deben seleccionarse de acuerdo con el Capítulo 19.


<a id="c12.2.3.2"></a>
### 12.2.3.2 Las propiedades de diseño del acero de la  <sub>p.241</sub>

armadura deben seleccionarse de acuerdo con el
Capítulo 20.


<a id="c12.3"></a>
### 12.3 LÍMITES DE DISEÑO                                         C 12.3. LÍMITES DE DISEÑO  <sub>p.241</sub>



<a id="c12.3.1"></a>
### 12.3.1 Espesor mínimo de diafragmas                            C 12.3.1. Espesor mínimo de diafragmas  <sub>p.241</sub>



<a id="c12.3.1.1"></a>
### 12.3.1.1 Los diafragmas deben tener el espesor                 Se puede requerir que los diafragmas resistan flexión, corte  <sub>p.241</sub>

requerido para estabilidad, resistencia y rigidez bajo          y fuerza axial en su plano. Para los diafragmas
las combinaciones de carga mayoradas.                           completamente construidos in situ o formados por losas
                                                                compuestas con capa de compresión y elementos


<!-- page 241 -->

                   REGLAMENTO                                                  COMENTARIO


<a id="c12.3.1.2"></a>
### 12.3.1.2 Los diafragmas de entrepiso y cubierta         prefabricados, el espesor de todo el diafragma debe ser  <sub>p.242</sub>

deben tener un espesor no menor al requerido en          suficiente para resistir dichas acciones. Para losas con
otras partes del Reglamento para los elementos de        capas de compresión que no actúan en forma compuestas,
entrepiso y cubierta.                                    el espesor de la capa de compresión construida in situ por
                                                         sí solo debe ser suficiente para resistir esas acciones. Los
                                                         diafragmas pertenecientes a estructuras sismorresistentes
                                                         deben cumplir con los requisitos establecidos en INPRES-
                                                         CIRSOC 103 - Parte II - 2026.

                                                         Además de los requisitos para resistir las fuerzas en el
                                                         plano, los diafragmas que forman parte del entrepiso o
                                                         cubierta deben cumplir con los requisitos aplicables para el
                                                         espesor de la losa o las alas de las vigas.


<a id="c12.4"></a>
### 12.4 RESISTENCIA REQUERIDA                              C 12.4. RESISTENCIA REQUERIDA  <sub>p.242</sub>



<a id="c12.4.1"></a>
### 12.4.1 Generalidades                                    Generalmente, las combinaciones de mayoración de carga  <sub>p.242</sub>

                                                         deben considerar las cargas fuera del plano que actúan

<a id="c12.4.1.1"></a>
### 12.4.1.1 La resistencia requerida para los              simultáneamente con las fuerzas en el plano del diafragma.  <sub>p.242</sub>

diafragmas, colectores y sus conexiones debe             Por ejemplo, esto se requiere donde una viga de entrepiso
calcularse de acuerdo con las combinaciones de           sirve también como colector, en cuyo caso la viga debe ser
mayoración de carga definidas en el Capítulo 5.          diseñada para resistir las fuerzas axiales derivadas de su
                                                         acción como un colector y para los momentos de flexión

<a id="c12.4.1.2"></a>
### 12.4.1.2 La resistencia requerida de diafragmas que     derivados de su acción como viga de entrepiso que soporta  <sub>p.242</sub>

forman parte del entrepiso o cubierta debe incluir los   cargas gravitacionales.
efectos de las cargas fuera del plano que se
producen simultáneamente con otras cargas
aplicables.


<a id="c12.4.2"></a>
### 12.4.2 Modelación y análisis del diafragma              C 12.4.2. Modelación y análisis del diafragma  <sub>p.242</sub>



<a id="c12.4.2.1"></a>
### 12.4.2.1 La modelación y análisis de los diafragmas     C 12.4.2.1. El ASCE/SEI 7-16 contiene requisitos para la  <sub>p.242</sub>

debe cumplir con lo definido en los artículos 12.4.2.2   modelación de diafragmas para ciertas condiciones de
hasta 12.4.2.4.                                          diseño, tales como los requisitos de diseño para resistir
                                                         cargas por viento y sísmicas.


<a id="c12.4.2.2"></a>
### 12.4.2.2 Los procedimientos de modelación y             C 12.4.2.2. El Capítulo 6 contiene los requisitos generales  <sub>p.242</sub>

análisis de los diafragmas deben cumplir con los         aplicables para el análisis de diafragmas. Normalmente, los
requisitos del Capítulo 6.                               diafragmas se diseñan para permanecer elásticos o casi
                                                         elásticos ante las fuerzas que actúan en su plano obtenidas
                                                         de las combinaciones de mayoración de carga. Por lo tanto,
                                                         generalmente se aceptan los métodos de análisis que
                                                         satisfacen la teoría del análisis elástico. Se pueden aplicar
                                                         los requisitos para el análisis elástico de los artículos 6.6.1
                                                         hasta 6.6.3.

                                                         La rigidez en el plano del diafragma afecta no solamente la
                                                         distribución de las fuerzas dentro del diafragma sino
                                                         también la distribución de los desplazamientos y fuerzas de
                                                         los elementos verticales. En consecuencia, el modelo de
                                                         rigidez del diafragma debería ser coherente con las
                                                         características de la edificación. Cuando el diafragma es
                                                         poco esbelto y muy rígido comparado con los elementos
                                                         verticales, como en un diafragma construido in situ
                                                         apoyado sobre pórticos resistentes a momento, es aceptable
                                                         modelar el diafragma como un elemento completamente
                                                         rígido. Cuando el diafragma es flexible comparado con los
                                                         elementos verticales, como en algunos sistemas
                                                         consistentes en prefabricados unidos entre si y apoyados
                                                         sobre tabiques estructurales, puede ser aceptable modelar
                                                         el diafragma como una viga flexible que se extiende entre

Reglamento CIRSOC 201-25                                                                                   Cap. 12 - 210


<!-- page 242 -->

                    REGLAMENTO                                                       COMENTARIO

                                                                apoyos rígidos. En otros casos, puede ser aconsejable
                                                                adoptar un modelo analítico más detallado para considerar
                                                                los efectos de flexibilidad del diafragma en la distribución
                                                                de los desplazamientos y fuerzas. Por ejemplo,
                                                                edificaciones en las que las rigideces del diafragma y de
                                                                los elementos verticales tienen aproximadamente el mismo
                                                                valor, edificaciones con grandes transferencias de fuerzas,
                                                                estructuras para estacionamientos en las que las rampas se
                                                                conectan entre los entrepisos y actúan esencialmente como
                                                                elementos de arriostramiento dentro de la edificación.

                                                                Para diafragmas constituidos por losas de hormigón, el
                                                                ASCE/SEI 7-16 permite suponer un diafragma rígido
                                                                cuando la relación de forma en planta del diafragma está
                                                                dentro de unos límites prescritos, que varían según las
                                                                cargas de viento y de sismo, y cuando la estructura no
                                                                presenta irregularidades horizontales. Las disposiciones del
                                                                ASCE/SEI 7-16 no prohíben suponer un diafragma rígido
                                                                para otras condiciones, siempre y cuando la hipótesis de
                                                                diafragma rígido sea razonablemente congruente con el
                                                                comportamiento esperado. Los diafragmas de hormigón
                                                                construidos in situ, diseñados bajo la hipótesis de
                                                                diafragma rígido tienen un largo historial de
                                                                comportamiento satisfactorio, aunque pueden no estar
                                                                comprendidos dentro de los valores indicados en
                                                                ASCE/SEI 7-16.


<a id="c12.4.2.3"></a>
### 12.4.2.3 Se permite cualquier conjunto de hipótesis            C 12.4.2.3. Para los diafragmas con relación de forma  <sub>p.243</sub>

razonables y congruentes para definir la rigidez de             aproximadamente cuadrada construidos completamente
los diafragmas.                                                 in situ o formados por una capa de compresión construida
                                                                in situ sobre elementos prefabricados, el diafragma
                                                                generalmente se modela como un elemento rígido
                                                                soportado por elementos verticales flexibles. Sin embargo,
                                                                se deberían considerar los efectos de la flexibilidad del
                                                                diafragma cuando tales efectos afecten materialmente las
                                                                acciones de diseño calculadas. Tales efectos se deberían
                                                                considerar para diafragmas que usan elementos
                                                                prefabricados, con o sin capa de compresión construida in
                                                                situ. Cuando ocurren grandes transferencias de fuerzas,
                                                                como se describe en el artículo C 12.2.1(b), se pueden
                                                                obtener fuerzas de diseño más realistas modelando la
                                                                rigidez en el plano del diafragma. Los diafragmas con
                                                                grandes vanos, grandes áreas recortadas en las esquinas u
                                                                otras irregularidades pueden desarrollar deformaciones en
                                                                el plano que deberían considerarse en el diseño (ver la
                                                                Figura C 12.4.2.3a).

                                                                Para un diafragma considerado como rígido en su propio
                                                                plano, y para diafragmas semirrígidos, se puede obtener la
                                                                distribución de las fuerzas internas del diafragma
                                                                modelándolo como una viga horizontal rígida soportada
                                                                sobre resortes horizontales que representan las rigideces
                                                                laterales de los elementos verticales (ver la Figura
                                                                C 12.4.2.3b). Se deberían incluir en el análisis los efectos
                                                                de la excentricidad en el plano entre las fuerzas aplicadas y
                                                                las resistencias de los elementos verticales, que provoquen
                                                                la torsión general del edificio. Se pueden utilizar elementos
                                                                del sistema de resistencia ante fuerzas laterales alineados
                                                                en la dirección octogonal para resistir la rotación en el
                                                                plano del diafragma (Moehle et al., 2010).


<!-- page 243 -->

                   REGLAMENTO                                             COMENTARIO

                                                        Figura C 12.4.2.3a. Ejemplo de diafragma que podría no
                                                        ser considerado como rígido en su plano.

                                                        Figura C 12.4.2.3b. Acciones en el plano del diafragma
                                                        obtenidas al modelar el diafragma como una viga
                                                        horizontal rígida sobre apoyos flexibles.


<a id="c12.4.2.4"></a>
### 12.4.2.4 El cálculo de los momentos, cortes y          C 12.4.2.4. El modelo de diafragma rígido se usa  <sub>p.244</sub>

fuerzas axiales de diseño en el plano del diafragma     ampliamente para diafragmas construidos completamente
debe ser coherente con los requisitos de equilibrio y   in situ y para diafragmas conformados por una capa de
con las condiciones de borde. Se permite determinar     compresión construida in situ y colocada sobre elementos
los momentos, cortes y fuerzas axiales de diseño de     prefabricados, siempre y cuando no se creen condiciones
acuerdo con una de las condiciones (a) hasta (e),       flexibles como resultado de una luz larga, de una relación
según corresponda:                                      de forma grande o por irregularidad del diafragma. Para
                                                        diafragmas más flexibles, a veces se analizan los casos
(a) Un modelo de diafragma rígido para casos en         límites en los cuales el diafragma se analiza como un
    que el diafragma puede ser idealizado como tal.     elemento rígido sobre apoyos flexibles y como un
                                                        diafragma flexible sobre apoyos rígidos, tomando los
(b) Un modelo de diafragma flexible para casos en       valores de diseño como la envolvente de los valores de los
    que el diafragma puede ser idealizado como tal.     dos análisis. Los modelos de elementos finitos pueden ser
                                                        adecuados para cualquier diafragma,            pero son

Reglamento CIRSOC 201-25                                                                          Cap. 12 - 212


<!-- page 244 -->

                    REGLAMENTO                                                       COMENTARIO

(c) Análisis envolvente donde los valores de diseño             especialmente útiles para diafragmas con forma irregular y
    son la envolvente de los valores obtenidos al               diafragmas que resisten grandes fuerzas de transferencia.
    suponer el límite superior y el límite inferior de          La rigidez debería ajustarse según la fisuración esperada
    rigidez en el plano para el diafragma en dos o              del hormigón bajo cargas de proyecto. Para diafragmas
    más análisis independientes.                                compuestos por prefabricados de hormigón unidos que
                                                                descansan sobre conectores mecánicos, puede ser necesario
(d) Un modelo de elementos finitos considerando la              incluir las uniones y conectores en el modelo de elementos
    flexibilidad del diafragma.                                 finitos. Para el diseño de diafragmas se puede usar el
                                                                modelo puntal-tensor, siempre y cuando se incluyan las
(e) Un modelo puntal-tensor de acuerdo con el                   consideraciones de inversión de fuerzas que ocurren en las
    artículo 23.2.                                              combinaciones de cargas de proyecto.


<a id="c12.5"></a>
### 12.5 RESISTENCIA DE CÁLCULO                                    C 12.5. RESISTENCIA DE CÁLCULO  <sub>p.245</sub>



<a id="c12.5.1"></a>
### 12.5.1 Generalidades                                           C 12.5.1. Generalidades  <sub>p.245</sub>



<a id="c12.5.1.1"></a>
### 12.5.1.1 Para cada combinación de mayoración de                C 12.5.1.1. Las acciones de diseño comúnmente incluyen  <sub>p.245</sub>

carga aplicable, las resistencias de cálculo de                 el momento en el plano, con o sin fuerza axial; corte en el
diafragmas, colectores y sus conexiones deben                   plano, y compresión axial y tracción en colectores y otros
cumplir con Sn ≥ U . La interacción entre los efectos          elementos que actúan como puntales o tensores. Algunas
de carga debe tenerse en cuenta.                                configuraciones de diafragmas pueden conducir a otros
                                                                tipos de acciones de diseño. Por ejemplo, un escalón
                                                                vertical en el diafragma puede resultar en flexión fuera del
                                                                plano, torsión o ambos. El diafragma debe diseñarse para
                                                                tales acciones cuando ellas ocurren en elementos que
                                                                forman parte de la trayectoria de cargas.

                                                                Las resistencias nominales se describen en el Capítulo 22
                                                                para un diafragma idealizado como viga o elemento
                                                                macizo que resistente momento, fuerza axial y corte en el
                                                                plano; y en el Capítulo 23 para un diafragma o segmento
                                                                de diafragma idealizado como un sistema puntal-tensor.
                                                                Los colectores y puntales alrededor de aberturas pueden
                                                                diseñarse como elementos a compresión sometidos a
                                                                fuerza axial usando las disposiciones del artículo 10.5.2
                                                                con el factor de reducción de resistencia para elementos
                                                                controlados por compresión del artículo 21.2.2. Para
                                                                tracción axial en esos elementos, la resistencia nominal a
                                                                tracción es Asfy y el factor de reducción de la resistencia es
                                                                0,90, tal como se requiere para elementos controlados por
                                                                tracción en el artículo 21.2.2.

                                                                Los diafragmas se diseñan para las combinaciones de carga
                                                                del artículo 5.3. Donde el diafragma o parte del diafragma
                                                                está sometido a efectos de carga múltiples debe
                                                                considerarse la interacción entre los efectos de carga. Un
                                                                ejemplo común se presenta cuando un colector se
                                                                construye dentro de una viga o losa que también resiste
                                                                cargas gravitacionales, caso en el cual el elemento se
                                                                diseña para momento y fuerza axial combinados. Otro
                                                                ejemplo se presenta cuando una conexión se somete
                                                                simultáneamente a tracción y corte.


<a id="c12.5.1.2"></a>
### 12.5.1.2 Se debe determinar  de acuerdo con el  <sub>p.245</sub>

artículo 21.2.


<a id="c12.5.1.3"></a>
### 12.5.1.3 Las resistencias de cálculo deben cumplir             C 12.5.1.3. Aplican diferentes requisitos de resistencia de  <sub>p.245</sub>

con (a), (b), (c) o (d):                                        cálculo dependiendo de la forma en que se idealice la
                                                                trayectoria de carga del diafragma.
(a) Para un diafragma idealizado como viga, con


<!-- page 245 -->

                   REGLAMENTO                                                   COMENTARIO

    con el momento resistido por la armadura de            El artículo 12.5.1.3(a) se refiere a los requisitos para los
    borde concentrado en los bordes del diafragma,         casos comunes donde el diafragma se idealiza como una
    las resistencias de cálculo deben cumplir con el       viga que se extiende entre los apoyos y que resiste las
    artículo 12.5.2 hasta 12.5.4.                          fuerzas dentro del plano, con armadura en los cordones en
                                                           los bordes del diafragma para resistir momento y fuerza
(b) Para un diafragma o segmento de diafragma              axial en el plano. Si los diafragmas se diseñan según este
    idealizado como un sistema puntal-tensor, las          modelo, es adecuado suponer que el flujo del corte es
    resistencias de cálculo deben cumplir con el           uniforme en toda la altura del diafragma. La altura del
    artículo 23.3.                                         diafragma se refiere a la dimensión medida en la dirección
                                                           de las fuerzas laterales dentro del plano (ver la Figura
(c) Para un diafragma idealizado como un modelo            C 12.4.2.3a). Cuando los elementos verticales del sistema
    de elementos finitos, las resistencias de cálculo      de resistencia ante fuerzas laterales no se extienden en toda
    deben cumplir con el Capítulo 22. En el diseño         la altura del diafragma, los colectores deben transferir el
    al corte se deben considerar las distribuciones        corte que actúa a lo largo de los segmentos restantes de la
    no uniformes de corte. En esos diseños se              altura del diafragma hacia los elementos verticales. Los
    deben colocar los colectores necesarios para           artículos 12.5.2 hasta 12.5.4 se basan en este modelo. Este
    transferir los cortes del diafragma a los              enfoque de diseño es aceptable incluso cuando algunos
    elementos verticales del sistema de resistencia        momentos sean resistidos por precompresión como se
    ante fuerzas laterales.                                indica en el artículo 12.5.1.4.

(d) Se permite diseñar el diafragma usando                 Los artículos 12.5.1.3(b) hasta (d) permiten modelos
    métodos alternativos que cumplan con los               alternativos para el diseño de diafragmas. Si los diafragmas
    requisitos de equilibrio y con resistencias de         se diseñan para resistir momento a través de bielas
    cálculo que sean iguales o mayores a las               distribuidas, o de acuerdo con los campos de tensiones
    resistencias requeridas para todos los elementos       determinados por análisis de elementos finitos, debería
    en la trayectoria de cargas.                           tenerse en cuenta el flujo de corte no uniforme.


<a id="c12.5.1.4"></a>
### 12.5.1.4 Se permite usar la precompresión                 C 12.5.1.4. En el caso típico de una losa de entrepiso  <sub>p.246</sub>

proveniente de la armadura de pretensado para              pretensada, se requiere pretensado, como mínimo, para
resistir las fuerzas del diafragma.                        resistir la combinación de carga mayorada 1,2D + 1,6L,
                                                           donde L puede haber sido reducida como lo permita el
                                                           Reglamento CIRSOC 101-2025. Sin embargo, en el diseño
                                                           para viento y sismo, se reduce la carga gravitacional
                                                           resistida por el pretensado porque rige la combinación de
                                                           carga 1,2D + f1L + (W o E) , donde f1 es 1,0 ó 0,5
                                                           dependiendo de la naturaleza de L. Por lo tanto, se requiere
                                                           sólo una parte del pretensado efectivo para resistir las
                                                           cargas gravitacionales reducidas. El resto del pretensado
                                                           efectivo puede usarse para resistir momentos en el plano
                                                           del diafragma. Los momentos adicionales, si existen, son
                                                           resistidos por armadura adicional.


<a id="c12.5.1.5"></a>
### 12.5.1.5 Si se diseña con armadura de pretensado          C 12.5.1.5. Armadura de pretensado adherida pero que no  <sub>p.246</sub>

adherida pero que no se pretensa, para resistir            se pretensa, ya sean cordones o barras, se usan a veces para
fuerzas en los colectores, el corte en el diafragma o      resistir las fuerzas de diseño del diafragma. El límite
la tracción causada por momentos en el plano, el           impuesto a la resistencia a fluencia supuesta es para
valor de la tensión del acero utilizada para calcular la   controlar el ancho de las fisuras y la abertura de las juntas.
resistencia no debe exceder la resistencia especifi-       Este Reglamento no incluye disposiciones para el anclaje
cada a la fluencia ni 420 MPa.                             de la armadura de pretensado adherida no pretensada. Los
                                                           límites de tensiones para otras armaduras se dan en el
                                                           Capítulo 20.


<a id="c12.5.2"></a>
### 12.5.2 Momento y fuerza axial                             C 12.5.2. Momento y fuerza axial  <sub>p.246</sub>



<a id="c12.5.2.1"></a>
### 12.5.2.1 Se permite diseñar un diafragma para             C 12.5.2.1. El artículo 12.5.2 permite el diseño para  <sub>p.246</sub>

resistir momento y fuerza axial en el plano de             momento y fuerza axial de acuerdo con las hipótesis dadas
acuerdo con los artículos 22.3 y 22.4.                     en los artículos 22.3 y 22.4, incluida la hipótesis de que las
                                                           deformaciones unitarias varían linealmente a través de la
                                                           altura del diafragma. En la mayoría de los casos, el diseño
                                                           para fuerza axial y momento se puede realizar
                                                           satisfactoriamente en forma aproximada usando un par de
                                                           fuerzas de tracción y compresión con un factor de

Reglamento CIRSOC 201-25                                                                                    Cap. 12 - 214


<!-- page 246 -->

                    REGLAMENTO                                                       COMENTARIO

                                                                reducción de resistencia igual a 0,90.


<a id="c12.5.2.2"></a>
### 12.5.2.2 Se permite resistir la tracción debida a              C 12.5.2.2. La armadura de pretensado adherida usada  <sub>p.247</sub>

momento usando (a), (b), (c) o (d), o una combina-              para resistir momentos y fuerza axial en el plano puede
ción de estos métodos:                                          estar pretensada o no pretensada. Los conectores
                                                                mecánicos que atraviesan las juntas entre elementos
(a) Barras conformadas que cumplan con el artículo              prefabricados se utilizan para completar una trayectoria de
    20.2.1.                                                     cargas continua para la armadura embebida en esos
                                                                elementos. En el artículo C 12.5.1.4 se comenta el uso de
(b) Cordones o barras, pretensadas o no pretensa-               la precompresión proveniente de la armadura de
    das, que cumplan con el artículo 20.3.1.                    pretensado.

(c) Conectores mecánicos que atraviesen las juntas
    entre elementos prefabricados.

(d) Precompresión proveniente de la armadura
    pretensada.


<a id="c12.5.2.3"></a>
### 12.5.2.3 La armadura no pretensada y los                       C 12.5.2.3. La Figura C 12.5.2.3 ilustra las ubicaciones  <sub>p.247</sub>

conectores mecánicos que resisten la tracción                   permitidas para la armadura no pretensada que resiste la
originada por el momento deben colocarse dentro de              tracción debida al momento y fuerza axial. Donde cambia
h/4 del borde en tracción del diafragma, donde h es             la altura del diafragma a lo largo del vano, se permite
la altura del diafragma medida en el plano del                  desarrollar la armadura para tracción en las secciones
diafragma. Cuando la altura del diafragma cambia a              adyacentes aun si la armadura está ubicada fuera del límite
lo largo del vano, se permite anclar la armadura en             de h/4 de la sección adyacente. En esos casos, se puede
los segmentos adyacentes del diafragma que no se                usar el método de puntal-tensor o un análisis de estado
encuentran dentro del límite de h/4.                            plano de tensiones elástico para determinar las longitudes
                                                                de las barras y otros requisitos de las armaduras para
                                                                aportar continuidad a través del escalón. Las restricciones
                                                                en la ubicación de la armadura no pretensada y de los
                                                                conectores mecánicos intentan controlar la fisuración y la
                                                                abertura excesiva de las juntas que se podría producir cerca
                                                                de los bordes si la armadura o los conectores mecánicos
                                                                estuvieran distribuidos en toda la altura del diafragma. La
                                                                concentración de la armadura de tracción por flexión cerca
                                                                del borde del diafragma también resulta en tensiones de
                                                                corte más uniformes a través de la altura del diafragma.

                                                                No existen restricciones para la ubicación de la armadura
                                                                de pretensado suministrada para resistir el momento
                                                                mediante precompresión. En efecto, la precompresión
                                                                determina la porción de momento que puede ser resistido
                                                                por la armadura de pretensado, en tanto que el resto del
                                                                momento es resistido por la armadura o los conectores
                                                                mecánicos colocados de acuerdo con el artículo 12.5.2.3.

                                                                El Reglamento no requiere que los elementos de borde del
                                                                diafragma que resisten fuerzas de compresión por flexión
                                                                sean detallados como columnas. Sin embargo, cuando un
                                                                elemento de borde resiste una fuerza de compresión grande
                                                                en comparación con la resistencia axial, o es diseñado
                                                                como un puntal adyacente a un borde o abertura, se debería
                                                                considerar colocar una armadura transversal similar a los
                                                                estribos cerrados de confinamiento de las columnas.


<!-- page 247 -->

                   REGLAMENTO                                                  COMENTARIO

                                                          Figura C 12.5.2.3. Ubicaciones de la armadura no
                                                          pretensada que resiste tracción debida al momento y
                                                          fuerza axial de acuerdo con el artículo 12.5.2.3.


<a id="c12.5.2.4"></a>
### 12.5.2.4 Los conectores mecánicos que atraviesen         C 12.5.2.4. En un diafragma prefabricado sin capa de  <sub>p.248</sub>

juntas entre elementos prefabricados deben                compresión que resista fuerzas en el plano y responda en el
diseñarse para resistir la tracción requerida por la      rango lineal, se espera que ocurra una apertura de las juntas
apertura prevista de las juntas.                          (del orden de 2,5 mm o menos). Una apertura mayor puede
                                                          esperarse durante movimientos sísmicos que excedan el
                                                          nivel de diseño. Los conectores mecánicos deberían ser
                                                          capaces de mantener la resistencia de cálculo cuando
                                                          ocurran esas aperturas.


<a id="c12.5.3"></a>
### 12.5.3 Corte                                             C 12.5.3. Corte  <sub>p.248</sub>



<a id="c12.5.3.1"></a>
### 12.5.3.1 Los requisitos del artículo 12.5.3 se aplican   C 12.5.3.1. Estos requisitos suponen que la tensión de  <sub>p.248</sub>

a la resistencia a corte en el plano del diafragma.       corte en el diafragma es aproximadamente uniforme en
                                                          toda la altura del diafragma, como sucede cuando se diseña
                                                          de acuerdo con el artículo 12.5.1.3(a). Cuando se usan
                                                          enfoques alternativos, se deberían considerar las varia-
                                                          ciones locales del corte en la altura del diafragma.

12.5.3.2.  debe ser 0,75, a menos que un valor           C 12.5.3.2. Para elementos sismorresistentes, el factor de
menor sea requerido por el artículo 21.2.4.               reducción se determina con el INPRES-CIRSOC 103 -
                                                          Parte I - 2018.


<a id="c12.5.3.3"></a>
### 12.5.3.3 Para un diafragma completamente                 C 12.5.3.3. Acv se refiere al área de la sección de la viga  <sub>p.248</sub>

construido in situ, Vn debe calcularse con la             que forma el diafragma.
ecuación (12.5.3.3).

     Vn = Acv (0,17  √f´c + t fy)        (12.5.3.3)

donde Acv es el área bruta de hormigón definida por
el espesor del alma y la altura del diafragma,
reducida por el área de aberturas, si existen. El valor
de √f´c utilizado para calcular Vn no debe exceder
8,3 MPa y t se refiere a la armadura distribuida
orientada en forma paralela al corte en el plano.

Reglamento CIRSOC 201-25                                                                                  Cap. 12 - 216


<!-- page 248 -->

                    REGLAMENTO                                                        COMENTARIO


<a id="c12.5.3.4"></a>
### 12.5.3.4 Para un diafragma completamente  <sub>p.249</sub>

construido in situ, las dimensiones de la sección
transversal deben seleccionarse de tal manera que
cumplan con:

       Vu =  0,66 Acv √f´c                    (12.5.3.4)

donde el valor de √f´c usado para calcular Vn no
debe exceder 8,3 MPa.


<a id="c12.5.3.5"></a>
### 12.5.3.5 Para diafragmas conformados por una capa              C 12.5.3.5. Para diafragmas con capa de compresión  <sub>p.249</sub>

de compresión de hormigón construida in situ                    construida in situ sobre elementos prefabricados, el espesor
colocada sobre elementos prefabricados, se debe                 efectivo en el artículo 12.5.3.5(a) consiste únicamente del
cumplir con (a) y (b):                                          espesor de la capa de compresión cuando la capa de
                                                                compresión no actúa en forma compuesta con los
(a) Vn debe calcularse de acuerdo con la ecuación               elementos prefabricados. La capa de compresión tiende a
    (12.5.3.3) y deben seleccionarse las dimensio-              desarrollar fisuras sobre y a lo largo de las juntas entre los
    nes de la sección transversal de modo que se                elementos prefabricados. Por lo tanto, el artículo
    cumpla con la ecuación (12.5.3.4). Acv debe                 12.5.3.5(b) limita la resistencia al corte con la resistencia al
    calcularse usando el espesor de la capa de                  corte por fricción de la capa de compresión sobre las juntas
    compresión en los diafragmas formados por una               entre elementos prefabricados.
    capa de compresión sin acción compuesta y por
    el espesor combinado de los elementos
    prefabricados y la capa de compresión in situ
    para los diafragmas con acción compuesta. Para
    los diafragmas formados con capa de
    compresión con acción compuesta, el valor de
    f´c en las ecuaciones (12.5.3.3) y (12.5.3.4) no
    debe exceder el menor f´c de los elementos
    prefabricados o el f´c de la capa de compresión.

(b) Vn no debe exceder el valor calculado de
    acuerdo con los requisitos de corte por fricción
    del artículo 22.9 considerando el espesor de la
    capa de compresión localizada sobre las juntas
    entre los elementos prefabricados con capa de
    compresión de acción compuesta y no
    compuesta, y la armadura que atraviesa las
    juntas entre los elementos prefabricados.


<a id="c12.5.3.6"></a>
### 12.5.3.6 Para diafragmas consistentes de elementos             C 12.5.3.6. En los diafragmas sin capa de compresión, se  <sub>p.249</sub>

prefabricados interconectados sin una capa de                   puede resistir el corte usando armadura para corte por
compresión de hormigón, y para diafragmas consis-               fricción en las juntas inyectadas con mortero (FEMA
tentes de elementos prefabricados con fajas de                  P751). La armadura para corte por fricción es adicional a la
borde formadas por una capa de compresión de                    armadura requerida por cálculo para resistir otras fuerzas
hormigón colocado in situ o vigas de borde, se                  de tracción en el diafragma, tales como aquellas debidas al
permite diseñar para corte de acuerdo con (a) o (b), o          momento y fuerza axial, o debidas a la tracción del
ambos:                                                          colector. La intención es reducir la apertura de las juntas
                                                                resistiendo simultáneamente el corte por medio de la
(a) La resistencia nominal de las juntas inyectadas             armadura de corte por fricción. De manera alternativa o
    con mortero no debe exceder 0,55 MPa. Se                    adicionalmente, se pueden usar conectores mecánicos para
    debe diseñar armadura para resistir corte con los           transferir el corte a través de las juntas de los elementos
    requisitos de fricción-corte del artículo 22.9. La          prefabricados. En este caso, se debería prever alguna
    armadura de corte por fricción debe colocarse en            apertura de las juntas. Los conectores mecánicos deberían
    forma adicional a la armadura requerida para                ser capaces de mantener la resistencia de cálculo cuando
    resistir la tracción debida a momento y fuerza              las aperturas que se prevén en las juntas ocurran.
    axial.

(b) Los conectores mecánicos que atraviesen las


<!-- page 249 -->

                   REGLAMENTO                                                  COMENTARIO

    diseñarse para resistir el corte requerido por las
    aperturas previstas entre las juntas.


<a id="c12.5.3.7"></a>
### 12.5.3.7 Para cualquier diafragma, en el cual el corte   C 12.5.3.7. Además de contar con resistencia al corte  <sub>p.250</sub>

es transferido desde el diafragma a un colector, o        adecuada en su plano, un diafragma debería armarse para
desde el diafragma o colector a un elemento vertical      transferir el corte a través de armadura de corte por
del sistema de resistencia ante fuerzas laterales, se     fricción o conectores mecánicos a los colectores y
debe cumplir con (a) o (b):                               elementos verticales del sistema de resistencia ante fuerzas
                                                          laterales. En los diafragmas construidos completamente in
(a) Cuando el corte es transferido a través del           situ, la armadura aportada para otros fines normalmente es
    hormigón, se deben aplicar los requisitos del         adecuada para transferir las fuerzas desde el diafragma
    artículo 22.9 para corte por fricción.                hacia los colectores a través de la armadura de corte por
                                                          fricción. Sin embargo, se puede requerir armadura
(b) Cuando el corte es transferido usando                 adicional para transferir el corte del diafragma o de los
    conectores mecánicos o barras, se deben               colectores hacia los elementos verticales del sistema de
    considerar los efectos de levantamiento y             resistencia ante fuerzas laterales a través de armadura de
    rotación del elemento vertical del sistema de         corte por fricción. La Figura C 12.5.3.7 ilustra un detalle
    resistencia ante fuerzas laterales.                   común para las barras destinadas a esta finalidad.

                                                          Figura C 12.5.3.7. Detalles de barras aportadas para
                                                          transferir corte a un tabique estructural a través de la
                                                          armadura de corte por fricción.


<a id="c12.5.4"></a>
### 12.5.4 Colectores                                        C 12.5.4. Colectores  <sub>p.250</sub>


                                                          Un colector es la región del diafragma que transfiere las
                                                          fuerzas entre el diafragma y un elemento vertical del
                                                          sistema de resistencia ante fuerzas laterales. Se puede
                                                          extender transversalmente dentro del diafragma para
                                                          reducir las tensiones nominales y la congestión de la
                                                          armadura, como se aprecia en la Figura C 12.5.3.7.
                                                          Cuando el ancho de un colector se extiende dentro de la
                                                          losa, el ancho del colector a cada lado del elemento vertical
                                                          no debería exceder aproximadamente la mitad del ancho de
                                                          contacto entre el colector y el elemento vertical.


<a id="c12.5.4.1"></a>
### 12.5.4.1 Los colectores deben extenderse desde los       C 12.5.4.1. El procedimiento de diseño del artículo  <sub>p.250</sub>

elementos verticales del sistema de resistencia ante      12.5.1.3(a) modela el diafragma como una viga de altura
fuerzas laterales a través de toda o parte de la altura   total con flujo de corte uniforme. Cuando los elementos
del diafragma según se requiera para transferir el        verticales del sistema de resistencia ante fuerzas laterales
corte desde el diafragma a los elementos verticales.      no se extienden en la altura total del diafragma, se requiere
Se permite descontinuar un colector a lo largo de los     de colectores para transferir el corte que actúa a lo largo de
elementos verticales del sistema de resistencia ante      los segmentos restantes en la altura del diafragma, como se
fuerzas laterales donde no se requiere transferencia      aprecia en la Figura C 12.5.4.1. También se pueden

Reglamento CIRSOC 201-25                                                                                   Cap. 12 - 218


<!-- page 250 -->

                    REGLAMENTO                                                       COMENTARIO

de las fuerzas de diseño de los colectores.                     considerar colectores de longitud parcial, pero debería
                                                                diseñarse una trayectoria completa de fuerza que sea capaz
                                                                de transmitir todas las fuerzas del diafragma al colector y a
                                                                los elementos verticales (Moehle et al., 2010).

                                                                Figura C 12.5.4.1. Colector de altura total y armadura
                                                                de corte por fricción requerida para transferir las fuerzas
                                                                del colector al tabique.


<a id="c12.5.4.2"></a>
### 12.5.4.2 Los colectores deben diseñarse como                   C 12.5.4.2. Las fuerzas de tracción y compresión en un  <sub>p.251</sub>

elementos a tracción, o compresión, o ambos, de                 colector están determinadas por los esfuerzos de corte del
acuerdo con el artículo 22.4.                                   diafragma que se transmiten a los elementos verticales del
                                                                sistema de resistencia ante fuerzas laterales (ver la Figura
                                                                C 12.5.4.1). Para el proyecto de colectores en elementos
                                                                sismorresistentes, dirigirse al INPRES-CIRSOC 103 -
                                                                Parte II - 2026.


<a id="c12.5.4.3"></a>
### 12.5.4.3 Cuando se diseña un colector para                     C 12.5.4.3. Además de tener una longitud de anclaje  <sub>p.251</sub>

transferir fuerzas a un elemento vertical, la armadura          suficiente, la armadura del colector debería extenderse lo
del colector debe extenderse a lo largo del elemento            necesario para transferir todas sus fuerzas a los elementos
vertical al menos en la mayor longitud definida entre           verticales del sistema de resistencia ante fuerzas laterales.
(a) y (b):                                                      Es una práctica común el extender algunas de las
                                                                armaduras del colector en toda la longitud del elemento
(a) La longitud requerida para anclar la armadura en            vertical, de modo que las fuerzas del colector puedan
    tracción.                                                   transmitirse de manera uniforme a través de la armadura de
                                                                corte por fricción (ver la Figura C 12.5.4.1). La Figura
(b) La longitud requerida para transmitir las fuerzas           C 12.5.4.3 muestra un ejemplo de la armadura de colector
    de diseño al elemento vertical a través de                  extendida para transmitir las fuerzas a las tres columnas de
    armadura de corte por fricción, de acuerdo con              pórtico.
    el artículo 22.9, o a través de conectores
    mecánicos u otros mecanismos de transferencia
    de fuerzas.


<!-- page 251 -->

                   REGLAMENTO                                               COMENTARIO

                                                         Figura C 12.5.4.3. Esquema de la transferencia de
                                                         fuerzas del colector hacia los elementos verticales del
                                                         sistema de resistencia ante fuerzas laterales.


<a id="c12.6"></a>
### 12.6 LÍMITES DE LA ARMADURA  <sub>p.252</sub>



<a id="c12.6.1"></a>
### 12.6.1 La armadura para resistir las tensiones de  <sub>p.252</sub>

contracción y temperatura debe cumplir con el
artículo 24.4.


<a id="c12.6.2"></a>
### 12.6.2 Excepto para losas sobre el terreno, los  <sub>p.252</sub>

diafragmas que forman parte del entrepiso o cubierta
deben cumplir con los límites de armadura para losas
en una dirección de acuerdo con el artículo 7.6 ó en
dos direcciones de acuerdo con el artículo 8.6, la que
sea aplicable.


<a id="c12.6.3"></a>
### 12.6.3 La armadura diseñada para resistir las  <sub>p.252</sub>

fuerzas en el plano del diafragma debe sumarse a la
armadura diseñada para resistir otros efectos de
carga, excepto que se permite considerar la
armadura colocada para resistir fuerzas debidas a la
contracción y variación de temperatura como parte
de la armadura para resistir las fuerzas en el plano
del diafragma.


<a id="c12.7"></a>
### 12.7 DETALLES DE LA ARMADURA                            C 12.7. DETALLES DE LA ARMADURA  <sub>p.252</sub>



<a id="c12.7.1"></a>
### 12.7.1 Generalidades                                    C 12.7.1. Generalidades  <sub>p.252</sub>



<a id="c12.7.1.1"></a>
### 12.7.1.1 El recubrimiento de hormigón para la           C 12.7.1.1. Para elementos sismorresistentes, el recubri-  <sub>p.252</sub>

armadura debe cumplir con el artículo 20.5.1.            miento de hormigón debe cumplir con lo especificado en


<a id="c12.7.1.2"></a>
### 12.7.1.2 Las longitudes de anclaje de la armadura  <sub>p.252</sub>

conformada y pretensada deben calcularse de
acuerdo con el artículo 25.4, a menos que el
longitudes.


<a id="c12.7.1.3"></a>
### 12.7.1.3 Los empalmes de la armadura conformada  <sub>p.252</sub>

deben cumplir con el artículo 25.5.


<a id="c12.7.1.4"></a>
### 12.7.1.4 Los paquetes de barras deben cumplir con  <sub>p.252</sub>

el artículo 25.6.

Reglamento CIRSOC 201-25                                                                              Cap. 12 - 220


<!-- page 252 -->

                    REGLAMENTO                                                       COMENTARIO


<a id="c12.7.2"></a>
### 12.7.2 Separación de la armadura                               C 12.7.2. Separación de la armadura  <sub>p.253</sub>



<a id="c12.7.2.1"></a>
### 12.7.2.1 La separación mínima de la armadura, s ,              C 12.7.2.1. Para estructuras sismorresistentes, se deben  <sub>p.253</sub>

debe cumplir con el artículo 25.2.                              cumplir con los requisitos establecidos en INPRES-
                                                                CIRSOC 103 - Parte II - 2026.


<a id="c12.7.2.2"></a>
### 12.7.2.2 La separación máxima de la armadura  <sub>p.253</sub>

conformada, s , debe ser la menor entre cinco veces
el espesor del diafragma y 450 mm.


<a id="c12.7.3"></a>
### 12.7.3 Armadura de diafragmas y colectores                     C 12.7.3. Armadura de diafragmas y colectores  <sub>p.253</sub>



<a id="c12.7.3.1"></a>
### 12.7.3.1 Excepto para las losas sobre el terreno, los  <sub>p.253</sub>

diafragmas que forman parte del entrepiso o cubierta
deben cumplir con los detalles para losas en una
dirección de acuerdo con el artículo 7.7 o para losas
en dos direcciones de acuerdo con el artículo 8.7, los
que sean aplicables.


<a id="c12.7.3.2"></a>
### 12.7.3.2 Las fuerzas calculadas de tracción o                  C 12.7.3.2. Las secciones críticas para el anclaje de la  <sub>p.253</sub>

compresión en la armadura para cada sección del                 armadura generalmente ocurren en los puntos de máxima
diafragma o colector deben anclarse a cada lado de              tensión, en los puntos donde la armadura adyacente se
esa sección.                                                    termina y ya no es necesaria para resistir las fuerzas de
                                                                diseño y en otros puntos de discontinuidad del diafragma.


<a id="c12.7.3.3"></a>
### 12.7.3.3 La armadura colocada para resistir tracción           C 12.7.3.3. Para una viga, el Reglamento exige que la  <sub>p.253</sub>

debe extenderse más allá del punto en que ya no se              armadura de flexión se extienda la mayor longitud entre d
requiere para resistirla en una distancia al menos              y 12db más allá de los puntos donde ya no se requiere
igual a la longitud de anclaje d de la armadura,               para flexión. Estas extensiones son importantes en las
excepto en los bordes del diafragma y en las juntas             vigas con el fin de protegerlas de fallas por adherencia o
de expansión.                                                   corte que pudieran resultar de las imprecisiones en la
                                                                ubicación calculada para tensión de tracción. No se ha
                                                                informado acerca de este tipo de fallas en diafragmas. Para
                                                                simplificar el diseño y evitar extensiones excesivamente
                                                                largas de las barras que resultarían de aplicar las
                                                                disposiciones para vigas a los diafragmas, este requisito
                                                                sólo pide que la armadura para tracción se extienda d
                                                                más allá de los puntos donde ya no se requiere para resistir
                                                                tracción.


<!-- page 253 -->

                   REGLAMENTO    COMENTARIO

Reglamento CIRSOC 201-25                            Cap. 12 - 222


<!-- page 254 -->

                    REGLAMENTO                                                       COMENTARIO
