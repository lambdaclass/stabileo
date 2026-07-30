# CIRSOC 301 (2018) — APÉNDICE 2. PROYECTO PARA ACUMULACIÓN DE AGUA

> Source: `CIRSOC 301-2018.pdf` · PDF pages 269–272
> Extraction: `pdftotext -layout` text layer, verbatim. No text was rewritten or inferred.

Este Apéndice contiene métodos para determinar si un sistema de cubierta o techo tiene
suficiente resistencia y rigidez como para evitar la acumulación de agua.

Su contenido se organiza de la siguiente forma:


<a id="c2.1"></a>
### 2.1 Proyecto simplificado para evitar acumulación de agua  <sub>p.269</sub>


<a id="c2.2"></a>
### 2.2 Proyecto mejorado para evitar acumulación de agua  <sub>p.269</sub>



<a id="c2.1"></a>
### 2.1 PROYECTO SIMPLIFICADO PARA EVITAR ACUMULACIÓN DE AGUA  <sub>p.269</sub>


Según lo especificado en la Sección B.3.8. el sistema estructural de cubierta o techo deberá
ser investigado por análisis estructural a fin de asegurar una adecuada resistencia y
estabilidad bajo condiciones de acumulación de agua, cuando la cubierta no tenga suficiente
pendiente hacia los desagües (< 3% ), o no tenga un adecuado número de descargas, y/o
cuando no se prevenga adecuadamente que no exista acumulación de agua de lluvia o de
deshielo. En dichos casos se deberá considerar tanto la influencia de la deformación de la
estructura de la cubierta o techo como la posibilidad de acumulación de agua hasta la altura
de los desbordes libres.

El sistema estructural de cubierta o techo será considerado como estable y no se requerirá
ninguna investigación adicional si se verifica que:

                                      C p  0 , 9 C s  0 , 25                            (2.1)

                                                    4          8
                                      Id  0 ,4S        ( 10        )                     (2.2)

donde:
                                               5 Ls L4p
                                      Cp                                                 (2.3)
                                              10 12  I
                                                       p

                                                 5 S L4s
                                      Cs                                                 (2.4)
                                              10 12  I
                                                       s

siendo:

          Lp   la separación entre columnas en la dirección de la viga principal, (longitud de
               miembros primarios), en cm.

          Ls   la separación entre columnas en dirección perpendicular a la viga principal,
               (longitud de miembros secundarios), en cm.

Reglamento CIRSOC 301 – 2018                                                  Apéndice 2 - 215


<!-- page 269 -->

          S    la separación de miembros secundarios, en cm.

          Ip   el momento de inercia de miembros primarios, (vigas principales), en cm4.

          Is   el momento de inercia de miembros secundarios (correas), en cm4.

          Id   el momento de inercia de la chapa de acero de cubierta apoyada en los miembros
               secundarios, en cm4/m.

Para cerchas, vigas reticuladas y en general vigas de alma abierta, el momento de inercia para
incluir en las expresiones anteriores, será determinado considerando la deformación por corte
del alma. En forma aproximada cuando el momento de inercia se calcule usando solo el área
de los cordones, la reducción de momento de inercia por la deformación del alma podrá ser
tomada como un 15%.

Una cubierta de chapa de acero será considerada como un miembro secundario cuando apoye
directamente en miembros primarios.


<a id="c2.2"></a>
### 2.2 PROYECTO MEJORADO PARA EVITAR ACUMULACIÓN DE AGUA  <sub>p.270</sub>


Se podrán utilizar las especificaciones de esta Sección cuando sea necesaria una
determinación más exacta de la rigidez flexional de una cubierta o techo plano formado por un
entramado de vigas principales y secundarias y por chapas de cubierta.

Para cualquier combinación de vigas primarias y secundarias en el entramado, el índice de
tensión será calculado por:

                                       0 ,8 F  f 
                                              y  o 
                                  Up               Para el miembro primario                     (2.5)
                                            f      
                                              o    p

                                       0 ,8 F  f 
                                              y  o 
                                  Us               Para el miembro secundario                   (2.6)
                                            f      
                                              o    s
siendo:

          fo la tensión debida a la combinación de acciones D + R (D = carga permanente
             nominal,
          R la carga nominal debida al agua de lluvia o al hielo que contribuye exclusivamente a
             la acumulación de agua (1), en MPa.

(1) Para algunas ubicaciones geográficas esta carga deberá incluir la carga de la nieve que pudiera estar
presente.
Sin embargo las fallas de inestabilidad por acumulación de agua ocurren con mayor frecuencia
durante lluvias torrenciales (generalmente no coincidentes con la presencia de nieve en las zonas
donde ésta es una acción a considerar) cuando la velocidad de precipitación supera la velocidad de
drenaje y se produce una importante acumulación de agua a cierta distancia de los puntos o líneas de
drenaje. Se usará un factor de carga de 1,0 para los efectos resultantes de este fenómeno.


<!-- page 270 -->

El procedimiento de verificación de la rigidez combinada para sistemas de techo con miembros
primarios y secundarios se realizará de la siguiente forma:

   Con el índice de tensión Up calculado para la viga primaria se ingresa al gráfico de la Figura

<a id="c2.1"></a>
### 2.1 Se desplaza horizontalmente hasta encontrar la curva correspondiente al valor de Cs  <sub>p.271</sub>

    calculado para la viga secundaria. Desde el punto de intersección se baja hasta la escala
    de abscisas. Si el valor de la constante de flexibilidad Cp encontrado en el gráfico es mayor
    que el valor de Cp calculado para la viga primaria, la rigidez flexional combinada de las
    vigas primaria y secundaria es suficiente para prevenir la acumulación de agua. Si fuera
    menor, será necesario aumentar la rigidez de la viga primaria, de la viga secundaria, o de
    ambas a la vez.

    Utilizando la Figura 2.2. se deberá seguir un procedimiento similar al indicado
    precedentemente.

   Cuando el entramado del techo esté formado por un conjunto de vigas igualmente
    espaciadas apoyadas en muros, se considerará como formado por miembros secundarios
    apoyados sobre una viga primaria infinitamente rígida. Para ese caso se deberá utilizar la
    Figura 2.2. ingresando con el índice de tensión calculado Us. Se desplaza horizontalmente
    hasta interceptar la curva correspondiente a Cp = 0, y en la vertical del punto de
    intersección se determina el valor de Cs límite.

          Figura 2.1. Coeficiente de flexibilidad límite para sistemas primarios.

Reglamento CIRSOC 301 – 2018                                                     Apéndice 2 - 217


<!-- page 271 -->

La contribución de la deformación de la chapa de cubierta a la deformación total del panel de
techo (en ambos casos a los fines del efecto de acumulación de agua) es generalmente
pequeña por lo que en general es suficiente fijar un mínimo para su momento de inercia. Esa
limitación se expresa por la expresión (2.2.) que plantea :

                                             Id  0,4 S4 (10-8)

con:
       Id      el momento de inercia de la chapa de acero de cubierta apoyada en las vigas
               secundarias, en cm4/m.

       S       la separación de vigas secundarias, en cm.

Sin embargo puede ser necesario verificar la estabilidad contra la acumulación de agua de un
techo formado por chapas de cubierta con relación altura-luz relativamente pequeña, y que
apoyen sobre vigas apoyadas a su vez directamente sobre columnas. Esta verificación puede
realizarse con las Figuras 2.1. o 2.2. utilizando un Cs calculado con S = 100cm; siendo Ls la
distancia entre vigas (luz de la chapa) y Is = Id .

            Figura 2.2. Coeficiente de flexibilidad límite para sistemas secundarios.

            Para cerchas, vigas reticuladas y en general vigas de alma abierta el momento de
            inercia para incluir en las expresiones anteriores, será determinado considerando la
            deformación por corte del alma. En forma aproximada cuando el momento de inercia se
            calcula usando solo el área de los cordones, la reducción de momento de inercia por la
            deformación del alma puede ser tomada como un 15%.


<!-- page 272 -->
