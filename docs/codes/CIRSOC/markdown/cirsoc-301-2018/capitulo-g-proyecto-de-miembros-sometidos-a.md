# CIRSOC 301 (2018) — CAPÍTULO G. PROYECTO DE MIEMBROS SOMETIDOS A

> Source: `CIRSOC 301-2018.pdf` · PDF pages 163–172
> Extraction: `pdftotext -layout` text layer, verbatim. No text was rewritten or inferred.

CORTE

Las especificaciones de este Capítulo son aplicables al proyecto de almas de miembros de
doble y simple simetría incluyendo vigas híbridas, de ángulos simples y de tubos de
sección circular sin costura, solicitados a corte en el plano del alma por flexión
alrededor del eje fuerte. Tambien se aplican a perfiles de doble y simple simetría
solicitados a corte por flexión alrededor del eje débil.

Su contenido está organizado de la siguiente manera:

G.1. Especificaciones generales
G.2. Miembros con almas no rigidizadas y con almas rigidizadas
G.3. Resistencia al corte con acción del campo a tracción
G.4. Ángulos simples
G.5. Tubos de sección circular sin costura
G.6. Corte por flexión alrededor del eje débil de secciones de doble y simple simetría
G.7. Interacción entre flexión y corte
G.8. Vigas con aberturas en el alma.

   Para corte en secciones asimétricas ver la Sección H.3.3..
   Para la resistencia de diseño al corte de elementos afectados del miembro y elementos
    auxiliares de una unión ver la Sección J.4.2..
   Para solicitaciones de corte en paneles nodales ver la Sección J.10.6..
   para resistencia de diseño al corte de tubos circulares con costura (CHS) y tubos
    RHS (rectangulares y cuadrados) ver el Reglamento CIRSOC 302-2005 y sus versiones
    posteriores.
   Para miembros con alma de altura variable sometidos a corte ver la Recomendación
    CIRSOC 301-1.

G.1. ESPECIFICACIONES GENERALES

Se presentan dos métodos para determinar la resistencia nominal a corte, Vn, para
miembros de doble y simple simetría (incluyendo vigas híbridas) y canales solicitados a
corte en el plano del alma por flexión alrededor del eje fuerte:

(a) El especificado en la Sección G.2. que no utiliza la resistencia pospandeo del miembro
    (acción del campo a tracción).

(b) El especificado en la Sección G.3. que utiliza la acción del campo a tracción.

Para cualquier miembro la resistencia de diseño a corte, Vd (kN), será:

               Vd = v Vn                                                                 (G.1.1)

Reglamento CIRSOC 301 - 2018                                                         Cap. G - 109


<!-- page 163 -->

siendo:

        Vn       la resistencia nominal a corte determinada con las Secciones G.2., G.3., G.4.,
                  G.5., o G.6., según corresponda, en kN.

        v       el factor de resistencia = 0,9.

G.2. MIEMBROS CON ALMAS NO RIGIDIZADAS Y CON ALMAS RIGIDIZADAS

G.2.1. Resistencia nominal al corte

Las especificaciones de esta Sección se aplican a miembros de doble y simple simetría
(incluyendo vigas híbridas) y canales solicitados a corte en el plano del alma por flexión
alrededor del eje fuerte.

La resistencia nominal al corte, Vn (kN), de almas no rigidizadas y rigidizadas para el
estado límite de fluencia por corte y pandeo por corte será:

                 Vn = 0,6 Fyw Aw Cv (10)-1                                                         (G.2.1)

siendo:

        Fyw      la tensión de fluencia especificada del acero del alma, en MPa.

        Aw      el área del alma = d tw , en cm2.                                                  (G.2.2)
                (para secciones cajón suma de las áreas de las almas).

        d        - para seciones laminadas = altura total del perfil, en cm.
                 - para secciones armadas = altura del alma, en cm.

        tw       el espesor del alma, en cm.

          Cv     el coeficiente de corte (relación entre la tensión crítica del alma según la
                 teoría de pandeo y la tensión de fluencia del acero del alma.

                (a) Para almas de todos las secciones laminadas o armadas de doble o
                    simple simetría y canales excepto tubos circulares.

                   a.1. cuando (h/tw )  1,10           k v E / F yw
                         Cv = 1,0                                                                  (G.2.3)

                   a.2. cuando 1,10         k v E / F yw     < (h/tw)  1,37   k v E / F yw

                                1 , 10   k v E / F yw
                         Cv =                                                                      (G.2.4)
                                     ( h/tw )


<!-- page 164 -->

                       a.3. cuando (h/tw ) > 1,37             k v E / F yw
                                     1 , 51 E k v
                            Cv =                                                                  (G.2.5)
                                   h / t  F
                                         w
                                                 2
                                                     yw

       siendo:

                   h       - para secciones laminadas: igual a la distancia libre entre alas menos
                             los radios de acuerdo entre ala y alma, en cm.

                           - para secciones armadas soldadas: igual a la distancia libre entre
                             alas, en cm.

                           - para secciones armadas abulonadas: igual a la distancia entre
                             líneas de bulones, en cm.

                   kv       el coeficiente de abolladura del alma.

                           - para almas sin rigidizadores transversales y con (h/tw )  260,
                             kv = 5 excepto para almas de perfiles Te donde kv = 1,2.

                           - para almas rigidizadas
                                             5
                            kv = 5                                                               (G.2.6)
                                        a / h 2
                                                                                          2
                                                                                    
                                                                     260
                               = 5 cuando (a/h) > 3,00 ó (a/h) >                    
                                                                 
                                                                  h / t w        
                                                                                     

                   a        la distancia entre rigidizadores transversales, en cm.

G.2.2. Rigidizadores transversales

Los rigidizadores transversales no son necesarios en vigas armadas:

   cuando h t w  2,45            E / F yw ,
       ó
   donde V u  0,6  v A w F yw C v 10
                                        1
                                                         
    siendo:

              Vu       el esfuerzo de corte requerido determinado por análisis estructural cuando
                       actúan las acciones mayoradas, en kN.

              Cv       el coeficiente de corte según la Sección G.2.1 (b) calculado con kv = 5 .

              v = 0,90

Los rigidizadores transversales utilizados para desarrollar la resistencia nominal al corte
especificada en la Sección G.2.1., deberán tener un momento de inercia Ist (cm4) tal que:

Reglamento CIRSOC 301 - 2018                                                                  Cap. G - 111


<!-- page 165 -->

        Ist  a tw3 j                                                                    (G.2.7)

             2,5
con:   j                2  0 ,5                                                      (G.2.8)
                    2
             a 
             
             
             h

El momento de inercia Ist se determinará con respecto al eje del alma cuando se coloque un
par de rigidizadores, y con respecto a la cara del alma en contacto con el rigidizador cuando se
coloque sólo uno, (rigidizador simple), (ver la Figura G.2.1(a)).

Los rigidizadores intermedios estarán unidos al ala comprimida y podrán terminar a una cierta
distancia del ala traccionada, siempre que no sea necesario transmitir a través de ellos cargas
concentradas o reacciones de apoyo, en cuyo caso deberán unirse al ala traccionada. La unión
soldada que une el rigidizador con el alma deberá terminarse a una distancia h1 del borde de la
unión soldada de ala y alma tal que 4 tw  h1  6 tw , siendo tw el espesor del alma. (ver la
Figura G.2.1(b)).

Cuando se utilicen rigidizadores simples se deberán unir al ala comprimida si ésta es una placa
rectangular, a fin de resistir alguna tendencia del ala a elevarse por efecto de torsión.

Cuando una barra de arriostramiento lateral esté unida a un rigidizador o a un par de
rigidizadores, éstos deberán unirse al ala comprimida y la unión deberá transmitir el 1% de la
fuerza total de compresión del ala.

El espaciamiento máximo de los bulones que unen un rigidizador al alma de una viga armada
será de 30 cm.

Si la unión del rigidizador al alma se realiza con soldadura de filete discontinua, la distancia
libre entre filetes será menor o igual a 16 veces el espesor del alma ó 25 cm.

            Figura G.2.1. Determinación del momento de inercia Ist rigidizadores.


<!-- page 166 -->

G.3. RESISTENCIA AL CORTE CON ACCIÓN DEL CAMPO A TRACCIÓN

G.3.1. Limitaciones para el uso de la acción del campo a tracción

Se permite utilizar la acción del campo a tracción en miembros de sección doble Te
cuando el alma está apoyada en sus cuatro lados en las alas y rigidizadores
transversales.

No se permite utilizar la acción del campo a tracción en los casos siguientes:

      Para paneles extremos en vigas armadas homogéneas con rigidizadores
       transversales

      Para todos los paneles en vigas armadas híbridas

                                                        2
                                                  
                                       260         
      cuando a/h >3     ó     a h
                                   
                                        
                                    h t w       
                                                   

      Cuando 2Aw / (Afc + Aft ) > 2,5

      Cuando (h/bfc ) > 6 o (h/bft ) > 6

       siendo:

                 Afc   el área del ala comprimida, en cm2.

                 Aft   el área del ala traccionada, en cm2.

                 bfc   el ancho del ala comprimida, en cm.

                 bft   el ancho del ala traccionada, en cm.

En los casos citados, la resistencia nominal al corte será determinada con las
especificaciones de la Sección G.2..

G.3.2. Resistencia nominal al corte con acción del campo a tracción

Cuando se permite utilizar la acción del campo a tracción según se especifica en la Sección
G.3.1., la resistencia nominal al corte, Vn (kN), para el estado límite de fluencia será:

                        h               kv E
       (a) Para               1 , 10                   Vn = 0,6 Aw Fyw (10)-1        (G.3.1)
                       tw               F yw

Reglamento CIRSOC 301 - 2018                                                     Cap. G - 113


<!-- page 167 -->

                            h                kv E
        (b) Para                 1 , 10
                           tw                    F yw

                                                                             
                                               
                          V n  0 , 6 A w F yw  C v 
                                                              1 Cv           
                                                                               
                                                                               10
                                                                                   1
                                                                                                (G.3.2)
                                                      1 , 15 1   a h  2   
                                                                             
        siendo:
                  Aw    el área del alma, en cm².

                  Fyw   la tensión de fluencia del acero del alma, en MPa.

                  Cv    el coeficiente de corte determinado según la Sección G.2.1..

                  kv    el coeficiente de abolladura de placa según la Sección G.2.1..

G.3.3. Rigidizadores transversales

Los rigidizadores transversales necesarios para desarrollar la acción del campo a tracción
deberán cumplir las especificaciones de la Sección G.2.2. y además las siguientes
limitaciones:

                                       E
        (1)       (b/t)st  0,56                                                                 (G.3.3)
                                     F yst

                                                       V V           
                                                          u     d1
        (2)       I st  I st 1  ( I st 2  I st 1 )                                          (G.3.4)
                                                       V d 2 V d 1   
                                                                      

siendo:

        (b/t)st la relación ancho-espesor del rigidizador.

        Fyst      la tensión de fluencia especificada del acero del rigidizador, en MPa.

        Ist       el momento de inercia del rigidizador con respecto al eje del alma si se coloca
                  un par de rigidizadores, y con respecto a la cara del alma en contacto con el
                  rigidizador si se coloca sólo uno. (rigidizador simple), en cm4.

          Ist1    el mínimo momento de inercia del rigidizador transversal requerido para
                  desarrollar la resistencia al pandeo por corte del alma determinado en la
                  Sección G.2.2., en cm4.

          Ist2    el mínimo momento de inercia del rigidizador transversal requerido para
                  desarrollar la resistencia total al corte: suma de la resistencia al pandeo por
                  corte mas la resistencia por acción del campo a tracción, en cm4.
                                                 1,5
                    h 4  st  F yw         
                          1,3
                                             
                  =                                                                            (G.3.5)
                       40      E            
                                            


<!-- page 168 -->

          Vu   la mayor resistencia requerida a corte en un panel adyacente al rigidizador,
               resultante de las acciones mayoradas, en kN.

       Vd1     la menor de las resistencias de diseño a corte de un panel adyacente al
               rigidizador con Vn determinada por las especificaciones de la Sección G.2.1.,
               en kN.

       Vd2     la menor de las resistencias de diseño a corte de un panel adyacente al
               rigidizador con Vn determinada por las especificaciones de la Sección G.3.2.
               en kN.

       st     el mayor valor entre (Fyw /Fyst ) y 1,0.

       Fyw     la tensión de fluencia especificada del acero del alma, en MPa.

Los rigidizadores transversales cuando se utiliza la acción del campo a tracción deberán
estar unidos a ambas alas.

G.4. ÁNGULOS SIMPLES

La resistencia nominal al corte, Vn , de un ala de un ángulo simple será determinada con la
expresión (G.2.1) y las especificaciones de la Sección G.2.1(a) con Aw = b t .

siendo:

       b       el ancho del ala que resiste la fuerza de corte, en cm.

       t       el espesor del ala, en cm.

       h/tw    = b/t

       kv      = 1,2

G.5. TUBOS DE SECCIÓN CIRCULAR SIN COSTURA

La resistencia nominal al corte, Vn , de tubos circulares sin costura será determinada
con los estados límite de fluencia por corte y pandeo por corte, con la siguiente expresión:

                       Vn = Fcr (Ag /2) (10)-1                                        (G.5.1)

siendo Fcr el mayor valor entre:

                           1 , 60 E
                 F cr                                                               (G.5.2a)
                                      5
                          Lv  D  4
                              
                              
                          D  t 

Reglamento CIRSOC 301 - 2018                                                     Cap. G - 115


<!-- page 169 -->

                               0 , 78 E
                      F cr                                                             (G.5.2b)
                                     3
                                D 2
                                
                                
                                t 

                      pero se deberá verificar que Fcr  0,6 Fy .

siendo :

        Ag        el área bruta de la sección del tubo, en cm2.

        D         el diámetro exterior del tubo, en cm.

        Lv        la distancia entre la sección con esfuerzo de corte máximo y la sección con
                  esfuerzo de corte nulo, en cm.

        t         el espesor de la pared del tubo, en cm.

G.6. CORTE POR FLEXIÓN ALREDEDOR DEL EJE DÉBIL DE SECCIONES DE
     DOBLE Y SIMPLE SIMETRÍA

   Para secciones con doble y simple simetría, excepto secciones cajón, flexadas alrededor
    del eje débil y sin torsión, la resistencia nominal al corte, Vn ,para cada elemento de la
    sección resistente al corte será determinada con la expresión (G.2.1) y con las
    especificaciones de la Sección G.2.1(a). con:

                  Aw = bf tf              (h/tw ) = b/tf   kv = 1,2

    siendo:

            b    - para alas de secciones doble Te igual a la mitad de la longitud total del ala,
                   en cm.

                 - para alas de canales igual a la dimensión nominal total del ala, en cm.

            tf    el espesor del ala, en cm.

   Para secciones cajón rectangulares y cuadradas flexadas alrededor del eje débil y sin
    torsión, la resistencia nominal al corte Vn será determinada con la expresión (G.2.1) y
    con las especificaciones de la Sección G.2.1(a). referidas al eje de flexión.

G.7. INTERACCIÓN ENTRE FLEXIÓN Y CORTE

Cuando se verifique que:

                               0,6  Vn  Vu   Vn            ( = 0,90)
                  y


<!-- page 170 -->

                        0,75  Mn  Mu   Mn           ( = 0,90)

las vigas armadas con almas proyectadas para desarrollar la acción del campo a tracción
deberán satisfacer el siguiente criterio adicional de interacción entre flexión y corte:

                  Mu               Vu
                        0 , 625          1 , 375                                     (G.7.1)
                 Mn               Vn

siendo:

          Mn   la resistencia nominal a flexión de la viga armada determinada según el Capítulo
               F, en kNm.

          Vn   la resistencia nominal a corte determinada según el Capítulo G, Sección G.3., en
               kN.

          Mu   el momento flector requerido, en kNm.

          Vu   el esfuerzo de corte requerido, en kN.

           = 0,90 .

G.8. VIGAS CON ABERTURAS EN EL ALMA

Se deberá determinar el efecto en la resistencia de diseño a corte de toda abertura en el
alma de una viga de acero. Cuando la resistencia requerida exceda la resistencia de diseño
se deberán disponer en la abertura refuerzos adecuados.

Reglamento CIRSOC 301 - 2018                                                      Cap. G - 117


<!-- page 171 -->



<!-- page 172 -->
