# CIRSOC 301 (2018) — APÉNDICE 3. PROYECTO PARA CARGAS CÍCLICAS (FA

> Source: `CIRSOC 301-2018.pdf` · PDF pages 273–294
> Extraction: `pdftotext -layout` text layer, verbatim. No text was rewritten or inferred.

TIGA)

Este Apéndice es aplicable a miembros y uniones solicitados por cargas cíclicas
dentro del rango elástico de tensiones, de frecuencia e intensidad suficiente para
iniciar la fisuración y la falla progresiva que definen el estado límite de fatiga.

Su contenido se organiza de la siguiente manera:


<a id="c3.1"></a>
### 3.1 Especificaciones generales  <sub>p.273</sub>


<a id="c3.2"></a>
### 3.2 Determinación de las tensiones máximas y del rango de tensión  <sub>p.273</sub>


<a id="c3.3"></a>
### 3.3 Verificación del estado límite de fatiga para material base y juntas soldadas. Rango de  <sub>p.273</sub>

     tensión de diseño

<a id="c3.4"></a>
### 3.4 Verificación del estado límite de fatiga para bulones y partes roscadas. Rango de  <sub>p.273</sub>

     tensión de diseño

<a id="c3.5"></a>
### 3.5 Requerimientos especiales para fabricación y montaje.  <sub>p.273</sub>



<a id="c3.1"></a>
### 3.1 ESPECIFICACIONES GENERALES  <sub>p.273</sub>


Las especificaciones de este Apéndice son aplicables a tensiones determinadas por la acción
de cargas de servicio en combinaciones para estados límite de servicio. La máxima
tensión debida a cargas de servicio será menor o igual a 0,66 Fy.

El rango de tensión se define como la magnitud del cambio de tensión debido a la aplicación
y retiro de las sobrecargas útiles no mayoradas. En el caso de tensiones oscilatorias
alternadas el rango de tensión será calculado como la suma de los valores absolutos de la
máxima tensión repetida de tracción y de la máxima tensión repetida de compresión o por la
suma de los valores absolutos de las máximas tensiones de corte en sentidos opuestos, en
todos los casos en el punto de probable iniciación de la fisuración.

En el caso de juntas a tope con soldaduras a tope de penetración completa, el máximo
rango de tensión calculado por la expresión (3.1) será de explicación sólo para aquellas
soldaduras sin defectos que satisfagan los requerimientos de aceptación dados en las
Secciones 6.12.2. y 6.13.2. del Reglamento CIRSOC 304-2007.

No se evaluará la resistencia a los efectos de fatiga si el rango de tensión debido a las
sobrecargas útiles es menor que el umbral de rango de tensión, FTH, dado en la Tabla 3.1. de
este Apéndice.

No se evaluará la resistencia a los efectos de fatiga si el número de aplicaciones de las
sobrecargas útiles en la vida útil del elemento estructural considerado es menor que 2x104.

No se evaluará la resistencia a los efectos de fatiga en miembros de edificios solicitados por
acciones de viento especificadas por el Reglamento CIRSOC 102-2005.

Reglamento CIRSOC 301 – 2018                                                  Apéndice 3 - 219


<!-- page 273 -->

La resistencia a los efectos de fatiga determinada por las especificaciones de este
Apéndice será aplicable a estructuras con adecuada protección contra la corrosión y
sometidas a atmósferas poco corrosivas, tal como las condiciones atmosféricas normales.

La resistencia a los efectos de fatiga determinada por las especificaciones de este
Apéndice sólo será aplicable a estructuras sometidas a temperaturas menores o iguales que
150ºC.

El Proyectista deberá especificar ya sea los detalles completos incluyendo
dimensiones de soldaduras, o bien especificar los ciclos previstos en la vida útil y los
rangos máximos de momentos flectores, esfuerzos de corte y reacciones para las
uniones.


<a id="c3.2"></a>
### 3.2 CÁLCULO DE LA TENSIÓN MÁXIMA Y DEL RANGO DE TENSIÓN  <sub>p.274</sub>


La determinación de las tensiones se hará por análisis elástico. Las tensiones no serán
amplificadas por factores de concentración de tensiones resultantes de discontinuidades
geométricas.

Para bulones y barras roscadas sometidos a tracción axil, se incluirán en el cálculo de la
tensión los efectos de la acción de palanca, si ella existiera.

En el caso de tensión axil combinada con flexión, la máxima tensión de cada clase será
aquélla determinada por los efectos concurrentes de las cargas aplicadas.

Para miembros con secciones transversales simétricas, los pasadores y soldaduras serán
dispuestos simétricamente respecto de los ejes del miembro, o bien las tensiones
resultantes de la excentricidad serán incluidas en la determinación del rango de tensión.

Para miembros de ángulo simple donde el centro de gravedad de las soldaduras de unión se
ubica entre la línea del centro de gravedad de la sección transversal del ángulo y el eje de
gravedad del ala unida, se podrán ignorar los efectos de la excentricidad. Si el centro de
gravedad de las soldaduras de unión se ubica fuera de dicha zona, se deberán incluir en el
cálculo del rango de tensión las tensiones debidas al efecto de la excentricidad.


<a id="c3.3"></a>
### 3.3 VERIFICACIÓN DEL ESTADO LÍMITE DE FATIGA PARA MATERIAL BASE  <sub>p.274</sub>

     Y JUNTAS SOLDADAS. RANGO DE TENSIÓN DE DISEÑO

El rango de tensión bajo la acción de las cargas de servicio será menor o igual que el
rango de tensión de diseño, determinado según las siguientes especificaciones:

(a) Para Categorías de tensión A, B, B´, C, D, E y E´, el rango de tensión de diseño FSR
    será determinado por la expresión (3.1).

                                                         0 , 333
                                          327 C f   
                                  F SR                           F TH               (3.1)
                                                    
                                            N       


<!-- page 274 -->

  siendo:

         FSR el rango de tensión de diseño, en MPa.

         Cf    la constante obtenida de la Tabla 3.1. de este Apéndice según la categoría
               de tensión.

         N     - el número de variaciones del rango de tensión en la vida útil de la estructura.
               - el número de variaciones del rango de tensión por día x 365 x años de vida
                  útil.

         FTH el umbral de rango de tensión de fatiga, rango de tensión máximo para vida
             útil indefinida, obtenido de la Tabla 3.1., en MPa.

(b) Para categoría de tensión F, el rango de tensión de diseño FSR (MPa) será determinado
    por la expresión (3.2).

                                                            0 , 167
                                       11 x 10 4 C     
                                                   f   
                               F SR                                 F TH                    (3.2)
                                             N         
                                                       

(c) Para chapas traccionadas unidas con juntas en cruz, en Te o en ángulo, con soldaduras
    transversales a la dirección de la tensión del tipo a tope de penetración completa, a tope
    de penetración parcial, de filete o combinación de ellas, el rango de tensión de diseño en
    la sección transversal de la chapa traccionada cercana al pie de la soldadura, será
    determinado según las siguientes especificaciones:

    Basado en que la iniciación de la fisura se produce en el pie de la soldadura, el rango
     de tensión de diseño de la chapa traccionada, FSR, deberá ser determinado por la
     expresión (3.3), para Categoría C, lo que resulta:

                                                            0 , 333
                                       14 , 4 x 10 11 
                               F SR                                 68 , 9 MPa             (3.3)
                                                      
                                              N       

    Basado en que la iniciación de la fisura se produce en la raíz de la soldadura, cuando
     se usan soldaduras a tope de penetración parcial transversales, con o sin soldaduras
     de filete de refuerzo o contorno, el rango de tensión de diseño de la chapa traccionada
     en la sección transversal cercana al pie de la soldadura deberá ser determinado por la
     expresión (3.4), correspondiente a la Categoría C´:

                                                                      0 , 333
                                             14 , 4 x 10 11 
                               F SR  R JPP                                                   (3.4)
                                                            
                                                    N       

     siendo:

Reglamento CIRSOC 301 – 2018                                                         Apéndice 3 - 221


<!-- page 275 -->

          RJPP el factor de reducción para soldaduras transversales de penetración parcial
               (JPP) reforzadas o no reforzadas. Si RJPP = 1 se usará Categoría C:

                                                          
                                      2a               w 
                     1 , 12  1 , 01          1 , 24     
                                      tp               tp  
                                                           
                 =                                             x 0 , 68  1 , 0                     (3.5)
                                        0 , 167
                                     tp                        
                                                               
                                                              
                                                                

          2a      la longitud de la cara de la raíz no soldada en la dirección del espesor de la
                  chapa traccionada, en cm.

          w       el lado de la soldadura de filete de refuerzo o contorno, si existe, en la
                  dirección del espesor de la chapa traccionada, en cm.

          tp      el espesor de la chapa traccionada, en cm.

     Basado en que la iniciación de la fisura se produce desde las raíces del par de
      soldaduras transversales de filete ubicadas en lados opuestos de la chapa traccionada,
      el rango de tensión de diseño FSR de la sección transversal cercano al pie de las
      soldaduras deberá ser determinado por la expresión (3.6), correspondiente a la
      Categoría C´´:

                                                                           0 , 333
                                                   14 , 4 x 10 11 
                                     F SR  R FIL                                                   (3.6)
                                                                  
                                                          N       
      siendo:

               RFIL el factor de reducción para juntas que sólo usan un par de soldaduras de
                    filete transversales. Si RFIL = 1 se usará Categoría C.

                                                         
                                        0 , 10  1 , 24 w / t
                                                              p
                                                                     
                                     =                                x 0 , 68  1 , 0               (3.7)
                                                 tp
                                                    0 , 167
                                                                      
                                                                     


<a id="c3.4"></a>
### 3.4 VERIFICACIÓN DEL ESTADO LÍMITE DE FATIGA PARA BULONES Y  <sub>p.276</sub>

     PARTES ROSCADAS . RANGO DE TENSIÓN DE DISEÑO

El rango de tensión para cargas de servicio será menor o igual que el rango de tensión de
diseño determinado según las siguientes especificaciones :

(a) Para pasadores mecánicos en uniones sometidas a fuerzas de corte, el máximo rango
    de tensión en el material unido para cargas de servicio será menor o igual que el rango
    de tensión de diseño calculado con la expresión (3.1) donde Cf y FTH serán tomados de
    la Sección 2 de la Tabla 3.1. de este Apéndice.


<!-- page 276 -->

(b) Para bulones de alta resistencia, bulones comunes, y varillas de anclaje roscadas con
    roscas cortadas, laminadas o esmeriladas, el máximo rango de tensión de tracción en el
    área neta a tracción para fuerzas axiles y momento aplicadas y fuerzas resultantes del
    efecto de la acción de palanca, será menor o igual que el rango de tensión de diseño
    determinado con la expresión (3.8), (como para Categoría G). El área neta a tracción At ,
    en cm2 será calculada con la expresión (3.9).

                                                           0 , 333
                                       1 , 28 x 10 11 
                               F SR                                48                   (3.8)
                                                      
                                              N       

                               At 
                                      
                                           d  0 , 9382 P 
                                             b
                                                                 2
                                                                                            (3.9)
                                      4
  siendo:

         P     el paso de rosca, en cm / rosca.

         db    el diámetro nominal (diámetro del cuerpo o espiga), en cm.

Para juntas en las cuales el material dentro de la zona de apriete no se limita al acero, o
juntas que no son pretensadas con los requerimientos de la Tabla J.3.1. , todas las fuerzas
axiles y momentos aplicados más los efectos de la acción de palanca (si existe) se
supondrán tomados exclusivamente por los bulones o barras roscadas.

Para juntas en las cuales el material dentro de la zona de apriete es sólo acero y en las cuales
los pasadores son pretensados según lo especificado en la Tabla J.3.1., se permite usar un
análisis de la rigidez relativa de las partes unidas y de los bulones a fin de determinar el rango
de tensión de tracción en los bulones pretensados debidos a las fuerzas axiles y momentos
producidos por la totalidad de las sobrecargas útiles de servicio mas los efectos de la acción de
palanca (si existe). Alternativamente el rango de tensión en los bulones puede ser tomado
como el 20% del valor absoluto de la tensión en el área neta a tracción debida a la fuerza axil y
al momento producidos por la acción de las cargas de servicio permanentes, sobrecargas útiles
y otras cargas variables.


<a id="c3.5"></a>
### 3.5 REQUERIMIENTOS ESPECIALES PARA FABRICACIÓN Y MONTAJE  <sub>p.277</sub>


Si se utilizan barras longitudinales de respaldo se permite que permanezcan en su lugar, pero
ellas deberán ser continuas. Si es necesario empalmarlas en juntas largas, las barras serán
unidas a tope con soldaduras de penetración completa y el refuerzo será pulido antes del
armado de la junta. Los respaldos laterales, si son dejados en su lugar deberán estar unidos
por soldaduras de filete.

En uniones transversales sometidas a tracción, si se usan barras de respaldo, ellas deberán
ser removidas y la junta respaldada escarificada y soldada.

En soldaduras transversales a tope de penetración completa en juntas en ángulo o en Te, en
los ángulos entrantes serán agregadas soldaduras de filete de refuerzo de no menos de 6mm
de lado.

Reglamento CIRSOC 301 – 2018                                                     Apéndice 3 - 223


<!-- page 277 -->

Las superficies rugosas de los bordes cortados a soplete sujetos a rangos de tensión de
tracción significativos deberán tener un esmerilado menor o igual que 25 m (1000in), donde
la referencia estándar será ASME B46.1.

Los ángulos entrantes de cortes, rebajes y agujeros de acceso para soldar serán ejecutados
con radios mayores o iguales a 10 mm por taladrado o punzonado y posterior escariado del
agujero, o por corte térmico que forme el radio del corte. Si el radio es formado por corte
térmico la superficie del corte será esmerilada hasta dejar la superficie brillante.

Para juntas a tope transversales en zonas de alta tensión de tracción, se usarán chapas de
respaldo de inicio para permitir la terminación de la soldadura fuera de los extremos de la junta.
Las chapas de respaldo de inicio deberán ser removidas y el extremo de la soldadura será
nivelado con el borde de las chapas. No se permite el uso de topes extremos alineados con los
bordes de las chapas.

Para los requerimientos de retornos extremos de soldaduras de filete sometidas a cargas
cíclicas de servicio, ver la Sección J.2.2.(b) (Terminaciones de soldaduras de filete).


<!-- page 278 -->

Tabla 3.1. Parámetros para el proyecto para fatiga

                Descripción                       Categoría de   Constante   Umbral    Punto potencial de
                                                    tensión         Cf        FTH       inicio de fisura
                                                                             (MPa)

SECCIÓN 1. MATERIAL PLANO FUERA DE CUALQUIER SOLDADURA


<a id="c1.1"></a>
### 1.1 Metal base, excepto aceros resistentes                                           Fuera de toda soldadura  <sub>p.279</sub>

a la corrosión no bañados, con superficie                                             o unión estructural
laminada o limpia. Bordes cortados a soplete
                                                       A         250 x108     165
con superficie esmerilada con valor menor o
igual a 25m, con extremos sin ángulos
entrantes.
                                                                        8

<a id="c1.2"></a>
### 1.2 Metal base acero resistente a la corrosión        B          120x10      110     Fuera de toda soldadu-  <sub>p.279</sub>

no bañado con superficie laminada o limpia.                                           ra o unión estructural
Bordes cortados a soplete con superficie
esmerilada con valor menor o igual a 25m,
con extremos sin ángulos entrantes.

<a id="c1.3"></a>
### 1.3 Elementos con agujeros taladrados o               B          120x108     110     Cerca de cualquier bor-  <sub>p.279</sub>

escariados. Elementos con ángulos entrantes                                           de externo o períme-
en cortes, rebajes, bloques salientes u otra                                          tro de agujero
discontinuidad geométrica ejecutada según las
especificaciones de la Sección 3.5., excepto
agujeros de acceso.

<a id="c1.4"></a>
### 1.4 Secciones transversales laminadas con             C          44x108       69     Cerca de los ángulos  <sub>p.279</sub>

agujeros de acceso para soldar ejecutados                                             entrantes de los aguje-
según las especificaciones de la Sección                                              ros de acceso o de
J.1.6. y de la Sección 3.5.. Barras con agu-                                          cualquier pequeño agu-
jeros taladrados o escariados para bulones de                                         jero (puede contener
unión de arriostramientos ligeros donde existe                                        bulones para uniones
una pequeña componente longitudinal de la                                             menores).
fuerza de la riostra.

SECCION 2. MATERIAL UNIDO EN UNIONES CON PASADORES MECÁNICOS


<a id="c2.1"></a>
### 2.1 Área bruta del metal base en juntas                                              A lo largo de la sección  <sub>p.279</sub>

traslapadas unidas con bulones de alta                                                bruta cerca del agujero.
resistencia en uniones que cumplen todas               B          120x108     110
las especificaciones de las uniones de
deslizamiento crítico.

<a id="c2.2"></a>
### 2.2 Metal base en la sección neta de la               B          120x108     110     En la sección neta ori-  <sub>p.279</sub>

unión con bulones de alta resistencia diseña-                                         ginada al lado del agu-
dos en base a resistencia a corte pero fa-                                            jero
bricados e instalados con los requerimientos
de las uniones de deslizamiento crítico.

<a id="c2.3"></a>
### 2.3 Metal base en la sección neta de otras            D          22x108       48     En la sección neta ori-  <sub>p.279</sub>

uniones con pasadores mecánicos excepto                                               ginada al lado del agu-
barras de ojo y barras unidas por perno.                                              jero.

<a id="c2.4"></a>
### 2.4 Metal base en la sección neta de barras           E          11x108       31     En la sección neta ori-  <sub>p.279</sub>

de ojo y barras unidas por perno.                                                     ginada al lado del agu-
                                                                                      jero.

Reglamento CIRSOC 301 – 2018                                                               Apéndice 3 - 225


<!-- page 279 -->

Tabla 3.1. (continuación) Parámetros para el proyecto para fatiga


<!-- page 280 -->

Tabla 3.1. (continuación) Parámetros para el proyecto para fatiga

Reglamento CIRSOC 301 – 2018                                        Apéndice 3 - 227


<!-- page 281 -->

Tabla 3.1. (continuación) Parámetros para el proyecto para fatiga
                                                 Categoría    Constante     Umbral      Punto potencial
                Descripción                      de tensión       Cf         FTH       de inicio de fisura
                                                                            (MPa)

SECCION 3. COMPONENTES DE UNIONES SOLDADAS DE BARRAS ARMADAS


<a id="c3.1"></a>
### 3.1 Metal base y metal de aporte en barras                                          Desde la superficie o  <sub>p.282</sub>

sin piezas accesorias unidas, armadas con                                            discontinuidades inter-
chapas o perfiles, unidos por soldaduras lon-                                        nas en la soldadura
                                                     B         120x108       110
gitudinales: continuas a tope de penetración                                         fuera del extremo de la
completa, respaldo retomado y soldado por el                                         misma.
revés, o por soldaduras de filete continuas.

<a id="c3.2"></a>
### 3.2 Metal base y metal de aporte en barras                                          Desde la superficie o  <sub>p.282</sub>

sin piezas accesorias unidas, armadas con                                            discontinuidades inter-
chapas o perfiles, unidos por soldaduras lon-                                        nas en la soldadura in-
                                                     B´         61x108        83
gitudinales: continuas a tope de penetración                                         cluidas las soldaduras
completa con barras de respaldo no removidas                                         de unión de las barras
o continuas a tope de penetración parcial.                                           de respaldo.

<a id="c3.3"></a>
### 3.3 Metal base y metal de aporte en la ter-                                         Desde la terminación  <sub>p.282</sub>

                                                                     8
minación de soldaduras longitudinales cerca          D          22x10         48     de la soldadura dentro
de agujeros de acceso en barras armadas.                                             del alma o ala.

<a id="c3.4"></a>
### 3.4 Metal base cerca de los extremos de los                                         En el material unido en  <sub>p.282</sub>

segmentos de soldaduras de filete intermi-           E          11x108        31     el comienzo y en sito
tentes.                                                                              de soldadura.

<a id="c3.5"></a>
### 3.5 Metal base en los extremos de plata-                                            En ala en el pie de la  <sub>p.282</sub>

bandas de longitud parcial y mas angostas                                            soldadura extrema, o
que el ala que tengan extremos en ángulo                                             en ala en el final de la
recto o de ancho variable, con o sin soldadu-                                        soldadura longitudinal,
ras transversales; o platabandas mas anchas                                          o en el borde del ala en
que el ala, con soldaduras transversales en el                                       contacto con el ancho
extremo.                                            E           11x108        31     de la platabanda.
Espesor del ala  2 cm
                                                    E´         3,9x108        18
Espesor del ala > 2cm


<a id="c3.6"></a>
### 3.6 Metal base en los extremos de                                                   En el borde del ala cer-  <sub>p.282</sub>

platabandas de longitud parcial, mas anchas                             8            ca del extremo de la
                                                     E´        3,9x10         18
que el ala, sin soldaduras transversales en el                                       soldadura de la plata-
extremo.                                                                             banda.

SECCION 4. SOLDADURAS LONGITUDINALES DE FILETE EN UNIONES EXTREMAS


<a id="c4.1"></a>
### 4.1 Metal base en empalmes de barras                                                Iniciación desde el  <sub>p.282</sub>

axilmente cargadas con soldaduras longitudi-                                         extremo de cualquier
nales en las uniones extremas. Las soldaduras                                        terminación de sol-
se ubicarán a cada lado del eje de la barra de                                       dadura extendiéndose
manera que la tensión en la soldadura resulte                                        dentro del metal base.
balanceada.
t  1,2 cm                                           E         11x108         31
t > 1,2 cm                                           E’        3,9x108        18


<!-- page 282 -->

Tabla 3.1. (continuación) Parámetros para el proyecto para fatiga
                                                                          Umbral
                Descripción                       Categoría   Constante    FTH         Punto potencial
                                                 de Tensión      Cf       (MPa)       de inicio de fisura

SECCION 5. SOLDADURAS TRANSVERSALES A LA DIRECCIÓN DE LA TENSIÓN


<a id="c5.1"></a>
### 5.1 Metal base y metal de aporte en o                                             Desde discontinuidades  <sub>p.283</sub>

adyacencias a empalmes soldados a tope                                             internas del metal de
con penetración completa en secciones                                              aporte o a lo largo del
laminadas o armadas soldadas, con meca-                                            límite de fusión.
nizado de la soldadura fundamentalmente
                                                     B         120x108     110
paralelo a la dirección de la tensión y con
calidad garantizada por inspección radiográ-
fica o ultrasónica de acuerdo con los artícu-
los 6.12. o 6.13. del Reglamento CIRSOC
304-2007

<a id="c5.2"></a>
### 5.2 Metal base y metal de aporte en o                                             Desde discontinuidades  <sub>p.283</sub>

adyacencias a empalmes soldados a tope                                             internas del metal de
con penetración completa, con mecanizado                                           aporte o a lo largo del
de la soldadura fundamentalmente paralelo a                                        límite de fusión o en el
la dirección de la tensión, en transiciones de                                     inicio de la transición
espesor o de ancho con pendiente menor o                                           cuando Fy  620 MPa
igual a 1 en 2,5.
                                                                     8
                                                     B         120x10      110
Fy < 620 MPa

Fy  620 MPa                                         B’        61x108       83


<a id="c5.3"></a>
### 5.3 Metal base con Fy menor o igual que                                           Desde discontinuidades  <sub>p.283</sub>

620 MPa y metal de aporte, en o las                                                internas del metal de
adyacencias de empalmes soldados a tope                                            aporte o a lo largo del
con penetración completa con mecanizado                                            límite de fusión.
de la soldadura fundamentalmente paralelo a          B         120x108     110
la dirección de la tensión, en transiciones de
ancho con radio menor o igual que 600 mm,
con el punto de tangencia cercano al
extremo de la soldadura.

<a id="c5.4"></a>
### 5.4 Metal base y metal de aporte en o las                                         Desde la superficie de la  <sub>p.283</sub>

adyacencias del pie de la soldadura a tope                                         discontinuidad en el pie
de penetración completa en empalmes o en                                           de la soldadura exten-
juntas en Te o en ángulo, con o sin transi-          C         44x108       69     diéndose dentro del me-
ción en espesor con pendiente menor o igual                                        tal base o a lo largo del
a 1 en 2,5, con soldadura de refuerzo no                                           límite de fusión.
removida.

Reglamento CIRSOC 301 – 2018                                                             Apéndice 3 - 229


<!-- page 283 -->

Tabla 3.1. (continuación) Parámetros para el proyecto para fatiga


<!-- page 284 -->

Tabla 3.1. (continuación) Parámetros para el proyecto para fatiga
                                                                               Umbral
                  Descripción                          Categoría   Constante    FTH         Punto potencial
                                                      de Tensión      Cf       (MPa)       de inicio de fisura

SECCION 5. SOLDADURAS TRANSVERSALES A LA DIRECCIÓN DE LA TENSIÓN


<a id="c5.5"></a>
### 5.5 Metal base y metal de aporte en unio-nes                                            Iniciación desde discon-  <sub>p.285</sub>

extremas transversales de chapas trac-                                                   tinuidades geométricas
cionadas con soldaduras a tope de pene-                                                  en el pie de la soldadura
tración parcial o en juntas en Te o en ángulo,                                           extendida dentro del
con soldaduras de filete de refuerzo o                                                   metal base, o iniciación
contorno. FSR será el menor de los rangos de                                             en la raíz sometida a
tensión entre los de inicio de la fisura en el pie                                       tracción extendida hacia
o inicio de la fisura en la raíz.                                                        arriba y luego hacia
                                                                                         afuera a través de la
                                                                         8
Iniciación de la fisura desde el pie:                     C         44x10        69      soldadura.

Iniciación de la fisura desde la raíz:                    C´       Expresión      No
                                                                     (3.4)     propor-
                                                                               cionado

<a id="c5.6"></a>
### 5.6 Metal base y metal de aporte en uniones                                             Iniciación desde discon-  <sub>p.285</sub>

extremas transversales de chapas tracciona-                                              tinuidad geométrica en
das usando un par de soldaduras de filete                                                el pie de la soldadura
ubicadas en lados opuestos de la chapa. FSR                                              extendida dentro del
será el menor de los rangos de tensión entre                                             metal base o iniciación
los de inicio de la fisura en el pie o inicio de la                                      en la raíz sometida a
fisura en la raíz.                                                                       tracción extendida hacia
                                                                                         arriba y luego hacia
Inicio de la fisura desde el pie:                         C         44x108       69      afuera a través de la
                                                                                         soldadura.
Inicio de la fisura en la raíz:                           C´´      Expresión      No
                                                                     (3.5)     propor-
                                                                               cionado

<a id="c5.7"></a>
### 5.7 Metal base de chapas traccionadas y en                                              Desde      discontinuidad  <sub>p.285</sub>

almas y alas de vigas laminadas y armadas,                                               geométrica en el pie del
en el pie de las soldaduras transversales de              C         44x108       69      filete extendida dentro
filete adyacentes a rigidizadores transver-                                              del metal base.
sales soldados.

Reglamento CIRSOC 301 – 2018                                                                   Apéndice 3 - 231


<!-- page 285 -->

TABLA 3.1. (continuación) Parámetros para el proyecto para fatiga


<!-- page 286 -->

TABLA 3.1. (continuación) Parámetros para el proyecto para fatiga

                                                                           Umbral
                Descripción                       Categoría   Constante     FTH         Punto potencial
                                                 de Tensión      Cf        (MPa)       de inicio de fisura

SECCION 6. METAL BASE EN UNIONES SOLDADAS DE BARRAS TRANSVERSALES


<a id="c6.1"></a>
### 6.1 Metal base de piezas accesorias unidas                                         Cerca del punto de tan-  <sub>p.287</sub>

por soldaduras a tope de penetración                                                gencia del radio en el
completa sometidas a cargas longitudinales                                          borde de la barra.
sólo cuando la pieza accesoria se une con
un radio de transición R, y con la soldadura
pulida.

R  600mm
                                                                       8
                                                     B         120x10       110
                                                                    8
600 mm > R  150 mm                                  C         44x10         69

150 mm > R  50 mm                                   D         22x108        48

50 mm > R                                            E         11x108        31


<a id="c6.2"></a>
### 6.2 Metal base de piezas accesorias de igual  <sub>p.287</sub>

espesor unidas con soldadura a tope de
penetración completa sometidas a cargas
transversales con o sin cargas longitudinales,
cuando la pieza accesoria se une con un radio
de transición R, y con la soldadura pulida y
con calidad garantizada por inspección
radiográfica o ultrasónica de acuerdo con los
artículos 6.12. o 6.13. del Reglamento
CIRSOC 304-2007
                                                                                    Cerca de los puntos de
-Cuando la placa de respaldo sea removida:                     120x108      110     tangencia del radio o en
R  600 mm                                           B                              la soldadura o en el límite
                                                               44x108        69     de fusión o en la barra o
600 mm > R  150 mm                                  C
                                                                    8
                                                                                    en la pieza accesoria.
                                                               22x10         48
150 mm > R  50 mm                                   D
                                                               11x108        31
50 mm > R                                            E

- Cuando la placa de respaldo no sea                                                En el pie de la soldadura
removida:                                                      44x108        69     a lo largo de cualquiera
R  600 mm                                           C
                                                                    8
                                                                                    de los bordes de la barra
                                                               44x10         69     o de la pieza accesoria.
600 mm > R  150 mm                                  C
                                                               22x108        48
150 mm > R  50 mm                                   D
                                                               11x108        31
50 mm > R                                            E

Reglamento CIRSOC 301 – 2018                                                               Apéndice 3 - 233


<!-- page 287 -->

Tabla 3.1. (continuación) Parámetros para el proyecto para fatiga


<!-- page 288 -->

Tabla 3.1. (continuación) Parámetros para el proyecto para fatiga
                                                                           Umbral
                Descripción                        Categoría   Constante    FTH         Punto potencial
                                                  de Tensión      Cf       (MPa)       de inicio de fisura

SECCIÓN 6. METAL BASE EN UNIONES SOLDADAS DE BARRAS TRANSVERSALES


<a id="c6.3"></a>
### 6.3 Metal base de piezas accesorias de  <sub>p.289</sub>

distinto espesor unidas por soldaduras a
tope de penetración completa sometidas a
cargas transversales con o sin cargas
longitudinales cuando la pieza accesoria se
une con un radio de transición R, y con la
soldadura pulida y con calidad garantizada
por inspección radiográfica o ultrasónica de
acuerdo con los artículos 6.12. o 6.13. del

-Cuando la placa de respaldo sea removida:

R > 50 mm                                                                           Al pie de la soldadura a
                                                                     8
                                                      D         22x10        48     lo largo del borde del
                                                                                    material mas delgado.
R  50 mm                                                                           En la terminación de la
                                                                     8              soldadura en el radio
                                                      E         11x10        31
                                                                                    pequeño.

-Cuando la placa de respaldo no sea                                                 Al pie de la soldadura a
removida:                                                                           lo largo del borde del
                                                                     8
                                                      E         11x10        31     material mas delgado
-Cualquier radio:


<a id="c6.4"></a>
### 6.4 Metal base sometido a tensión longitudinal                                     En la terminación de la  <sub>p.289</sub>

en el elemento transversal, con o sin tensión                                       soldadura o desde el pie
transversal, unido por soldaduras de filete o                                       de la soldadura extendi-
soldadura a tope de penetración parcial,                                            da dentro del elemento.
paralelas a la dirección de la tensión, cuando
la pieza accesoria se une con un radio de
transición R, y con la soldadura pulida:

R > 50 mm                                             D         22x108       48

R  50 mm                                             E         11x108       31

Reglamento CIRSOC 301 – 2018                                                              Apéndice 3 - 235


<!-- page 289 -->

Tabla 3.1. (continuación) Parámetros para el proyecto para fatiga

                                                                                   Umbral
                  Descripción                        Categoría      Constante       FTH           Punto potencial
                                                    de Tensión         Cf          (MPa)         de inicio de fisura

SECCIÓN 7. METAL BASE EN PIEZAS ACCESORIAS CORTAS (1)


<a id="c7.1"></a>
### 7.1 Metal base sometido a cargas longi-                                                     Inicio en el metal base en  <sub>p.290</sub>

tudinales en piezas accesorias unidas por                                                    la terminación de la sol-
soldaduras a tope de penetración completa                                                    dadura o en el pie de la
paralelas a la dirección de la tensión cuando                                                soldadura extendiéndose
la pieza accesoria se une con un radio de                                                    en dirección al metal ba-
transición R menor que 50 mm, siendo a la                                                    se.
longitud de la pieza accesoria en la direc-
ción de la tensión, y b la altura de la pieza
accesoria normal a la superficie de la barra :
                                                                             8
a < 50 mm                                               C             44x10           69

50 mm  a  menor valor entre 12 b o 100                D             22x108          48
mm
                                                        E             11x108          31
a > 100 mm
cuando b  20 mm
                                                         E´           3,9x108         18
a > menor valor entre12 b ó 100 mm
cuando b > 20 mm


<a id="c7.2"></a>
### 7.2 Metal base sometido a cargas                                                            En la terminación de la  <sub>p.290</sub>

longitudinales en piezas accesorias unidas                                                   soldadura extendida den-
por soldaduras de filete o a tope de penetra-                                                tro del metal base.
ción parcial, con o sin cargas transversales
en la pieza accesoria, cuando ella se une
con un radio de transición R, y con la
soldadura pulida:
                                                                             8
R > 50 mm                                                D            22x10           48

R  50 mm                                                E            11x108          31

(1)   Pieza accesoria corta se define como cualquier pieza accesoria de acero soldada a la barra, la cual por su simple
      presencia e independientemente de sus cargas, crea una discontinuidad en el flujo de tensiones en la barra y de esa
      manera reduce la resistencia a fatiga.


<!-- page 290 -->

Tabla 3.1. (continuación) Parámetros para el proyecto para fatiga

Reglamento CIRSOC 301 – 2018                                        Apéndice 3 - 237


<!-- page 291 -->

Tabla 3.1. (continuación) Parámetros para el proyecto para fatiga
                                                                          Umbral
                Descripción                       Categoría   Constante    FTH         Punto potencial
                                                 de Tensión      Cf       (MPa)       de inicio de fisura

SECCIÓN 8. VARIOS


<a id="c8.1"></a>
### 8.1 Metal base con pernos de corte unidos                                         En el pie de la soldadura  <sub>p.292</sub>

por soldadura de filete o soldadura eléctrica                       8              en el metal base.
                                                     C         44x10        69
del perno.


<a id="c8.2"></a>
### 8.2 Corte en garganta de soldaduras de                                            En la raíz de la soldadura  <sub>p.292</sub>

                                                               150x1010
filete continua o intermitente, longitudinal o                                     de filete y se extiende en
                                                     F        Expresión     55
transversal.                                                                       la soldadura.
                                                                 (3-2)

<a id="c8.3"></a>
### 8.3 Metal base en soldaduras de tapón o de                                 31     En el extremo de la sol-  <sub>p.292</sub>

                                                     E         11x108
muesca.                                                                            dadura en el metal base.

<a id="c8.4"></a>
### 8.4 Corte en soldaduras de tapón o de                         150x1010            En la superficie de  <sub>p.292</sub>

muesca.                                              F        Expresión     55     contacto extendiéndose
                                                                 (3-2)             en la soldadura.

<a id="c8.5"></a>
### 8.5 Bulones de alta resistencia no                                                En la raíz de la rosca  <sub>p.292</sub>

totalmente pretensados, bulones comunes y                                          extendida dentro del área
varillas roscadas con rosca cortada,                                               traccionada.
esmerilada o laminada.
El rango de tensión en el área neta                  G         3,9x108      48
traccionada será el debido a la sobrecarga
útil mas el efecto de la acción de palanca, si
ella existiera.


<!-- page 292 -->

Tabla 3.1. (continuación) Parámetros para el proyecto para fatiga

Reglamento CIRSOC 301 – 2018                                        Apéndice 3 - 239


<!-- page 293 -->



<!-- page 294 -->
