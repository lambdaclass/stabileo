# CIRSOC 301 (2018) — CAPÍTULO D. PROYECTO DE MIEMBROS TRACCIONA

> Source: `CIRSOC 301-2018.pdf` · PDF pages 87–94
> Extraction: `pdftotext -layout` text layer, verbatim. No text was rewritten or inferred.

DOS

Las especificaciones de este Capítulo son aplicables a miembros prismáticos sometidos a
tracción por fuerzas estáticas actuando según el eje que pasa por los centros de
gravedad de las secciones transversales (tracción axil).

Su contenido está organizado de la siguiente manera:

D.1. Límites de esbeltez
D.2. Resistencia de diseño a tracción
D.3. Área neta efectiva
D.4. Barras armadas
D.5. Barras unidas por pasadores
D.6. Barras de ojo.

   Para miembros sometidos a acciones cíclicas (fatiga), ver la Sección B.3.9.

   Para miembros sometidos a una combinación de tracción axil y flexión ver el Capítulo H.

   Para barras roscadas ver la Sección J.3.

   Para la resistencia de diseño a tracción de los elementos auxiliares de una unión (por
    ejemplo chapas de nudo), ver la Sección J.4.1.

   Para la resistencia de diseño a la rotura de bloque de corte en las uniones extremas de
    miembros traccionados, ver la Sección J.4.3.

   Para miembros traccionados con almas de altura variable ver la Recomendación
    CIRSOC 301-1.

D.1. LÍMITES DE ESBELTEZ

En miembros traccionados la esbeltez (kL/ r) será menor o igual que 300. La limitación
anterior no se aplica para cables y secciones circulares macizas en tracción, los que deberán
tener una pretensión que garantice su entrada en tracción al actuar las cargas de servicio.

En presencia de acciones dinámicas, excepto viento, el límites anterior se reducirá a 250.

D.2. RESISTENCIA DE DISEÑO A TRACCIÓN

La resistencia de diseño de miembros traccionados, t Pn (kN) será el menor valor obtenido
de la consideración de los estados límites de (a) fluencia en la sección bruta; (b) rotura en la
sección neta.

Reglamento CIRSOC 301-2018                                                           Cap. D - 33


<!-- page 87 -->

(a) Para fluencia en la sección bruta:

              t = 0,90                   Pn = Fy Ag (10-1)                             (D.2.1)

(b) Para rotura en la sección neta:

              t = 0,75                   Pn = Fu Ae (10-1)                             (D.2.2)

siendo:

          Pn la resistencia nominal a la tracción axil, en kN.

          Fy la tensión de fluencia mínima especificada, en MPa.

          Fu la tensión de rotura a tracción especificada, en MPa.

          Ag el área bruta del miembro, en cm².

          Ae el área neta efectiva del miembro, en cm².

Cuando miembros sin agujeros se unan totalmente mediante cordones de soldadura, el área
neta efectiva usada en la expresión (D.1.2) será la definida en la Sección D.3.. Cuando existan
agujeros en un miembro unido en sus extremos por cordones de soldadura o en el caso que la
unión sea realizada por soldaduras de tapón o de muesca, en la expresión (D.1.2) se utilizará el
área neta de la sección a través de los agujeros.

D.3. ÁREA NETA EFECTIVA

El área bruta Ag y el área neta An de la sección transversal de un miembro se determinará
con las especificaciones de la Sección B.4.2.

El área neta efectiva Ae para miembros traccionados será determinada de la siguiente
manera:

(1) Cuando la fuerza de tracción se transmita directamente por cada uno de los
    elementos de la sección transversal mediante pasadores o cordones de soldadura, el
    área neta efectiva Ae será igual al área neta An.

(2) Cuando la fuerza de tracción se transmita a través de algunos, pero no de todos,
    los elementos de la sección transversal mediante pasadores o cordones de soldadura, el
    área neta efectiva Ae será determinada de la siguiente forma:

   (a) Cuando la fuerza de tracción se transmita sólo por pasadores:

                  Ae = An U                                                             (D.3.1)

        siendo:
                  U       el coeficiente de reducción = 1  ( x / L )  0 ,9            (D.3.2)


<!-- page 88 -->

                 x      la excentricidad de la unión. (distancia entre el plano de la unión y el
                        centro de gravedad de la sección por la que va la fuerza a trasmitir),
                        en cm.

                L      la longitud de la unión en la dirección de la fuerza, en cm.

       Para ejemplos de x y L ver la Figura D.3.1(a) hasta (d).

       Si existe sólo una fila de bulones Ae = área neta de los elementos directamente
       unidos

   (b) Cuando la fuerza de tracción se transmita desde un elemento (que no sea una
       chapa plana) sólo mediante cordones longitudinales de soldadura, o mediante
       cordones de soldadura longitudinales combinados con cordones transversales
       (Figura D.3.1(e)) :

                Ae = Ag U                                                                                     (D.3.3)

      siendo:
                U el coeficiente de reducción = 1  ( x / L )  0 ,9                                          (D.3.2)

                Ag el área bruta de la barra, en cm2.

   (c) Cuando la fuerza de tracción se transmita sólo por cordones de soldadura
       transversales:

                Ae = A U                                                                                      (D.3.4)

      siendo:
                A el área de los elementos unidos directamente, en cm2.

                U = 1,0.

   (d) Cuando la fuerza de tracción se transmita por una chapa plana sólo mediante
       cordones de soldadura longitudinales a lo largo de ambos bordes próximos al
       extremo de la chapa, debe ser L  w (Figura D.3.1(f)) y:

                Ae = Ag U                                                                                     (D.3.5)

       siendo:         Para L  2 w ............................................................... U = 1,0
                       Para 2 w > L  1,5 w .................................................. U = 0,87
                       Para 1,5 w > L  w .................................................... U = 0,75

       siendo:
              L la longitud de cada cordón de soldadura, en cm.

                w el ancho de la chapa (distancia entre los cordones de soldadura), en cm.

Reglamento CIRSOC 301-2018                                                                              Cap. D - 35


<!-- page 89 -->

                              Figura D.3.1. Determinación de x y L .


<!-- page 90 -->

   Se permiten valores mayores para U cuando ellos sean justificados por ensayos u otro
    criterio racional.
   Para secciones abiertas tales como doble Te, canales, Tes y ángulos simples o dobles el
    factor de reducción U no será menor que la relación entre el área bruta del elemento
    unido y el área bruta de la sección de la barra.
   Para calcular el área neta efectiva de elementos auxiliares de una unión ver la Sección
    J.4.1.
   Para calcular el área neta efectiva de secciones tubulares ver el Reglamento CIRSOC
    302-2005.

D.4. BARRAS ARMADAS

Para determinar las limitaciones para el espaciamiento longitudinal de los medios de
unión entre elementos en contacto continuo, tales como una chapa y un perfil, o dos chapas,
ver Sección J.3.5.

La separación longitudinal de los medios de unión entre los elementos unidos en contacto
continuo será tal que la relación de esbeltez de cada componente entre medios de unión sea
menor o igual a 300.

En los lados abiertos de barras armadas traccionadas se pueden utilizar platabandas
perforadas o presillas. (Figura D.4.1). Las presillas tendrán una longitud mayor o igual a 2/3 de
la distancia entre los cordones de soldadura o las líneas de remaches o bulones que las unen a
los componentes de la barra armada. El espesor de las presillas será mayor o igual a 1/50 de
dicha distancia. La separación longitudinal de los cordones de soldadura intermitentes o de los
pasadores de las presillas no deberá superar los 15 cm. El espaciamiento entre presillas será
tal que la esbeltez local de los componentes sea menor o igual a 300.

D.5. BARRAS UNIDAS CON PERNO

D.5.1. Resistencia de diseño

La resistencia de diseño de una barra unida mediante perno,  Pn será el menor valor de los
correspondientes a los siguientes estados límites:

(a) Tracción sobre el área neta efectiva:

                = t = 0,75
               Pn = 2 t beff Fu (10-1)                                                   (D.5.1)

(b) Corte sobre el área efectiva:

                = sf = 0,75
               Pn = 0,6 Asf Fu (10-1)                                                    (D.5.2)

(c) Para aplastamiento en el área proyectada del perno ver Sección J.7.

(d) Para fluencia en el área bruta de la barra, utilizar la expresión (D.2.1).

Reglamento CIRSOC 301-2018                                                           Cap. D - 37


<!-- page 91 -->

                           Figura D.4.1. Barras armadas traccionadas.

    siendo:

              a   la menor distancia desde el borde del agujero hasta el borde de la barra, medida
                  en dirección paralela a la dirección de la fuerza, en cm.

              Asf = 2 t ( a + d/2 ), en cm².

              beff = 2 t + 1,6 (dimensiones en cm) pero no mayor que la distancia real desde el
                   borde del agujero al borde de la barra, medida en dirección normal a la de la
                   fuerza aplicada.


<!-- page 92 -->

           d el diámetro del perno, en cm.

           t   el espesor de la chapa, en cm.

           Pn la resistencia nominal, en kN.

           Fu la tensión de rotura a la tracción especificada del acero, en MPa.

D.5.2. Especificaciones sobre detalles y dimensiones (Figura D.5.1)

El agujero para el perno se ubicará centrado con respecto a los bordes de la barra, en
dirección normal a la fuerza aplicada. Cuando esté previsto que el perno permita
movimientos relativos entre las partes unidas bajo la carga total, el diámetro del agujero no
será mayor que el diámetro del perno mas 1 mm.

El ancho de la chapa detrás del agujero será mayor o igual a beff + d. La mínima longitud a
detrás del extremo apoyado del agujero y medida en dirección paralela al eje de la barra,
será mayor o igual a 1,33 beff .

Las esquinas, por detrás del agujero, podrán cortarse a 45º respecto del eje de la barra,
siempre que el área neta detrás del agujero y en un plano perpendicular al corte, sea mayor
o igual que la requerida por detrás del agujero y en dirección paralela al eje de la barra.

       Figura D.5.1. Especificaciones dimensionales. Barras unidas por pernos.

D.6. BARRAS DE OJO

D.6.1. Resistencia de diseño a tracción

La resistencia de diseño a tracción de las barras de ojo se determinará de acuerdo con la
Sección D.2. tomando como Ag el área de la sección transversal del cuerpo de la barra.

Reglamento CIRSOC 301-2018                                                         Cap. D - 39


<!-- page 93 -->

Para propósitos de cálculo el ancho del cuerpo de la barra de ojo será menor o igual que 8
veces su espesor.

D.6.2. Especificaciones sobre detalles y dimensiones. (Figura D.6.1)

Las barras de ojo serán de espesor uniforme, sin refuerzos en la zona del agujero, y tendrán
cabezas circulares con perímetro concéntrico con el agujero.

El radio de transición entre la cabeza circular y el cuerpo de la barra será mayor o igual que
el diámetro de la cabeza.

El diámetro del perno será mayor o igual que 7/8 del ancho del cuerpo de la barra de ojo. El
diámetro del agujero para el perno no excederá en mas de 1 mm el diámetro del perno.

Para aceros con tensión de fluencia Fy > 485 MPa, el diámetro del agujero será menor o
igual que 5 veces el espesor de la chapa y el ancho del cuerpo de la barra de ojo será
reducido en concordancia con esa limitación.

Se permiten espesores menores a 13 mm sólo si se utilizan tuercas externas para mantener
todas las partes unidas apretadas y en contacto.

El ancho b desde el borde del agujero al borde de la chapa, medido perpendicularmente a la
dirección de la fuerza, será mayor que 2/3 y, a los efectos del cálculo, menor o igual que 3/4
del ancho del cuerpo de la barra de ojo.

                Figura D.6.1. Especificaciones dimensionales. Barras de ojo.


<!-- page 94 -->
