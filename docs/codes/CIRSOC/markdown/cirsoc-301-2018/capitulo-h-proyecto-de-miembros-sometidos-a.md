# CIRSOC 301 (2018) — CAPÍTULO H. PROYECTO DE MIEMBROS SOMETIDOS A

> Source: `CIRSOC 301-2018.pdf` · PDF pages 173–182
> Extraction: `pdftotext -layout` text layer, verbatim. No text was rewritten or inferred.

SOLICITACIONES COMBINADAS Y TORSIÓN

Las especificaciones de este Capítulo son aplicables al proyecto de miembros solicitados a
carga axil y a flexión alrededor de uno o de dos ejes, con o sin torsión, y miembros solicitados a
torsión pura.

Su contenido está organizado de la siguiente manera:

H.1. Miembros de doble y simple simetría solicitados a flexión y a carga axil
H.2. Miembos de seción asimétrica y otros solicitados a flexión y a carga axil
H.3. Miembros solicitados a torsión y a combinación de torsión, flexión, corte y/o carga axil
H.4. Resistencia a la rotura de alas con agujeros, sometidas a tracción
H.5. Barras armadas sometidas a compresión y flexión.

   Para miembros con almas de altura variable, ver la Recomendación CIRSOC 301-1.

H.1. MIEMBROS DE DOBLE Y SIMPLE SIMETRÍA SOLICITADOS A FLEXIÓN Y
     A CARGA AXIL

H.1.1. Miembros de doble y simple simetría solicitados a flexión y a compresión

La interacción de flexión y compresión en miembros de doble simetría y miembros de
simple simetría que satisfagan la relación 0,1  ( Iyc / Iy)  0,9, y que estén solicitados
únicamente a flexión alrededor de uno o de ambos ejes geométricos (x y/o y) deberá
satisfacer las expresiones (H.1.1a) y (H.1.1b). En esta Sección están incluidas las barras
armadas de los Grupos I, II y III, siendo:

    Iyc el momento de inercia del ala comprimida respecto del eje de simetría y, en cm4.

    Iy el momento de inercia de la sección total respecto del eje de simetría y,en cm4.

                Pu
(a) Para               0 ,2
                Pn

                                        M uy 
                Pu        8  M ux                1 ,0
                                                                                (H.1.1a)
                Pn       9   b M nx  b M ny 
                                               

                Pu
(b) Para               0 ,2
                Pn

Reglamento CIRSOC 301 – 2018                                                         Cap. H - 119


<!-- page 173 -->

                                      M uy 
                    Pu       M ux              1 ,0
                                                                                          (H.1.1b)
                  2  P n   b M nx  b M ny 
                                             

siendo:

          Pu     la resistencia requerida a compresión axil en el miembro determinada con las
                 especificaciones del Capítulo C, en kN.

          Pn     la resistencia nominal a compresión axil determinada de acuerdo con lo
                 especificado en el Capítulo E, en kN.

          Mu     la resistencia requerida a flexión en el miembro, determinada de acuerdo con lo
                 especificado en el Capítulo C, en kNm.

          Mn     la resistencia nominal a flexión determinada de acuerdo con lo especificado en
                 el Capítulo F , en kNm.

          x      el subíndice relativo al eje de flexión correspondiente al eje principal de mayor
                 inercia, (eje fuerte).

          y      el subíndice relativo al eje de flexión correspondiente al eje principal de menor
                 inercia, (eje débil).

           = c el factor de resistencia para compresión = 0,85 (ver la Sección E.1.).

          b     el factor de resistencia para flexión = 0,90 .

   Para miembros sometidos a flexión biaxial se aplicará la expresión (H.1.1b) anulando el
    término que contiene a la fuerza axil.

   Para la flexión biaxial de tubos circulares sin costura que estén lateralmente no
    arriostrados a lo largo de su longitud y con condiciones de vínculo tales que el factor de
    longitud efectiva k sea el mismo en cualquier dirección de flexión, se permite considerar
                                                                                          2      2
    para el dimensionado el momento flector resultante en una dirección Mur =       M ux  M uy .

H.1.2. Miembros de doble y simple simetría solicitados a flexión y a tracción

La interacción de flexión y tracción en miembros de doble simetría y miembros de simple
simetría que satisfagan la relación 0,1  ( Iyc / Iy )  0,9, y barras armadas de los Grupos I, II
y III, y que estén solicitados solamente a flexión alrededor de uno o de ambos ejes
geométricos (x y/o y) deberá satisfacer las expresiones (H.1.1a) y (H.1.1b) siendo:

          Pu     la resistencia requerida a tracción axil en el miembro determinada con las
                 especificaciones del Capítulo C, en kN.

          Pn     la resistencia nominal a tracción axil determinada de acuerdo con lo
                 especificado en el Capítulo D, en kN.


<!-- page 174 -->

       Mu        la resistencia requerida a flexión en el miembro, determinada de acuerdo con lo
                 especificado en el Capítulo C, en kNm.

       Mn        la resistencia nominal a flexión determinada de acuerdo con lo especificado en
                 el Capítulo F , en kNm.

       x         el subíndice relativo al eje de flexión correspondiente al eje principal de mayor
                 inercia, (eje fuerte).

       y         el subíndice relativo al eje de flexión correspondiente al eje principal de menor
                 inercia, (eje débil).

        = t el factor de resistencia para tracción. Ver la Sección D.2..

       b        el factor de resistencia para flexión = 0,90 .

Se podrá realizar un análisis mas detallado de la interacción entre tracción y flexión en lugar de
las expresiones (H.1.1a) y (H.1.1b).

H.1.3. Perfiles laminados compactos de doble simetría solicitados a flexión simple y a
compresión

Para perfiles laminados compactos de ala ancha de doble simetría con (kL)z  (kL)y
solicitados a flexión y compresión con momento flector fundamentalmente en un plano
(Mux >> My), se permite considerar en forma independiente y separada dos estados
límite: inestabilidad en el plano y pandeo fuera del plano o pandeo flexo-torsional en
lugar de la combinación aproximada especificada en la Sección H.1..

   Para miembros con (Muy / bMny )  0,05 se deben aplicar las especificaciones de la
    Sección H.1.1..

   Para miembros con (Muy / bMny ) < 0,05 o solicitados a flexión simple, se debe aplicar:

    (a) Para el estado límite de pandeo en el plano se utilizarán las expresiones (H.1.1a) y
        (H.1.1b) con (c Pn ), Mu y (b Mn ) correspondientes al plano de flexión.

    (b) Para el estado límite de pandeo fuera del plano y de pandeo flexo-torsional:

                                                                      2
                                                                 
                   Pu                     Pu            M ux     
                           1 ,5  0 ,5                            1 ,0                 (H.1.2)
                  c P ny               c P ny     C b  b M nx 
                                                                 

       siendo:

                 Pny    la resistencia nominal a compresión axil fuera del plano de flexión, en kN.

                 Mnx la resistencia nominal a flexión para pandeo flexo-torsional por flexión
                     alrededor del eje fuerte, determinada según lo especificado en el Capítulo
                     F con Cb= 1,0, en kNm.

Reglamento CIRSOC 301 – 2018                                                            Cap. H - 121


<!-- page 175 -->

                   Cb       el factor de modificación para pandeo flexo-torsional, determinado según
                            la Sección F.1..

H.2. MIEMBROS DE SECCIÓN ASIMÉTRICA Y OTROS SOLICITADOS A
     FLEXIÓN Y A CARGA AXIL

Esta Sección cubre la interacción entre tensiones normales por flexión y por fuerza axil para
perfiles no incluidos en la Sección H.1.. Para los perfiles incluidos en la Sección H.1. se permite
utilizar las especificaciones de esta Sección en lugar de los especificados en ella.

                              f      f    f     
                               ua  ubw  ubz   1 , 0                                            (H.2.1)
                                                
                               F da F dw F dz 

siendo:

          fua               la tensión normal requerida por carga axil en el punto analizado de la
                            sección transversal, producida por las cargas mayoradas, en MPa.

          Fda = Fcr        la resistencia de diseño axil en términos de tensión, determinada con las
                            especificaciones del Capítulo E para compresión y de la Sección D.2. para
                            tracción, en MPa.

          fubw, fubw        la tensión normal requerida por flexión en el punto analizado de la sección
                            transversal, producida por las cargas mayoradas, en MPa.

                            bMn
          Fdw, Fdz      =                 la tensión normal de diseño por flexión determinada con las
                                   S
                            especificaciones del Capítulo F. Se usará el módulo resistente elástico S
                            correspondiente al punto analizado y se considerará el signo de la tensión,
                            en MPa.

          w                 el subíndice que indica flexión alrededor del eje principal de mayor
                            momento de inercia.

          z                 subíndice que indica flexión alrededor del eje principal de menor momento
                            de inercia.

                           - c       el factor de resistencia para compresión según el Capítulo E, igual a
                                       0,85.
                            - t       el factor de resistencia para tracción según la Sección D.2..

          b                el factor de resistencia para flexión = 0,90.

La expresión (H.2.1) será evaluada utilizando los ejes principales de inercia para considerar el
signo de las tensiones normales producidas por la flexión en los puntos críticos de la sección
transveral. Las tensiones normales serán sumadas o restadas a las producidas por la fuerza
axil. Para fuerzas de compresión se deberán incluir los efectos de segundo orden de
acuerdo con las especificaciones del Capítulo C.


<!-- page 176 -->

Se permite un análisis mas detallado de la interacción de flexión y tracción en lugar de la
aplicación de la expresión (H.2.1).

H.3. MIEMBROS SOLICITADOS A TORSIÓN Y A COMBINACIÓN DE TORSIÓN,
     FLEXIÓN, CORTE Y/O CARGA AXIL

H.3.1. Resistencia de diseño a torsión de tubos de sección circular (tubos HSS sin
       costura)

La resistencia de diseño a torsión para tubos de sección circular sin costura, T Tn
(kNm), para los estados límite de fluencia por torsión o pandeo por torsión será determinada
con:

          T = 0,9

          Tn la resistencia nominal a la torsión, en kNm.

La resistencia nominal a la torsión, Tn (kNm), se determinará de la siguiente manera:

                           Tn = Fcr C (10)-3                                             (H.3.1)

siendo:
                                                                                             2
                                                                                    ( Dt ) t
          C la constante torsional del tubo, en cm , aproximadamente igual a C 
                                                             3
                                                                                                   .
                                                                                        2
              Para expresiones más exactas ver el Anexo II del Reglamento CIRSOC 302-2005.

          Fcr la tensión crítica de corte por torsión, en MPa.

              - Fcr será el mayor valor entre:

                                    1 , 23 E
                                                                                        (H.3.2a)
                                    0 ,5            1 , 25
                            (L/D)          (D/t )
                     y

                                     0 ,6 E
                                                                                        (H.3.2b)
                                            1,5
                                  (D/t )

                     con Fcr  0,6 Fy

          L      la luz del miembro, en cm.

          D      el diámetro exterior del tubo, en cm.

          t      el espesor de la pared del tubo, en cm.

Reglamento CIRSOC 301 – 2018                                                        Cap. H - 123


<!-- page 177 -->

H.3.2. Miembros tubulares de sección circular sometidos a combinación de torsión,
       corte, flexión y carga axil

   Cuando la resistencia requerida a torsión, Tu, sea menor o igual que el 20% de la
    resistencia de diseño a torsión, Td (TTn), los efectos torsionales serán despreciados y la
    interacción entre torsión, corte, flexión y/o carga axil será verificada según las
    especificaciones de la Sección H.1..

   Cuando la resistencia requerida a torsión, Tu, sea mayor que el 20% de la resistencia de
    diseño a torsión, Td (T Tn), la interacción entre torsión, corte, flexión y/o carga axil será
    verificada en la sección considerada mediante la siguiente expresión:

                                                                  2
                                   P   M ux   V u T u 
                                   u
                                                                1 ,0                (H.3.3)
                                  P    M      V       T d 
                                   d     dx       d

    siendo:

              Pu            la resistencia axil requerida producida por las acciones mayoradas
                            determinada con las especificaciones del Capítulo C, en kN.

              Pd =  Pn     la resistencia de diseño a fuerza axil determinada por las
                            especificaciones del Capítulo E para compresión y del Capítulo D para
                            tracción, en kN.

              Mux           la resistencia a flexión requerida producida por las acciones
                            mayoradas determinada con las especificaciones del Capítulo C, en
                            kNm.

              Mdx =  Mnx el menor valor entre ( Fy Sx 10-3) y la resistencia de diseño a flexión
                          determinada por las especificaciones del Capítulo F, en kNm.

              Sx            el módulo elástico de la sección transversal referido al eje de flexión,
                            en cm3.

              Vu            la resistencia a corte requerida producida por las acciones mayoradas
                            determinada con las especificaciones del Capítulo C, en kN.

              Vd = v Vn    la resistencia de diseño a corte determinada por las especificaciones
                            del Capítulo G, en kN.

              Tu            la resistencia requerida a torsión producida por las acciones
                            mayoradas determinada con las especificaciones del Capítulo C, en
                            kNm.

              Td = T Tn    la resistencia de diseño a torsión determinada por las especificaciones
                            de la Sección H.3.1., en kNm.


<!-- page 178 -->

H.3.3. Miembros no tubulares sometidos a combinación de torsión, corte, flexión y carga
       axil

La resistencia de diseño del miembro,  Fn (MPa), expresada en términos de tensión,
deberá ser mayor o igual que la resistencia requerida, expresada en términos de tensión
normal fun, o tensión de corte fuv , determinadas ambas mediante análisis estructural global
y seccional elástico cuando la estructura esté sometida a las acciones mayoradas.

          (a) Para el estado límite de plastificación bajo tensiones normales:

                 fun   Fn =  Fy                                                      (H.3.4)

                  = 0,90

          (b) Para el estado límite de plastificación bajo tensiones de corte:

                 fuv   Fn = 0,6  Fy                                                  (H.3.5)

                  = 0,90

          (c) Para el estado límite de pandeo:

                 fun ó fuv   Fn = c Fcr el que resulte aplicable                     (H.3.6)

                 c = 0,85

Se permiten algunas plastificaciones locales restringidas, adyacentes a áreas que
permanezcan elásticas.

H.4. RESISTENCIA A LA ROTURA DE ALAS CON AGUJEROS SOMETIDAS A
     TRACCIÓN Y FLEXIÓN

En la ubicación de los agujeros para bulones en alas de miembros sometidas a tracción por la
combinación de fuerza axil de tracción y de flexión alrededor del eje fuerte, la resistencia a
rotura por tracción del ala deberá ser verificada con la expresión (H.4.1). Se deberá verificar
por separado cada ala que resulte sometida a tracción por la combinación de flexión y tracción.

                                  Pu       M ux
                                                 1 ,0                                (H.4.1)
                                  Pd       M dx

siendo:

          Pu    la resistencia axil requerida producida por las acciones mayoradas determinada
                con las especificaciones del Capítulo C, en kN.

          Pd = c Pn la resistencia de diseño a fuerza axil para el estado límite de rotura por
               tracción determinada por las especificaciones de la Sección D.2.(b)., en kN.

Reglamento CIRSOC 301 – 2018                                                       Cap. H - 125


<!-- page 179 -->

        Mux la resistencia a flexión requerida producida por las acciones mayoradas
            determinada con las especificaciones del Capítulo C, en kNm.

        Mdx = b Mn la resistencia de diseño a flexión determinada por las especificaciones de
               la Sección F.13.1. o el momento plástico Mp determinado sin considerar los
               agujeros, lo que sea aplicable, en kNm.

        c       el factor de resistencia para rotura por tracción = 0,75.

        b       el factor de resistencia para flexión = 0,90.

H.5. BARRAS ARMADAS DE GRUPOS IV Y V SOMETIDAS A COMPRESIÓN Y
     FLEXIÓN

Si una barra armada de los Grupos IV o V está sometida a un esfuerzo axil requerido, Pu , a
un momento flector requerido, Mu , y a un esfuerzo de corte requerido, Vu , se utilizarán para
su dimensionamiento y verificación los procedimientos especificados en la Sección E.6.3.
con las siguientes modificaciones y agregados:

(a) Se modifica el momento Ms (kNm) dado por las expresiones (E.6.4) y (E.6.15) por la
    siguiente expresión :

                                  M 
                                      P e ( 10 )  M 
                                            u   o
                                                           2
                                                                u
                                                                                        (H.5.1)
                                    s
                                                         Pu
                                                    1
                                                         Pc m

        Mu      el mayor valor del momento flector requerido determinado a lo largo de la
                barra según las especificaciones del Capítulo C, en kNm.

        Pcm      dado por las expresiones (E.6.6) y (E.6.16) con el factor de longitud efectiva
                 k que corresponda según el método de análisis empleado para determinar
                 Mu , en kN.

        k        el factor de longitud efectiva será
                 = 1,0 si el Mu fue determinado por el método de análisis directo.
                 = 1,0 si el Mu fue determinado por el método de análisis de primer orden.
                 = al valor que resulte de considerar el efecto P- cuando corresponda si el Mu
                 fue determinado por el método de la longitud efectiva.

(b) En barras armadas del Grupo IV cuando la barra armada tenga eje material y la flexión
    se produzca sólo alrededor del eje libre, la determinación de la resistencia de diseño
    local a compresión de la barra Pd1, se hará con el mayor factor de esbeltez resultante
    entre el c1 determinado según la Sección E.6.3.1. y el c correspondiente al pandeo
    alrededor del eje material.

(c) En barras armadas del Grupo IV cuando la barra armada tenga eje material y la flexión
    se produzca sólo alrededor del eje material, en la determinación de la resistencia de
    diseño a compresión axil, Pd , del cordón para la verificación especificada en el Capítulo


<!-- page 180 -->

   H, se considerará la posibilidad de pandeo en ambas direcciones, adoptándose el menor
   valor resultante. Para el pandeo alrededor del eje libre se adoptará la esbeltez
   modificada m o la que resulte de la longitud de pandeo local con kL1 = a, la que sea
   mayor. Para el pandeo alrededor del eje material se adoptará la longitud de pandeo kL
   correspondiente a esa dirección.

(d) En barras armadas del Grupo IV con los dos ejes libres y cuando la flexión se produzca
    alrededor de sólo uno de ellos (por ejemplo el eje x), el esfuerzo axil requerido en cada
    barra Pu1 (kN) será:

                        Pu        M sx                   M sy
               P u1                        10 2          ( 10 2 )               (H.5.2)
                        n        ν 1x h x            n
                                                         1y h y

   donde Msx (kNm) se determinará con la expresión (H.5.1) (considerando el momento Mux
   y la excentricidad eox) y Msy (kNm) con la expresión (E.6.4) (considerando la
   excentricidad eoy).

(e) En barras armadas del Grupo V cuando la barra tenga eje material y la flexión se
    produzca sólo alrededor del eje libre, en la determinación de la resistencia de diseño
    local a compresión axil, Pd1 , para la verificación especificada en el Capítulo H, se
    considerará la posibilidad de pandeo en ambas direcciones, adoptándose el menor valor
    resultante. Para el pandeo alrededor del eje paralelo al eje libre se adoptará como
    longitud de pandeo kL1 = a. Para el pandeo alrededor del eje material se adoptará la
    longitud de pandeo kL correspondiente a esa dirección.

(f) En barras armadas del Grupo V cuando la barra armada tenga eje material y la flexión
    se produzca sólo alrededor del eje material, en la determinación de la resistencia de
    diseño a compresión axil, Pd , del cordón para la verificación especificada en el Capítulo
    H, se considerará la posibilidad de pandeo en ambas direcciones, adoptándose el menor
    valor resultante. Para el pandeo alrededor del eje libre se adoptará la esbeltez
    modificada, m , o la que resulte de la longitud de pandeo local con kL1 = a, de ambas la
    que resulte mayor. Para el pandeo alrededor del eje material se adoptará la longitud de
    pandeo kL correspondiente a esa dirección.

(g) En barras armadas del Grupo V con los dos ejes libres y cuando la flexión se produzca
    alrededor de sólo uno de ellos (por ejemplo el eje x), el esfuerzo axil requerido en cada
    barra Pu1 (kN) será:

                        Pu         M sx                  M sy
               P u1                        10 2          ( 10 2 )             (H.5.3)
                        n        n 1x h x            n
                                                         1y h y

   donde Msx (kNm) se determinará con la expresión (H.5.1) (considerando el momento Mux
   y la excentricidad eox) y Msy (kNm) con la expresión (E.6.15) (considerando la
   excentricidad eoy).

   La barra se verificará con el Capítulo H sometida a la compresión Pu1 y a los momentos
   flexores Mu1x y Mu1y resultantes de los esfuerzos de corte Veux y Veuy.

Reglamento CIRSOC 301 – 2018                                                      Cap. H - 127


<!-- page 181 -->

(h) Se modifica el esfuerzo de corte requerido, Veu , utilizado para el dimensionamiento y
    verificación de los enlaces en las barras armadas del Grupo IV , y de los cordones y
    presillas en las barras armadas del Grupo V , de la siguiente forma:

       Barras armadas del Grupo IV .

        La expresión (E.6.10) se reemplaza por:           V eu   P u  V u (kN)                (H.5.4)

       Barras armadas del Grupo V .

        La expresión (E.6.17) se reemplaza por:               V eu   1 P u  V u (kN)         (H.5.5)

        La expresión (E.6.18) se reemplaza por:               V eu 1   2 P u  V u (kN)       (H.5.6)

        siendo:

               Vu    el mayor valor del esfuerzo de corte requerido a lo largo de la barra por
                     las acciones mayoradas, en kN.


<!-- page 182 -->
