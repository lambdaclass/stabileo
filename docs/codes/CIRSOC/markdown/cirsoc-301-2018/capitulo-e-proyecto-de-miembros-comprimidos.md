# CIRSOC 301 (2018) — CAPÍTULO E. PROYECTO DE MIEMBROS COMPRIMIDOS

> Source: `CIRSOC 301-2018.pdf` · PDF pages 95–126
> Extraction: `pdftotext -layout` text layer, verbatim. No text was rewritten or inferred.

Las especificaciones de este Capítulo son aplicables al proyecto de miembros prismáticos
sometidos a compresión uniforme por fuerzas que actúan según el eje que pasa por
los centros de gravedad de las secciones transversales. (Compresión axil).

Su contenido está organizado de la siguiente manera:

E.1. Especificaciones generales. Resistencia de diseño a compresión axil
E.2. Longitud efectiva y limitación de esbelteces
E.3. Resistencia nominal a compresión por pandeo flexional de miembros sin elementos
     esbeltos
E.4. Resistencia nominal a compresión por pandeo torsional y flexo-torsional
E.5. Resistencia nominal a compresión de ángulos simples
E.6. Barras armadas
E.7. Resistencia nominal a compresión de miembros con elementos esbeltos.

   Para miembros simples y barras armadas de los Grupos I, II y III, sometidas a
    combinación de compresión axil y flexión ver las Secciones H.1. y H.2..
   Para barras armadas de los Grupos IV y V sometidas a combinación de compresión axil
    y flexión ver la Sección H.5.
   Para miembros sometidos a combinación de compresión axil y torsión ver la Sección
    H.3.
   Para la resistencia de diseño a compresión de elementos auxiliares de unión ver la
    Sección J.4.4.
   Para miembros comprimidos con almas de altura variable ver la Recomendación
    CIRSOC 301-1.
   Para la resistencia de diseño a compresión de barras de sección circular maciza ver el

E.1. ESPECIFICACIONES GENERALES

La resistencia de diseño a compresión de miembros axilmente comprimidos, Pd (kN)
(excepto barras de sección circular maciza) se determinará por medio de la siguiente
expresión:

                                   Pd = c Pn

siendo :

       c  0 ,85

       Pn la resistencia nominal a compresión, en kN.

Reglamento CIRSOC 301-2018                                                      Cap. E - 41


<!-- page 95 -->

La resistencia nominal a compresión Pn será el menor valor obtenido para los estados
límite de pandeo flexional, pandeo torsional y pandeo flexotorsional según corresponda.

Las resistencias nominales Pn están dadas en las Secciones E.3, E.4, E.5, E.6 y E.7.

Los valores especificados para el factor de resistencia c y para las tensiones críticas
dadas en este Capítulo solo son válidos para las siguientes tolerancias de falta de
rectitud y alabeo de las barras:

           Para secciones simples o secciones armadas de los Grupos I, II y III : L/1000
           Para secciones armadas de Grupos IV y V : L/500

siendo:

            L   la distancia entre puntos lateralmente arriostrados medida según el eje del
                miembro.

E.2. FACTOR DE LONGITUD EFECTIVA Y LIMITACIÓN DE ESBELTECES

El factor de longitud efectiva k utilizado para determinar la esbeltez (kL/r) de los miembros
comprimidos será determinado con las especificaciones del Capítulo C o del Apéndice 7,
según corresponda.

siendo:

        k       el factor de longitud efectiva.

        L       la longitud lateralmente no arriostrada del miembro, en cm.

        r       el radio de giro de la sección bruta del miembro relativo al eje de pandeo
                considerado, en cm.

La esbeltez (kL/ r) de miembros comprimidos será menor o igual que 200.

En presencia de acciones dinámicas, excepto viento, el límite anterior se reducirá a 150.

En aquellos miembros cuya dimensión es determinada por una fuerza de tracción, pero que
bajo otras combinaciones de cargas están solicitados por alguna fuerza de compresión, no es
necesario cumplir la limitación de esbeltez establecida para miembros comprimidos.

E.3. RESISTENCIA NOMINAL A COMPRESIÓN POR PANDEO FLEXIONAL DE
     MIEMBROS SIN ELEMENTOS ESBELTOS

Las especificaciones de esta Sección son aplicables a miembros sometidos a compresión
axil uniforme con secciones sin elementos esbeltos, según se define en la Sección B.4.1.

La resistencia nominal (Pn ) por pandeo flexional de miembros axilmente comprimidos
(excepto barras de sección circular maciza) respecto de un eje, se determinará por:


<!-- page 96 -->

                        P n  F cr A g  10 1                         (E.3.1)
                                                

siendo:
       Pn la resistencia nominal, en kN.

       Fcr la tensión crítica de pandeo, en MPa.

       Ag el área bruta de la sección del miembro, en cm2.

La tensión crítica Fcr (MPa) será determinada de la siguiente manera:

(a)    Para       c  1,5 :

                                          2
                                               
                              Fcr  0 ,658 c Fy                           (E.3.2)

equivalentemente:

                   kL          E
       Para             4 ,71
                    r          Fy

                                              Fy
                                                     
                                                    
                              F cr   0 , 658 F e   Fy                  (E.3.2a)
                                                    
                                                    

(b)    Para       c > 1,5 :

                                     0 ,877 
                              Fcr   2   Fy                             (E.3.3)
                                     c 

equivalentemente:

                   kL          E
       Para             4 ,71
                    r          Fy

                           Fcr = 0,877 Fe                                 (E.3.3a)

siendo:

          Fy la tensión de fluencia mínima especificada, en MPa.

          c el factor de esbeltez adimensional.

                 1 kL    Fy
          c                                                              (E.3.4)
                  r      E

       E     el módulo de elasticidad longitudinal, en MPa.

Reglamento CIRSOC 301-2018                                              Cap. E - 43


<!-- page 97 -->

        k    el factor de longitud efectiva.

        r    el radio de giro de la sección transversal bruta relativo al eje de pandeo, en cm.

        L    la longitud real no arriostrada del miembro, correspondiente a la respectiva
             dirección de pandeo, en cm.

          Fe la tensión de pandeo flexional elástico, en MPa, que será la determinada por la
             expresión (E.3.4a); o según lo especificado en el Apéndice 7, Sección 7.2.3(2), o
             de acuerdo a un análisis de pandeo elástico cuando sea aplicable.

                                            2E
                                   Fe             2
                                                                                        (E.3.4a)
                                           kL 
                                              
                                           r 

Para barras de sección circular maciza se aplicará lo especificado en la Sección 5.2. del

E.4. RESISTENCIA NOMINAL A COMPRESIÓN POR PANDEO TORSIONAL Y
     FLEXO-TORSIONAL

Las especificaciones de esta Sección se aplican a:

   Miembros con sección de simetría simple o asimétrica y algunos miembros con sección
    de simetría doble, tales como columnas cruciformes o barras armadas de Grupos I, II y
    III, o en general secciones con poca rigidez torsional y/o pequeño Cw solicitadas por
    compresión axil uniforme.

   Todos aquellos miembros de sección abierta doblemente simétrica, cuando la longitud
    efectiva torsional lateralmente no arriostrada es mayor que la longitud efectiva
    flexional lateralmente no arriostrada.
.
La resistencia nominal (Pn ) será determinada para el estado límite de pandeo flexo-
torsional o torsional según corresponda por:

                                     
                        Pn  Fcr Ag 10 1                                               (E.4.1)

siendo:

        Pn la resistencia nominal, en kN.

        Fcr la tensión crítica de pandeo, en MPa.

        Ag el área bruta de la sección del miembro, en cm2.

La tensión crítica Fcr se determinará de la siguiente manera:

(a) Para secciones doble ángulo en contacto continuo o formando columnas del Grupo II
y secciones Te, todas compactas o no compactas.


<!-- page 98 -->

                            Fcry  Fcrz          4 Fcry Fcrz H 
                    Fcr                1  1                
                                2H      
                                                    
                                                    Fcry  Fcrz 2 
                                                                  
                                                                              (MPa)                       (E.4.2)

siendo:

          Fcry = Fcr que se obtiene de la expresión (E.3.2), (E.3.2a) o (E.3.3), (E.3.3a) para
                 pandeo flexional alrededor del eje y de simetría con:

                    - (kL/r) = (kL/ry) para secciones Te y doble ángulo en contacto continuo

                    - (kL/r) = (kL/r)m de la Sección E.6 para secciones doble ángulo formando
                      columnas de Grupo II.

                     GJ
          Fcrz            2
                                                                                                           (E.4.3)
                   Ag ro

(b) Para todos los otros casos Fcr será determinada con la expresión (E.3.2a) o (E.3.3a)
usando la tensión de pandeo elástico torsional o flexo-torsional Fe según corresponda,
determinada de la siguiente manera:

   b.1) Para secciones doblemente simétricas y de simetría puntual:

                           2 EC           1
                                  w
                    Fe             GJ                                                                   (E.4.4)
                          k L 2       I I
                             z           x   y

   b.2) Para secciones de simple simetría donde el eje “y” es el de simetría:

                         F ey  F ez         4 F ey F ez H 
                    Fe                1 1                                                             (E.4.5)
                             2H
                                     
                                                
                                              F ey  F ez  2 
                                                                 
   b.3) Para secciones asimétricas, la tensión crítica elástica para pandeo flexo-torsional Fe
   es la menor de las raíces de la siguiente ecuación cúbica:

                                                                           2                   2
            Fe  Fex  Fe  Fey Fe  Fez   Fe           x                        y 
                                                  2
                                                      Fe  Fey  0   Fe 2 Fe  Fex   0   0      (E.4.6)
                                                                 ro                       ro 

siendo:

       L           la longitud real del miembro no arriostrada a los efectos del pandeo
                   torsional, en cm.

       kz          el factor de longitud efectiva para pandeo torsional; kz = 1 cuando los extremos
                   del miembro tienen la torsión impedida y el alabeo libre.

       E           el módulo de elasticidad longitudinal, en MPa.

       G           el módulo de elasticidad transversal, en MPa.

Reglamento CIRSOC 301-2018                                                                              Cap. E - 45


<!-- page 99 -->

        Cw        el módulo de alabeo, en cm6.

        J         el módulo de torsión, en cm4.

                    2 E
        Fex                   2
                                                                                                    (E.4.7)
                  k L 
                   x r 
                      x

                     2 E
        Fey                    2
                                                                                                     (E.4.8)
                           
                   ky L r 
                         y 

                2 EC          1
                       w
        F ez           G J                                                                       (E.4.9)
                k L 2      A r 2
                  z           g o

              x 2y 2
        H  1 o 2 o                                                                              (E.4.10)
                ro   
                     

            2
        ro  x o 2  y o 2 
                                    I x  I y                                                     (E.4.11)
                                       Ag

        Ix , Iy    los momentos de inercia respecto de los ejes principales, en cm4.

        xo , yo las coordenadas del centro de corte con respecto al centro de gravedad, en
                cm.

        Ag         él área bruta de la sección transversal del miembro, en cm2.

        L          la longitud real no arriostrada para el correspondiente modo de pandeo y eje
                   de pandeo, en cm.

        kx , ky los factores de longitud efectiva para pandeo flexional según los ejes
                respectivos.

        rx , ry los radios de giro respecto de los ejes principales x e y , en cm.

         ro        el radio de giro polar respecto del centro de corte, en cm.

        y          el eje de simetría.

Observación:

Para secciones doble Te de doble simetría puede tomarse en lugar de un análisis más
                    I y h o2
preciso, C w                        con       ho = distancia entre centros de gravedad de las alas (cm).
                       4
Para secciones Te y doble ángulo para calcular Fez pueden tomarse Cw = 0 y xo = 0 .


<!-- page 100 -->

E.5. RESISTENCIA NOMINAL A COMPRESIÓN DE ÁNGULOS SIMPLES

La resistencia nominal a compresión para miembros de ángulo simple Pn será determinada
de la siguiente manera:

   Si el miembro está axilmente cargado (línea de carga coincide con eje de gravedad del
    miembro) Pn se obtendrá con las especificaciones de la Sección E.3, la Sección E.4 o la
    Sección E.7, la que sea aplicable, con la mayor esbeltez resultante del pandeo alrededor
    de los ejes geométricos y del eje principal débil (radio de giro mínimo).

   Miembros excéntricamente cargados que cumplen las condiciones definidas en las
    Secciones E.5(a) y E.5(b) podrán ser proyectados como miembros axilmente
    cargados, si se utiliza la relación de esbeltez efectiva (kL/r)m especificada en dichas
    Secciones. Los miembros deberán satisfacer las siguientes condiciones:

    (1) el miembro comprimido está cargado a través del mismo ala en ambos extremos.
    (2) las uniones extremas son por soldadura o por dos pasadores por lo menos,
    (3) no existen cargas transversales intermedias,

(a) para ángulos de alas iguales o de alas desiguales unidos al cordón o a la chapa de nudo
    por el ala más larga, que son barras individuales o barras de alma de reticulados
    planos, con barras de alma adyacentes unidas del mismo lado del cordón o de la chapa
    de nudo:

                         L
    (a.1) Cuando 0             80
                        rx
                                       kL 
                                            72  0 , 75 L                                 (E.5.1)
                                          
                                       r m              rx

                    L
    (a.2) Cuando         80
                   rx
                                       kL 
                                            32  1 , 25 L  200                           (E.5.2)
                                          
                                       r m              rx

    Para ángulos de alas desiguales, con relación de longitud de alas menor a 1,7, y que
                                                                                 kL 
    están unidos a través del ala corta se agregará 4 [(bl /bs )2- 1] al            obtenido de
                                                                                     
                                                                                 r m
                                                      kL                                       
    las expresiones (E.5.1) o (E.5.2), pero el           debe ser mayor o igual a 0,95  L     .
                                                                                               
                                                      r m                                 rz    

(b) para ángulos de alas iguales o de alas desiguales unidos a través del ala más larga, que
    son almas de secciones cajón o de reticulados espaciales, con barras de alma
    adyacentes unidas del mismo lado del cordón o de la chapa de nudo:

Reglamento CIRSOC 301-2018                                                                Cap. E - 47


<!-- page 101 -->

                           L
    (b.1) Cuando 0               75
                          rx
                                         kL 
                                              60  0 , 80 L                                  (E.5.3)
                                            
                                         r m              rx

                      L
    (b.2) Cuando           75
                     rx
                                         kL 
                                              45  L  200                                   (E.5.4)
                                            
                                         r m       rx

    Para ángulos de alas desiguales, con relación de longitud de alas menor a 1,7, y que
                                                                                    kL 
    están unidos a través del ala corta, se agregará 6 [(bl /bs )2- 1] al              obtenido por
                                                                                        
                                                                                    r m
                                                         kL                                       
    las expresiones (E.5.3) o (E.5.4), pero el              debe ser mayor o igual a 0,82  L     .
                                                                                                  
                                                         r m                                 rz    
    siendo:

              L   la longitud del miembro igual a la distancia entre puntos de intersección de su
                  eje con el eje del cordón, en cm.

              bl el ala larga del ángulo, en cm.

              bs el ala corta del ángulo, en cm.

              rx el radio de giro respecto del eje geométrico paralelo al ala unida, en cm.

              rz el radio de giro mínimo de la sección, en cm.

   Barras de ángulo simple con condiciones de carga excéntrica en los extremos
    distintas de las especificadas en E.5(a) y E.5(b), o de ángulos de alas desiguales con
    relación de longitud de alas mayor a 1,7, o con cargas transversales aplicadas, deberán
    ser dimensionados para combinación de carga axil y flexión utilizando las
    especificaciones del Capítulo H.

E.6. BARRAS ARMADAS

E.6.1. Definición y alcance de las especificaciones

Una barra armada está formada por dos perfiles (o dos grupos de perfiles, o un perfil y
chapas) longitudinales (cordones), paralelos y de sección uniforme, unidos entre ellos a
intervalos regulares mediante pasadores, cordones de soldadura, celosías planas, presillas,
combinación de celosías planas y presillas, o platabandas laterales perforadas continuas, a
los efectos de obtener un comportamiento conjunto de aquellos frente al pandeo o la flexión
alrededor del eje libre de la barra armada.


<!-- page 102 -->

Los cordones pueden ser piezas simples o bien ser ellos mismos barras armadas en el
plano perpendicular.

                       Figura E.6.1. Barras armadas comprimidas.

Las barras armadas cubiertas por este Reglamento se clasifican en cinco grupos
(Figura E.6.1).

Grupo I: Los cordones (perfiles y/o chapas planas) están en contacto continuo y unidos en
forma discontinua y uniforme por pasadores o cordones de soldadura.

Grupo II: Los cordones están unidos por forros discontinuos de pequeño espesor.

Grupo III: Los cordones están unidos por platabandas laterales perforadas continuas.

Grupo IV: Los cordones están unidos por celosías planas.

Grupo V: Los cordones están unidos por presillas (placas de unión) a intervalos regulares.

Reglamento CIRSOC 301-2018                                                        Cap. E - 49


<!-- page 103 -->

Se define como eje material al que une los centros de gravedad de los dos perfiles
longitudinales que forman la barra armada. Se define como eje libre el eje perpendicular al
eje material que pasa por el centro de gravedad de la barra armada considerada en
conjunto. Cuando los cordones son a su vez barras armadas, la pieza tendrá dos ejes libres
perpendiculares entre sí. (Figura E.6.2).

                                   Figura E.6.2 . Eje libre y Eje material.

Las especificaciones para el proyecto de barras armadas de los Grupos I, II y III se dan en
la Sección E.6.2.

Las especificaciones para el proyecto de barras armadas de los Grupos IV y V se dan en la
Sección E.6.3.

Cuando no se cumpla alguna de las especificaciones anteriores dadas en esta Sección,
se deberá modificar adecuadamente los métodos de cálculo de las resistencias de
diseño y de verificación de los cordones y elementos de enlace dados en las Secciones
E.6.2. y E.6.3. , considerando la influencia de la especificación no cumplimentada en la
esbeltez modificada y en las solicitaciones resultantes en los cordones y elementos de
enlace.

E.6.2. Resistencias nominales a compresión y especificaciones particulares y
constructivas de barras armadas de los Grupos I, II y III

E.6.2.1. Resistencias nominales a compresión

La Resistencia nominal de barras armadas comprimidas de los Grupos I, II y III será
determinada de acuerdo a lo especificado en las Secciones E.3., E.4., E.5. o E.7., según
corresponda, con las siguientes modificaciones solo para el pandeo alrededor de ejes
donde el modo de pandeo implique deformaciones relativas:

Si el modo de pandeo implica deformaciones relativas que producen esfuerzos de corte
en los elementos que unen las barras individuales (pasadores, cordones de soldadura, o
                                           kL                         kL
platabandas perforadas), la relación            será reemplazada por     determinada por las
                                                                          
                                            r                          r m
expresiones siguientes:


<!-- page 104 -->

(a) Para uniones intermedias ejecutadas con bulones en uniones con ajuste sin juego:

                                                2             2
                            kL           kL          
                                            a                                        (E.6.1)
                                                     
                            r m          r  0  r i 

(b) Para uniones intermedias soldadas o ejecutadas con bulones en uniones
    pretensadas o de deslizamiento crítico:

                    a
   (1) Cuando             20
                    ri
                            kL        
                                  kL                                                  (E.6.2a)
                                      
                            r m  r o

                    a
   (2) Cuando             20
                    ri

                                                2             2
                            kL          kL     k a
                                            i                                      (E.6.2b)
                                                    
                            r m         r  o  r i 

      siendo:

              kL 
                              la esbeltez modificada de la columna armada (m).
                 
              r m
              kL 
                              la esbeltez de la columna armada actuando como una unidad en la
                 
              r o
                                dirección de pandeo considerada.

            r                   el radio de giro de la columna armada actuando como una unidad
                                alrededor del eje de pandeo considerado, en cm.

                a
                                la mayor esbeltez de una barra componente.
             ri

            a                   la distancia entre: conectores consecutivos (Grupo I); ejes de forros
                                (Grupo II); centros de agujeros consecutivos (Grupo III); en cm.

            ri                  el radio de giro mínimo de una barra componente.

            ki = 0,50 para ángulos espalda contra espalda en contacto continuo.
               = 0,75 para canales espalda contra espalda en contacto continuo.
               = 0,86 para otros casos.

Reglamento CIRSOC 301-2018                                                                Cap. E - 51


<!-- page 105 -->

E.6.2.2. Especificaciones particulares y constructivas

(a) Barras armadas del Grupo I (Figura E.6.3)

(1) En los extremos de las barras armadas, apoyadas en placas bases o en superficies
    mecanizadas, todos los elementos en contacto se unirán entre sí con bulones en unión
    del tipo de deslizamiento crítico o cordones de soldadura. Si la unión es abulonada, se
    extenderá en una distancia igual a 1,5 veces el ancho máximo de la barra armada y el
    paso longitudinal de los bulones será menor o igual a 4 diámetros. Si la unión es
    soldada, la longitud de los cordones de soldadura será mayor o igual al ancho máximo
    de la barra armada. Se deberán cumplir asimismo las especificaciones de la Sección
    J.1.4.

(2) A lo largo de la barra armada, entre las uniones extremas anteriormente indicadas, se
    dispondrán soldaduras discontinuas o bulones con las dimensiones y separación
    necesaria para transmitir las solicitaciones requeridas resultantes de un esfuerzo de
    corte ideal V  0 , 02  c P n
    Si se realizan empalmes en los cordones, ellos cumplirán las especificaciones de la
    Sección J.6.

(3) La distancia a entre uniones será tal que la relación de esbeltez a/ri de cada uno de los
    elementos resultantes entre uniones, sea menor o igual que 3/4 de la relación de
    esbeltez gobernante de la barra armada. Para el cálculo de la relación de esbeltez de los
    elementos resultantes se usará el radio de giro mínimo ri .

(4) Cuando los elementos en contacto sean una placa y un perfil, o dos placas, además de
    lo establecido en el punto anterior, la distancia a entre bulones respetará lo especificado
    en la Sección J.3.5. en relación a la agresividad del ambiente, al tipo de acero y a su
    protección.

(5) Cuando alguno de los componentes de los cordones de la barra armada sea una chapa
    externa, la máxima distancia entre uniones a (sobre una línea ), en cm, será:

   Si los bulones o soldaduras discontinuas están en línea

                             t
                  a  335                 ó        a  30 cm
                            Fy

   Si los bulones o soldaduras discontinuas están en tres-bolillo

                            t
                  a  500                 ó        a  45 cm
                            Fy

    siendo:

              t   el menor espesor de las chapas externas, en cm.

              F y la tensión de fluencia mínima especificada, en MPa.


<!-- page 106 -->

                        Figura E.6.3. Barras armadas del Grupo I.

(b) Barras armadas del Grupo II (Figura E.6.4)

(1) Los bulones o cordones de soldadura que unan los cordones de la barra armada a las
    chapas de nudo o a los forros intermedios deberán ser dimensionadas para transmitir las
    solicitaciones requeridas resultantes de un esfuerzo de corte ideal:

                                      V  0 , 02  c P n

   En uniones abulonadas, se colocarán como mínimo dos bulones o por forro.

   Si se realizan empalmes en los cordones, ellos cumplirán las especificaciones de la
   Sección J.6.

(2) Se dispondrán como mínimo dos forros intermedios igualmente distanciados entre
    puntos fijos para desplazamiento lateral (normal al eje libre).

Reglamento CIRSOC 301-2018                                                      Cap. E - 53


<!-- page 107 -->

                            Figura E.6.4. Barras armadas del Grupo II.

(3) La distancia a entre forros o entre éstos y chapas de nudo será tal que la relación de
    esbeltez a r i de cada uno de los elementos resultantes sea menor o igual que 3/4 de la
    relación de esbeltez gobernante de la barra armada. Para el cálculo de la relación de
    esbeltez de los elementos resultantes se usará el radio de giro mínimo ri .

Si la columna se apoya en sus extremos en placas o superficies mecanizadas se deberán
cumplir las especificaciones para barras del Grupo I, punto (1), Sección E.6.2.2. (a)

(c) Barras armadas del Grupo III (Figura E.6.5)

(1) El ancho de platabanda lateral comprendido entre la línea de uniones (bulones o
    soldadura discontinua) y el borde de los agujeros de acceso podrá ser considerado
    como parte de la sección de la columna siempre que se cumplan los siguientes
    requisitos:

    (a) La relación ancho-espesor debe cumplir con lo especificado en la Sección B.4.1 (ver
        Tabla B.4.1a, Caso 9).
    (b) La longitud del agujero en la dirección de la fuerza no debe ser mayor que dos
        veces su ancho.
    (c) La distancia libre entre agujeros en la dirección de la fuerza no debe ser menor que
        la distancia transversal entre líneas de bulones o soldaduras.
    (d) El radio mínimo de esquina de agujeros será de 4 cm.

(2) Los bulones o cordones de soldadura que unan las platabandas laterales a los cordones
    de la barra armada deberán ser dimensionados para transmitir las solicitaciones
    requeridas resultantes de un esfuerzo de corte ideal:

                                             V  0 , 02  c P n

    Si se realizan empalmes en los cordones, ellos cumplirán las especificaciones de la
    Sección J.6.


<!-- page 108 -->

(3) Si la columna apoya en sus extremos en placas o superficies mecanizadas se deberá
    cumplir lo especificado para barras armadas del Grupo I, punto (1) Sección E.6.2.2. (a).

(4) La distancia a entre bulones o soldaduras de unión de la platabanda perforada será tal
    que la relación de esbeltez a r i de cada uno de los elementos resultantes sea menor o
    igual que 3/4 de la relación de esbeltez gobernante de la barra armada. Para el cálculo
    de la relación de esbeltez de los elementos resultantes se usará el radio de giro mínimo
    ri .

(5) Además de lo dispuesto en el punto anterior la distancia entre uniones (bulones, o
    soldaduras) en la dirección de la fuerza deberá cumplir lo establecido para barras
    armadas del Grupo I, puntos (4) y (5), Sección E.6.2.2. (a).

                       Figura E.6.5. Barras armadas del Grupo III.

Reglamento CIRSOC 301-2018                                                       Cap. E - 55


<!-- page 109 -->

E.6.3. Resistencia de diseño, verificación de los cordones y de los elementos de
       enlace y especificaciones particulares y constructivas de barras armadas de
       los Grupos IV y V

(a) Cuando la barra armada tiene eje material, la resistencia de diseño ( P d   c P n ) para el
    pandeo alrededor de dicho eje, se obtiene de acuerdo con lo especificado en las
    secciones E.1. y E.3., E.4., E.5. o E.7. según corresponda.

(b) Para el pandeo alrededor de el o los ejes libres, la barra armada se dimensionará
    incorporando una imperfección geométrica equivalente consistente en una deformación
                                    kL
    inicial eo no menor que                   para el dimensionamiento de las barras de los cordones, y
                                    500
                         kL
    no menor que                para el dimensionamiento de los elementos de enlace.
                      400
    Las solicitaciones requeridas en las barras de los cordones y en los elementos de enlace
    se determinarán tomando en cuenta la deformación de la barra armada. (efecto de
    segundo orden).

E.6.3.1. Resistencia a compresión. Verificación de los cordones y de los elementos de
enlace

(a) Barras armadas del Grupo IV

(1) Solicitaciones requeridas y verificación de las barras de los cordones

     El esfuerzo axil requerido en cada barra de la columna armada Pu1 (kN) será:

                           Pu 1 
                                    Pu
                                          
                                               Ms
                                                       10 
                                                         2
                                                                                               (E.6.3)
                                     n        n1  h

     siendo:

            Pu     la carga axil requerida de la columna armada, en kN.

            n      el número de barras de la columna armada, (n=2; n=4).

            n1     el número de barras del cordón, (n1=1; n1=2 ).

            h      la distancia entre centros de gravedad de los cordones medida perpendicu-
                   larmente al eje de pandeo considerado de la barra armada, en cm.

            Ms =
                    Pu e o
                         Pu
                                10  (kNm)
                                    2
                                                                                                (E.6.4)
                   1
                         Pc m
                   kL
            e0 =          (deformación inicial), en cm                                         (E.6.5)
                   500


<!-- page 110 -->

           k       el factor de longitud efectiva; se determinará según la Sección E.2. en
                   función de las condiciones de vínculo de la columna armada.

                    2 E Ag
           Pcm =             2
                                  10  1
                                                         (kN)                                        (E.6.6)
                    kL
                      
                      
                    r m

                                                  2
                 kL                    k L
           m                             1 2             la esbeltez modificada de la
                                          
                 r m                   r o
                                                                  columna armada                    (E.6.7)

                    kL
           o                  la esbeltez de la columna armada actuando como una unidad.
                      
                    r o

           r       el radio de giro de la columna armada actuando como una unidad con
                   respecto al eje de pandeo analizado, en cm.

           1      el valor auxiliar relacionado con la rigidez a corte de la celosía de enlace,
                   según Figura E.6.6.

           Ag      la sección transversal bruta total de la barra armada, en cm2.

    Se deberá verificar que P u 1  P d 1 .siendo Pd1 (kN) la resistencia de diseño local de la
    barra.

                                                 P d 1   c F cr A g 1    10 
                                                                             1
                                                                                                    (E.6.8)

    c y Fcr serán determinados de acuerdo con las Secciones E.1. y E.3., E.4., E.5. ó E.7.
    según corresponda con el factor de esbeltez c1 obtenido como se indica a continuación:

                        L        1     Fy
                 c 1          
                              1
                                               para pandeo flexional                              (E.6.9)
                         r
                         i                E

                c1  e                         para pandeo torsional o flexotorsional

                         Fy
                e 
                         Fe
    siendo:

           Fe      la tensión crítica elástica para pandeo torsional o flexotorsional según la
                   Sección E.4. , en MPa.

Reglamento CIRSOC 301-2018                                                                       Cap. E - 57


<!-- page 111 -->

            L1     a cuando la columna armada tenga eje material y celosías sólo en una
                   dirección, en cm.

            L1     de acuerdo con la Figura E.6.7. cuando hay celosías en planos
                   perpendiculares, en cm.

            ri     el radio de giro mínimo de la barra componente, en cm.

            Ag1 el área bruta de la barra componente, en cm2.

                                   Figura E.6.6. Valor auxiliar 1 .


<!-- page 112 -->

                             Figura E.6.7. Determinación de L1 .

    (2) Solicitaciones requeridas y verificación de las barras de la celosía

    Las barras de la celosía serán verificadas para las fuerzas axiles requeridas resultantes
    de un esfuerzo de corte requerido Veu normal al eje de la barra armada.

              V eu   P u                                                          (E.6.10)

    con:
                                 
                                 
                          1     
                                                                                (E.6.11)
                  400  1  P u 
                                 
                          P cm 

Reglamento CIRSOC 301-2018                                                        Cap. E - 59


<!-- page 113 -->

     La verificación de las barras de la celosía se hará con las especificaciones de los
     Capítulos D y E según corresponda.

     El factor de longitud efectiva k para diagonales y montantes comprimidos será el
     especificado en el Apéndice 7 para estructuras trianguladas.
     Las uniones de las barras de celosía con las barras de los cordones se dimensionarán
     para las fuerzas requeridas resultantes del esfuerzo de corte requerido Veu ,según
     Capítulo J.

     En el caso de uniones abulonadas se deberán verificar las barras de la celosía tanto
     comprimidas como traccionadas, estas últimas en la sección neta efectiva.

(b) Barras armadas del Grupo V

(1) Solicitaciones requeridas y verificación de las barras de los cordones

    Los barras de la columna armada se dimensionarán para el efecto combinado de una
    fuerza axil requerida, Pu1 (kN), un momento flexor requerido Mu1 (kNm), y un esfuerzo
    de corte requerido, Vu1 (kN), determinados de la siguiente forma: (ver la Figura E.6.8a)

                      Figura E.6.8.Solicitaciones en cordones y presillas.


<!-- page 114 -->

                            Pu 1 
                                     Pu
                                            
                                                Ms
                                                        10 
                                                            2
                                                                                       (E.6.12)
                                      n         n1 h

                           Mu1 
                                     V eu a
                                                 10  2
                                                                                       (E.6.13)
                                      4 n1

                                     V eu
                           Vu1                                                        (E.6.14)
                                     2 n1

   siendo:

             Pu     la carga axil requerida de la columna armada, en kN.

             n      el número de barras de la columna armada, ( n =2; n = 4).

             n1     el número de barras del cordón, ( n1 = 1; n1 = 2).

             h      la distancia entre centros de gravedad de los cordones medida
                    perpendicularmente al eje de pandeo considerado de la barra armada, en
                    cm.

             Ms 
                      Pu e o
                          Pu
                                   10 
                                     2
                                                                                       (E.6.15)
                    1
                          P cm
                    kL
             eo           (deformación inicial), en cm.
                    500

             k      el factor de longitud efectiva se determinará según la Sección E.2. en
                    función de las condiciones de vínculo de la columna armada.

                     2 E Ag
          Pcm =
                               2
                                   10 
                                      1
                                                 (en kN)                                (E.6.16)
                     kL
                       
                       
                     r m

                                                 2
                   kL               kL   2
             m                       1  esbeltez modificada de la columna armada.
                                      
                   r m              r o  θ

                     kL
             o                 esbeltez de la columna armada actuando como una unidad.
                       
                     r o

             r      el radio de giro de la columna armada actuando como una unidad con
                    respecto al eje de pandeo analizado, en cm.

Reglamento CIRSOC 301-2018                                                            Cap. E - 61


<!-- page 115 -->

                   a
            1 =
                   ri
            a      la distancia entre ejes de presillas, en cm.

            ri     el radio de giro mínimo de la barra, en cm.

                       1 , 20                                  npIp       10 I 1
                             1                         Si                      se tomará  = 1
                        2 I1 h                                  h           a
                  1
                       np Ip a
            np     el número de planos de presillas.

            I1     el momento de inercia del cordón con respecto al eje paralelo al eje libre
                   analizado, en cm4.

            Ip     el momento de inercia de una presilla en su plano, en cm4.

             V eu   1 P u                                                                          (E.6.17)

                                 
                                 
                          1     
             1                 
                  500  1  P u 
                                 
                          P cm 

    Los cordones (o sus barras componentes) se verificarán de acuerdo con lo especificado
    en el Capítulo H con una longitud real no arriostrada de la barra igual a a.
    La resistencia de diseño a la compresión (  c P n ) será determinada según las Secciones
    E.1. y E.3., E.4., E.5. ó E.7. según corresponda.

    El factor de longitud efectiva se tomará k = 1.

    En el caso que las uniones de los cordones (o sus barras componentes) con las presillas
    sean abulonadas, aquellos se deberán verificar en la sección neta o neta efectiva, según
    corresponda.

    (2) Solicitaciones requeridas y verificación de las presillas

    Las presillas y sus uniones a las barras de los cordones se verificarán para las
    solicitaciones requeridas Mup y Vup1 resultantes de la acción de esfuerzo de corte Veu1
    normal al eje de la barra armada. (ver la Figura E.6.8b )

                          V eu 1   2 P u                                                           (E.6.18)

                                               
                                               
                                        1     
    con:                   2                 
                                400  1  P u 
                                               
                                        P cm 


<!-- page 116 -->

   La verificación de las presillas se realizará de acuerdo con el Capítulo F y el
   dimensionamiento de las uniones se realizará según el Capítulo J.

   En el caso de uniones abulonadas las presillas se verificarán en su sección neta.

E.6.3.2. Especificaciones particulares y constructivas

(a) Barras armadas del Grupo IV

(1) En los extremos de la barra armada se dispondrán presillas lo más próximas posibles a
    dichos extremos. Igualmente se colocarán presillas intermedias en los puntos en que la
    celosía se interrumpa y en los puntos de unión con otras piezas. Las presillas deberán
    satisfacer la siguiente condición:

               np Ip       10 I 1
                                                                                  (E.6.19)
                 h           a

   con np , Ip , I1 definidos en E.6.3.1(b); h y a según la Figura E.6.7.

(2) Las triangulaciones simples situadas en caras opuestas se dispondrán, preferiblemente,
    en correspondencia (según la Figura E.6.9(a) y no en oposición (según la Figura E.6.9(b)
    salvo que la deformación por torsión resultante en las piezas principales sea admisible.

(3) Si se combinan presillas con celosías dobles (Figura E.6.10(a) o con celosías simples
    dispuestas en oposición (Figura E.6.10(b) se determinarán las solicitaciones en los
    enlaces resultantes de la continuidad de los componentes principales y se tendrán en
    cuenta para el dimensionamiento de los enlaces y sus uniones extremas.

(4) Las presillas extremas o intermedias estarán rígidamente unidas a los cordones
    mediante bulones en uniones pretensadas o de deslizamiento crítico (mínimo dos
    bulones por unión), o mediante cordones de soldadura. Los elementos de la celosía
    (diagonales y montantes) se unirán a los cordones con soldadura o bulones con ajuste
    sin juego teniendo en este caso especial atención a la distancia al borde cargado.

(5) Los ejes de las diagonales y los cordones se cortarán en un punto. Se admiten
    apartamientos del punto de cruce teórico que no excedan la mitad del ancho de las
    barras que forman las diagonales.

(6) Si se realizan empalmes en los cordones, ellos cumplirán las especificaciones de la
    Sección J.6.

(b) Barras armadas del Grupo V

(1) En los extremos de la barra armada se dispondrán presillas lo más próximas posibles a
    dichos extremos. También se colocarán presillas en los puntos intermedios donde
    existan cargas aplicadas o en los que se disponga un arriostramiento lateral.

(2) Se colocarán presillas intermedias para dividir la longitud de la pieza, como mínimo en
    tres tramos. Igualmente, entre puntos lateralmente inmovilizados en el plano de las
    presillas, deberá haber un mínimo de tres tramos.

Reglamento CIRSOC 301-2018                                                       Cap. E - 63


<!-- page 117 -->

Las presillas intermedias serán iguales y estarán uniformemente espaciadas a lo largo de la
pieza.

                              Figura E.6.9. Triangulaciones simples.

                       Figura E.6.10. Celosías combinadas con presillas.


<!-- page 118 -->

(3) Cuando se dispongan planos paralelos de presillas, las presillas de cada plano se
    colocarán enfrentadas.

(4) Si las presillas reciben cargas en su plano provenientes de barras que apoyan sobre la
    columna armada, para el dimensionado de las presillas y sus uniones, deberán
    agregarse a las solicitaciones requeridas definidas en la Sección E.6.3.1(b)(2) las
    solicitaciones requeridas generadas por esas cargas.

(5) Si se realizan empalmes en los cordones, ellos cumplirán las especificaciones de la
    Sección J.6.

(6) Las presillas extremas o que reciban carga estarán rígidamente unidas a los cordones
    mediante bulones en uniones pretensadas o de deslizamiento crítico, o mediante
    cordones de soldadura. Las presillas intemedias se unirán a los cordones por soldadura
    o bulones con ajuste sin juego. En todos los casos se colocarán como mínimo dos
    bulones por unión.

E.7. RESISTENCIA NOMINAL A COMPRESIÓN DE MIEMBROS CON ELEMEN-
     TOS ESBELTOS

Las especificaciones de esta Sección son aplicables a miembros sometidos a compresión
axil uniforme con secciones con elementos esbeltos, según se define en la Sección
B.4.1.

La resistencia nominal a compresión, Pn (kN), será el menor valor obtenido para los
estados límites de pandeo flexional, pandeo torsional y pandeo flexotorsional según
corresponda.

                                  
                 P n  F cr A g 10 1                                            (E.7.1)

siendo:

          Pn    la resistencia nominal, en kN.

          Fcr   la tensión crítica de pandeo, en MPa.

          Ag    el área bruta de la sección del miembro, en cm2.

La tensión crítica, Fcr (MPa), será determinada de la siguiente manera:

(a)    Para  e      Q  1 ,5 :

                                      
                          F cr  Q 0 , 658 Q e
                                                  2
                                                      F   y                      (E.7.2)

equivalentemente:

                 
               kL                       E
       Para     
                     4 , 71
                  r                 QFy

Reglamento CIRSOC 301-2018                                                     Cap. E - 65


<!-- page 119 -->

                                              QFy    
                                                     
                             F cr  Q  0 , 658 F e    Fy                           (E.7.2a)
                                                     
                                                     
                                                     

(b)     Para      e       Q  1 ,5 :

                                     0 , 877 
                             F cr            Fy                                    (E.7.3)
                                     2 
                                          e  

equivalentemente:

                  
                kL                     E
        Para     
                      4 , 71
                   r                  QFy

                             Fcr = 0,877 Fe                                          (E.7.3a)

siendo:
                  Fy
          e 
                  Fe

        Fe       la tensión crítica de pandeo elástico, calculada con las expresiones E.3.4a o
                 E.4.4 para miembros con simetría doble; con expresiones E.3.4a o E.4.5 para
                 miembros con simetría simple; y E.4.6 para miembros asimétricos, en MPa.

        Q        el factor de reducción para pandeo local que considera la presencia en las
                 secciones de elementos esbeltos comprimidos.

             = 1,0 para miembros con secciones sin elementos esbeltos tal como se define en
               la Sección B.4.1. para secciones en compresión uniforme.

             = Qs Qa para miembros con secciones con elementos esbeltos tal como se define
               en la Sección B.4.1. para secciones en compresión uniforme.

        Qs       el factor de reducción por pandeo local para elementos no rigidizados
                 determinado con las especificaciones de la Sección E.7.2.

        Qa       el factor de reducción por pandeo local para elementos rigidizados
                 determinado con las especificaciones de la Sección E.7.1.

Si la sección transversal está compuesta solamente por elementos esbeltos no rigidizados,
Q = Qs (Qa = 1).

Si la sección transversal está compuesta solamente por elementos esbeltos rigidizados, Q = Qa
(Qs = 1).


<!-- page 120 -->

Si la sección transversal está compuesta por elementos esbeltos no rigidizados y por
elementos esbeltos rigidizados, Q = Qs Qa .

Si la sección transversal esta formada por múltiples elementos no rigidizados conserva-
doramente se puede tomar el menor Qs (del elemento más esbelto) para determinar la
resistencia nominal a compresión.

E.7.1. Factor de reducción Qs para elementos no rigidizados

El factor de reducción Qs para elementos esbeltos no rigidizados será determinado de la
siguiente manera:

(a) Para alas de perfiles laminados doble Te, canales y Tes, alas de pares de ángulos en
    unión continua, ángulos y placas salientes de perfiles laminados, en compresión axil
    (Caso 1, Tabla B.4.1a)

              b                  E
   Cuando:         0 , 56
              t               Fy

                                       Qs = 1,0                                     (E.7.4)

   Cuando:        0 , 56 E / F y  ( b / t )  1 , 03   E / Fy

                                                           b
                                       Q s  1,415  0,74        Fy / E  1       (E.7.5)
                                                           
                                                           t 

   Cuando:         b / t   1 , 03      E / Fy

                                                   0,69 E
                                       Qs                    1                    (E.7.6)
                                                    
                                                        2
                                                F  b 
                                                y  t  
                                                    

(b) Alas de perfiles soldados, ángulos y elementos salientes de elementos armados
    soldados en compresión (Caso 2 , Tabla B.4.1a)

                  b                  Ekc
   Cuando:             0 , 64
                  t                  Fy

                                       Qs = 1,0                                     (E.7.7)

   Cuando: 0 , 64 E k c / F y  ( b / t )  1 , 17          Ek c / Fy

Reglamento CIRSOC 301-2018                                                      Cap. E - 67


<!-- page 121 -->

                                                             b
                                         Q s  1,415  0,65          Fy    kc E 1          (E.7.8)
                                                             
                                                             t 

                b              Ekc
    Cuando:          1 , 17
                t                  Fy

                                                    0 , 90 E
                                         Qs                     kc  1                       (E.7.9)
                                                     
                                                         2
                                                F  b 
                                                 y  t  
                                                     

    El coeficiente kc se debe calcular de la siguiente forma:

                                                    4
                                         kc                          0,35  k c  0,763
                                                h tw

    siendo:

              h la altura del alma, en cm.

              tw el espesor del alma, en cm.

(c) Para ángulos simples o dobles unidos en forma discontinua (Caso 3, Tabla B.4.1a).

                    b               E
    Cuando:              0 , 45
                    t               Fy

                                         Qs = 1,0                                            (E.7.10)

    Cuando:         0 , 45     E / F y   b / t   0 , 91 E / F y

                                                            b 
                                         Q s  1,34  0,76                Fy /E 1        (E.7.11)
                                                            t 
                                                              

    Cuando:

                                             b / t   0 , 91   E / Fy


<!-- page 122 -->

                                                             0,53 E
                                             Qs                                    1             (E.7-12)
                                                                         2    
                                                                b           
                                                                   
                                                        Fy      t           
                                                                           

      siendo:
                b    el ancho total del ala más larga del ángulo, en cm.

(d) Almas de secciones Te (Caso 4, Tabla B.4.1a).

                      d                E
       Cuando:             0 , 75
                      t                Fy

                                            Qs = 1,0                                                (E.7.13)

       Cuando:            0 , 75     E / F y  ( d / t )  1 , 03    E / Fy

                                                                d 
                                             Q s  1,908  1,22                   Fy / E  1      (E.7.14)
                                                                 
                                                                 t 

       Cuando:  d / t   1 , 03            E / Fy

                                                          0,69 E                                    (E.7.15)
                                            Qs                               1
                                                                    2   
                                                             d        
                                                                
                                                     Fy      t        
                                                                     

       siendo:

                    d la altura nominal total de la sección Te, en cm.

En todas las expresiones anteriores:

  b      el ancho del elemento comprimido no rigidizado, como se define en la Sección B.4.1.,
         en cm.

  t      el espesor del elemento no rigidizado, en cm.

  Fy      la tensión de fluencia mínima especificada, en MPa.

Reglamento CIRSOC 301-2018                                                                       Cap. E - 69


<!-- page 123 -->

E.7.2. Factor de reducción Qa para elementos rigidizados

El factor de reducción, Qa , para elementos esbeltos rigidizados será determinado de la
siguiente manera:

                                         Area efectiva ( A ef )
                                  Qa                                                      (E.7.16)
                                           Area bruta ( A g )

siendo:

      Aef = Ag -  ( b - be) t (la sumatoria comprende todos los elementos rigidizados), en cm2.

      Ag     el área bruta de toda la sección de la barra, en cm2.

      be     el ancho efectivo reducido, en cm.

      b      el ancho del elemento comprimido rigidizado tal como se define en la Sección
             B.4.1., en cm.

      t      el espesor del elemento rigidizado, en cm.

El ancho efectivo reducido be se determina de la siguiente manera:

(a) Para elementos esbeltos uniformemente comprimidos excepto caras de tubos cuadrados y
    rectangulares de espesor uniforme y esquinas redondeadas. (Casos 5 y 8, Tabla B.4-1a).

    Cuando:
                                             b              E
                                               1 , 49
                                             
                                             t              f

                                                                      
                                                                      
                                                                      
                                                    E      0,34     E 
                                  b e  1 , 91 t         1                b              (E.7.17)
                                                    f       b     f 
                                                                    
                                                            t       
                                                                   
          siendo:

                    b   el ancho real de un elemento comprimido rigidizado como está definido en la
                        Sección B.4.1., en cm.

                    be el ancho efectivo reducido, en cm.

                    t   el espesor del elemento, en cm.


<!-- page 124 -->

                  f = Fcr con Fcr determinada según la Sección E.7. con Q = 1,0, en MPa.

(b) Caras de tubos de secciones cuadradas o rectangulares, de espesor uniforme y con
    esquinas redondeadas (Caso 6 , Tabla B.4.1a).

   Cuando:

                                  b                 E
                                      1 , 40
                                  t                 f
                                    

                                                                   
                                                                   
                                                 E     0,38      E 
                                b e  1 , 91 t     1                                  (E.7.18)
                                                 f      b      f 
                                                                 
                                                                
                                                         t 

   siendo:

             f = 10 Pn / Aef (MPa).

             Aef = Ag -  ( b - be) t (la sumatoria comprende todos los elementos rigidizados), en
                   cm2.

             Pn    la resistencia nominal a compresión de la columna, en kN.

Observación: en lugar de tomar f = 10 Pn / Aef que exige un procedimiento iterativo, puede
tomarse conservadoramente f = Fy

(c) Para elementos tubulares de sección circular cargados axilmente con relación
    diámetro/espesor dentro de los siguientes límites: (Caso 10, Tabla B.4.1a).

                                0,11 E     D  0,45 E
                                          
                                           
                                  Fy       t    Fy

                                            0,038 E           2
                                Q  Qa                                                 (E.7.19)
                                            F y ( D t)        3

Reglamento CIRSOC 301-2018                                                            Cap. E - 71


<!-- page 125 -->

    siendo:

              D el diámetro externo, en cm.

              t   el espesor de pared, en cm.


<!-- page 126 -->
