# CIRSOC 301 (2018) — CAPÍTULO F. PROYECTO DE VIGAS Y OTROS MIEMBROS

> Source: `CIRSOC 301-2018.pdf` · PDF pages 127–162
> Extraction: `pdftotext -layout` text layer, verbatim. No text was rewritten or inferred.

EN FLEXIÓN

Las especificaciones de este Capítulo son aplicables a miembros prismáticos sometidas a
flexión simple alrededor de un eje principal.

Para que haya flexión simple el miembro debe estar cargado en un plano paralelo a un eje
principal que pase por el centro de corte, o tener restringidos a la torsión los puntos de
aplicación de la carga y los apoyos.

Su contenido está organizado de la siguiente manera:

F.1.    Especificaciones generales
F.2.    Miembros de secciones compactas doble Te de doble simetría y canales, flexados
        alrededor de su eje fuerte
F.3.    Miembros de sección doble Te de doble simetría y canales con almas compactas y
        alas no compactas o esbeltas, flexados alrededor de su eje fuerte
F.4.    Otros miembros de sección doble Te con almas compactas o no compactas, canales
        con almas no compactas, todos con alas compactas, no compactas o esbeltas y
        flexados alrededor de su eje fuerte.
F.5.    Miembros de sección doble Te de simple y doble simetría con almas esbeltas
        flexados alrededor de su eje fuerte
F.6.    Miembros de seccion doble te y canales, flexados alrededor de su eje débil
F.7.    Secciones cajón simétricas con alas compactas, no compactas y esbeltas y con
        almas compactas y no compactas, flexadas alrededor de un eje de simetría
F.8.    Perfiles tubulares sin costura de sección circular
F.9.    Secciones Te y ángulos dobles en unión continua, cargadas en el plano de simetría
F.10.   Miembros de Ángulo simple
F.11.   Barras macizas de sección rectangular y circular
F.12.   Miembros con secciones asimétricas
F.13.   Requisitos dimensionales para vigas y vigas armadas.

 Para el Proyecto de miembros por corte ver el Capítulo G.

 Para miembros sometidos a flexión biaxil o a combinación de flexión y esfuerzo axil ver
  Secciones H.1. y H.3..

 Para miembros sometidos a torsión y a combinación de torsión, flexión, corte y/o fuerza
  axil ver Sección H.3..

 Para miembros sometidos a acciones cíclicas (fatiga) ver el Apéndice 3.

 Para miembros flexados con alma de altura variable ver la Recomendación CIRSOC 301-
  1.

Reglamento CIRSOC 301 – 2018                                                  Cap. F - 73


<!-- page 127 -->

F.1. ESPECIFICACIONES GENERALES

La resistencia de diseño a flexión, bMn (kNm), será determinada de la siguiente manera:

(1) b = 0,9 Para todos los casos incluidos en este Capítulo.
    Mn la resistencia nominal a flexión determinada de acuerdo con las Secciones F.2. a
         F.12..

(2) Las especificaciones de este Capítulo se basan en que los puntos de apoyo de los
    miembros flexados están restringidos contra la rotación alrededor del eje
    longitudinal del miembro.

(3) Para todos los casos de miembros con secciones de doble simetría y para los
    miembros con secciones de simple simetría con deformada con simple curvatura se
    tomará:

                                            12 , 5 M máx
                         Cb                                                               (F.1.1)
                                2 , 5 M máx  3 M A  4 M B  3 M C

    siendo:

              Cb     el factor de modificación para el estado límite de pandeo lateral-torsional
                     para diagramas de momento flector no uniformes, cuando están restringidos
                     al vuelco ambos extremos del segmento de viga no arriostrado.

              Mmáx   el valor absoluto del máximo momento flector en el segmento no arriostrado,
                     en kNm.

              MA     el valor absoluto del momento flector en la sección ubicada a un cuarto (1/4)
                     de la luz del segmento no arriostrado, en kNm.

              MB     el valor absoluto del momento flector en la sección ubicada a la mitad (1/2)
                     de la luz del segmento no arriostrado, en kNm.

              MC     el valor absoluto del momento flector en la sección ubicada a tres cuartos
                     (3/4) de la luz del segmento no arriostrado, en kNm.

        Se permite adoptar conservadoramente un valor Cb = 1 para todos los casos de
        diagramas de momento flector.

        Para miembros en voladizo, cuando el extremo libre no esté arriostrado, se deberá
        tomar Cb= 1 para todos los casos, cualquiera sea el diagrama de momento flector en el
        voladizo.

(4) Para miembros con secciones de simple simetría con deformada de doble curvatura
    el estado límite de pandeo lateral-torsional deberá ser verificado para ambas alas. La
    resistencia de diseño a flexión deberá ser mayor o igual que el máximo momento flector
    (resistencia requerida) que produce compresión en el ala considerada.


<!-- page 128 -->

F.2. MIEMBROS DE SECCIONES COMPACTAS DOBLE TE DE DOBLE
     SIMETRÍA Y CANALES, FLEXADOS ALREDEDOR DE SU EJE FUERTE

Las especificaciones de esta Sección se aplican a miembros de sección doble te de doble
simetría y a canales flexados alrededor del eje fuerte, y con alas y almas compactas para
flexión, tal como se definen en la Sección B.4.1. .

La resistencia nominal a flexión, Mn (kNm), será el menor valor obtenido para los estados
límites de plastificación y pandeo lateral-torsional.

F.2.1. Estado límite de plastificación

La resistencia nominal a flexión, Mn (kNm), se determinará con la siguiente expresión:

                 Mn = Mp = Fy Zx(10-3)  1,5 My                                              (F.2.1)

siendo:

          Mp el momento plástico, en kNm.

          My el momento elástico; momento para el cual alcanza la fluencia la fibra más alejada
             del eje neutro. (= Fy Sx (10-3) para secciones homogéneas; = Fyf Sx (10-3) para
             secciones híbridas), en kNm.

          Fy la tensión de fluencia mínima especificada, en MPa.

          Fyf la tensión de fluencia mínima especificada del acero del ala, en MPa.

          Zx el módulo plástico de la sección respecto del eje fuerte, en cm3.

          Sx el módulo resistente elástico de la sección respecto del eje fuerte, en cm3.

F.2.2. Estado límite de pandeo lateral-torsional

La resistencia nominal a flexión, Mn (kNm), se determinará por:

(a) Cuando Lb  Lp       Mn = Mp

(b) Cuando Lp < Lb  Lr

   para cargas aplicadas en las almas o en las alas de la viga:

                                             L    L p  
                                   
                 Mn Cb M p  M p  Mr
                        
                                               b          
                                                           Mp                              (F.2.2)
                                               Lr  Lp  
                                                        

(c) Cuando Lb > Lr

Reglamento CIRSOC 301 – 2018                                                           Cap. F - 75


<!-- page 129 -->

    para cargas aplicadas en las almas o en las alas de la viga:

                   M n  M cr  M p                                                                          (F.2.3)
siendo:

          Mp      el momento plástico según la expresión (F.2.1), en kNm.

          Lb     la distancia entre puntos de arriostramiento contra el desplazamiento lateral del
                 ala comprimida, o entre puntos de arriostramiento para impedir la torsión de la
                 sección transversal, en cm.

          Lp      la longitud lateralmente no arriostrada límite definida mas adelante, en cm.

          Lr      la longitud lateralmente no arriostrada límite definida mas adelante, en cm.

          Mr      el momento límite para pandeo lateral-torsional definido mas adelante, en kNm.

          Mcr     el momento crítico elástico determinado de la siguiente manera:

                (1) Para cargas aplicadas en el alma o en el ala inferior de la viga:

                                                                                        2
                                                                         E 
                    M cr  10       3
                                          C   b
                                                   
                                                            E I y G J      
                                                                          L 
                                                                                            I y Cw =
                                                   Lb                     b 

                        
                             10 C S X
                                     3
                                            b       x       1       2
                                                                            1
                                                                                   X12 X 2
                                                                                                            (F.2.4a)
                                          Lb                                      L       
                                                                                               2
                                                                                 2 b
                                                   ry
                                                                                     r y 

                (2) Para cargas aplicadas en el ala superior de la viga:

                    M cr 
                             10  1 , 28 C S X
                                     3
                                                        b       x       1
                                                                                                           (F.2.4b)
                                           Lb / r y

                       E G J Ag
          X1                                  (MPa)                                                       (F.2.4c)
                  Sx             2

                                      2
               4 C w  S x 
          X2                                (MPa)-2                                                     (F.2.4d)
                Iy  GJ 

          Sx el módulo resistente elástico de la sección con respecto al eje principal de mayor
             inercia (eje fuerte), en cm3.

          E     el módulo de elasticidad longitudinal del acero, en MPa.


<!-- page 130 -->

       G el módulo de elasticidad transversal del acero, en MPa.

       Iy     el momento de inercia de la sección con respecto al eje principal de menor inercia,
              en cm4.

       J      el módulo de torsión de la sección transversal, en cm4.

       ry el radio de giro de la sección con respecto al eje principal de menor inercia, en cm.

       Ag el área bruta de la sección transversal, en cm2.

       Cw el módulo de alabeo de la sección, en cm6.

Para determinar la resistencia nominal a flexión cuando la carga esté aplicada por encima
del ala superior de la viga, se deberá realizar un análisis que considere la influencia de la
distancia del punto de aplicación de la carga al baricentro de la sección.

   La longitud lateralmente no arriostrada límite, Lp (cm), será determinada de la siguiente
    manera:

       (1) Para cargas aplicadas en el alma o en el ala inferior de la viga:

                                          E
                      L p  1 , 76 r y                                                     (F.2.5a)
                                         F yf

       (2) Para cargas aplicadas en el ala superior de la viga:

                                          E
                      L p  1 , 59 r y                                                     (F.2.5b)
                                         F yf

    siendo:

            ry el radio de giro de la sección con respecto al eje principal de menor inercia, en cm.

   La longitud lateralmente no arriostrada límite, Lr (cm), y el correspondiente momento de
    pandeo lateral-torsional, Mr (kNm), serán determinadas de la siguiente manera:

       (1) Para cargas aplicadas en el alma o en el ala inferior de la viga:

                          ry X 1
                   Lr             1    1  X 2 FL 2                                       (F.2.6a)
                           FL

                                   
                   M r  F L S x 10 3                                                     (F.2.7a)

Reglamento CIRSOC 301 – 2018                                                           Cap. F - 77


<!-- page 131 -->

        (2) Para cargas aplicadas en el ala superior de la viga:

                                  ry X 1
                   L r  1 , 28                                                              (F.2.6b)
                                   FL

                                    
                   M r  F L S x 10 3                                                      (F.2.7b)

            siendo:

                      Sx     el módulo resistente elástico de la sección con respecto al eje principal
                             de mayor inercia, en cm3.

                      ry     el radio de giro de la sección con respecto al eje principal de menor
                             inercia en cm.

                      FL     el menor valor de (Fyf - Fr) ó Fyw , en MPa.

                      Fr     la tensión residual de compresión en ala igual a 69 MPa para
                             secciones laminadas, e igual a 114 MPa para secciones soldadas.

                      Fyf    la tensión de fluencia del acero del ala, en MPa.

                      Fyw    la tensión de fluencia del acero del alma, en MPa.

F.3. MIEMBROS DE SECCIÓN DOBLE TE DE DOBLE SIMETRÍA Y CANALES
     CON ALMAS COMPACTAS Y ALAS NO COMPACTAS O ESBELTAS,
     FLEXADOS ALREDEDOR DE SU EJE FUERTE

Las especificaciones de esta Sección se aplican a miembros de sección doble te de doble
simetría y a canales, flexados alrededor del eje fuerte, y con sus almas compactas y sus
alas no compactas o esbeltas para flexión, tal como se definen en la Sección B.4.1..

La resistencia nominal a flexión, Mn (kNm), será el menor valor obtenido para los estados
límite de pandeo lateral-torsional y pandeo local del ala comprimida.

F.3.1. Estado límite de pandeo lateral-torsional

Se aplican las especificaciones de la Sección F.2.2., para pandeo lateral-torsional.

F.3.2. Estado límite de pandeo local del ala comprimida

        (a) Para alas no compactas (  rf ):

                                                       p         
                                           
                            Mn  Mp  Mp Mr              f       
                                                                                             (F.3.1)
                                                       rf   pf   
                                                                    


<!-- page 132 -->

       (b) Para alas esbeltas (  rf):

                                                      0 , 69 E S x
        Para secciones laminadas              Mn                    ( 10 )  3            (F.3.2a)
                                                              2
                                                          

                                                      0 ,9E k c S x
        Para secciones armadas                Mn                      ( 10 )  3          (F.3.2b)
                                                                  2
                                                           

           siendo:

                      la esbeltez del ala: para doble Te = (bf /2tf ), para canales (b/tf ).

                pf    la esbeltez límite para ala compacta (Tabla B.4.1b: caso 11).

                rf    la esbeltez límite para ala no compacta (Tabla B.4.1b: caso 11 seccio-
                       nes laminadas; caso 12 secciones armadas).

                Mp     el momento plástico de la sección transversal, en kNm.

                Mr     el momento crítico de pandeo elástico = FLSx(10)-3, en MPa.

                FL     el menor valor entre (Fyf - Fr ) ó Fyw , en MPa.

                Fr     la tensión residual de compresión en el ala igual a 69 MPa para
                       secciones laminadas e igual a 114 MPa para secciones soldadas.

                Fyf    la tensión de fluencia del acero del ala, en MPa.

                Fyw la tensión de fluencia del acero del alma, MPa.

                Sx     el módulo resistente elástico de la sección con respecto al eje principal
                       de mayor inercia, en cm3.

                           4
                kc =             para el cálculo será 0,35  kc  0,763 .
                          h/tw

                h      la altura definida en la Sección B.4.1(b), en cm.

                tw     el espesor del alma, en cm.

F.4. OTROS MIEMBROS DE SECCIÓN DOBLE TE CON ALMAS COMPACTAS O
     NO COMPACTAS, CANALES CON ALMAS NO COMPACTAS, TODOS CON
     ALAS COMPACTAS, NO COMPACTAS O ESBELTAS Y FLEXADOS
     ALREDEDOR DE SU EJE FUERTE

Las especificaciones de esta Sección se aplican a: (a) miembros de sección doble Te de
doble simetría con almas no compactas; (b) canales con almas no compactas; (c) miembros
de sección doble Te de simple simetría con almas unidas a las alas a la mitad del ancho de

Reglamento CIRSOC 301 – 2018                                                            Cap. F - 79


<!-- page 133 -->

estas y con almas compactas o no compactas; todos los miembros citados flexados
alrededor del eje fuerte y con alas compactas, no compactas o esbeltas.

La resistencia nominal a flexión, Mn (kNm), será el menor valor obtenido para los estados
límite de fluencia del ala comprimida, pandeo lateral-torsional, pandeo local del ala
comprimida y fluencia del ala traccionada.

F.4.1. Estado límite de fluencia del ala comprimida

                               Mn = Rpc Mxc = RpcFyf Sxc(10)-3                                                 (F.4.1)

siendo:

          Mxc       el momento elástico referido al ala comprimida, en KNm.

        Sxc         el módulo resistente elástico de la sección respecto del eje de flexión referido al
                    ala comprimida, en cm3.

          Rpc       el factor de plastificación del alma que se determina mas adelante.

F.4.2. Estado límite de pandeo lateral-torsional

(a) Cuando Lb  Lp , el pandeo lateral-torsional no es crítico

(b) Cuando Lp < Lb  Lr

                                                                                L L 
                                              
                M n  C b  R pc M xc  R pc M xc  F L S xc 10  3
                          
                                                                                b
                                                                                
                                                                                       p 
                                                                                           R pc M xc        (F.4.2)
                                                                                 Lr Lp  
                                                                                       

(c) Cuando Lb > Lr

                    Mn = Fcr Sxc (10)-3  Rpc Mxc                                                              (F.4.3)

    siendo:

                Mxc = Fyf Sxc (10)-3                                                                           (F.4.4)

                                                                        2
                        Cb 2E                       cJ      L 
                Fcr =                  1  0 , 078            b                                              (F.4.5)
                                                                   
                                                   S xc h o  r t 
                                   2
                        L 
                         b 
                            
                          rt 

                J   el módulo de torsión de la sección transversal, en cm4. Para (Iyc / Iy )  0,23 se
                    tomará J = 0 .


<!-- page 134 -->

            c - para secciones doble Te c = 1,0
                                       ho      Iy
                  - para canales c 
                                         2    Cw

            Iyc el momento de inercia del ala comprimida respecto del eje y (eje débil), en cm4.

            Iy el momento de inercia de la sección transversal total respecto del eje y , en cm4.

            FL la tensión límite en el ala comprimida determinada mas adelante, en MPa.

            rt    el radio de giro efectivo respecto del eje y que se determina mas adelante, en
                  cm.

            ho la distancia entre centro de gravedad de las alas, en cm.

            Lb la longitud lateralmente no arriostada, en cm.

            Lp la longitud lateralmente no arriostrada límite definida más adelante, en cm.

            Lr la longitud lateralmente no arriostrada límite definida más adelante, en cm.

   La tensión límite FL será determinada de la siguiente manera:

    (1) Cuando (Sxt / Sxc)  0,7

       FL el menor valor de (Fyf - Fr) ó Fyw. (MPa)                                      (F.4.6a)

       Fr la tensión residual de compresión en el ala igual a 69 MPa para secciones lamina-
          das, e igual a 114 MPa para secciones soldadas.

    (2) Cuando (Sxt / Sxc) < 0,7

       FL = Fyf (Sxt / Sxc)  0,5 Fy f                                                   (F.4.6b)

        siendo:

                  Sxc el módulo resistente elástico de la sección respecto del eje de flexión
                      referido al ala comprimida, en cm3.

                 Sxt el módulo resistente elástico de la sección respecto del eje de flexión
                     referido al ala traccionada, en cm3.

   La longitud lateralmente no arriostrada límite para alcanzar la fluencia, Lp , en cm,
    será:

                                              E
                         L p  1 , 10 r t                                                  (F.4.7)
                                             F yf

Reglamento CIRSOC 301 – 2018                                                         Cap. F - 81


<!-- page 135 -->

   La longitud lateralmente no arriostrada límite para el pandeo lateral inelástico, Lr en
    cm, será:

                                                                              2                     2
                                     E       cJ             cJ                          FL 
                  L r  1 , 95 r t                                            6 , 76                  (F.4.8)
                                                                                       
                                     FL       S xc h o       S xc h o                   E 

   El factor de plastificación del alma, Rpc , será determinado por:

    (1) Cuando (Iyc / Iy ) > 0,23

        1.a) Cuando (hc / tw )  pw

                                         Rpc = (Mp / Mxc )                                                   (F.4.9a)

        1.b) Cuando (hc / tw ) > pw

                                                  M        Mp           pw           M
                                                                                            
                                          R pc              1  
                                                      p                                          p
                                                                                                    (F.4.9b)
                                                                       rw   pw           M xc
                                                  M xc  M xc                              

    (2) Cuando (Iyc / Iy )  0,23

                                         Rpc = 1,0

        siendo:

                  Mp     el momento plástico; en secciones homogéneas
                           Mp = Zx Fy(10)-3  1,5Sxc Fy (10)-3 (MPa).

                   = (hc / tw )

                  pw la esbeltez límite para alma compacta.Tabla B.4.1b.

                  rw    la esbeltez límite para alma no compacta. Tabla B.4.1b.

                  hc     el doble de la distancia entre el centro de gravedad de la sección y: (a)
                         para perfiles laminados la cara interna del ala comprimida menos el radio
                         de encuentro; (b) para secciones armadas abulonadas la línea de bulones
                         más cercana al ala comprimida; (c) para secciones armadas soldadas la
                         cara interna del ala comprimida, en cm.


<!-- page 136 -->

    El radio de giro efectivo para pandeo lateral-tosional, rt (cm), será determinado de la
     siguiente manera:

     (1) Para secciones doble Te con el ala comprimida rectangular

                                              b fc
                           rt                                                                  (F.4.10)
                                         h     a w h 2 
                                    12 
                                            o
                                                         
                                         d      6 h o d 
                                        

        siendo:

                  ho    la distancia entre el centro de gravedad de las alas, en cm.

                  h     la altura definida en la Sección B.4.1(b), en cm).

                  d     la altura total de la sección transversal, en cm.

                  aw = (hctw / bfc tfc )

                  bfc   el ancho del ala comprimida, en cm.

                  tfc   el espesor del ala comprimida, en cm.

    (2) Para secciones canal

                                     I y Cw
                           r t2                                                                (F.4.11)
                                     Sx

    (3) Para secciones doble Te con canales o platabandas unidas al ala comprimida

        rt    el radio de giro de los componentes del ala comprimida por flexión más 1/3 del
              área comprimida del alma debido sólo al momento flector alrededor del eje fuerte,
              en cm.

        aw    relación entre 2 veces el área comprimida del alma debida sólo a la flexión
              alrededor del eje fuerte y el área de los componentes del ala comprimida, en cm.

F.4.3. Estado límite de pandeo local del ala comprimida

     (a) Para secciones con alas compactas no es aplicable el estado límite de pandeo local
         del ala comprimida

     (b) Para secciones con alas no compactas

                                                                                
                                                                                    
                  M n   R pc M xc  ( R pc M xc  F L S x 10  3 ) 
                                                                               pf
                                                                                             (F.4.12)
                                                                       rf   pf   
                                                                                   

Reglamento CIRSOC 301 – 2018                                                                Cap. F - 83


<!-- page 137 -->

    (c) Para secciones con alas esbeltas

                         0 , 9 E k c S xc
                  Mn                        ( 10 ) 3                                       (F.4.13)
                                     2
                                 

        siendo:
                        la esbeltez del ala = (bf /2tf ) .

                  pf    la esbeltez límite para ala compacta (Tabla B.4.1b : caso 11).

                  rf    la esbeltez límite para ala no compacta (Tabla B.4.1b, caso 12 seccio-
                         nes armadas).

                  Mxc el momento elástico referido al ala comprimida, en KNm.

                  Rpc el factor de plastificación del alma definido por las expresiones (F.4.9a)
                      ó (F.4.9b).

                  FL     el menor valor de (Fyf - Fr) ó Fyw (MPa).

                  Fr     la tensión residual de compresión en ala igual a 69 MPa para secciones
                         laminadas, e igual a 114 MPa para secciones soldadas.

                  Fyf    la tensión de fluencia del acero del ala, en MPa.

                  Fyw    la tensión de fluencia del acero del alma, en MPa.

                  Sxc    el módulo resistente elástico de la sección con respecto al eje principal de
                         mayor inercia referido al ala comprimida, en cm3.

                             4
                  kc =                   Para el cálculo será 0,35  kc  0,763.
                            h/tw

                  h      la altura definida en la Sección B.4.1(b) , en cm.

                  tw     el espesor del alma, en cm.

F.4.4. Estado límite de fluencia del ala traccionada

(a) Cuando Sxt  Sxc , el estado limite de fluencia del ala traccionada no es crítico.

(b) Cuando Sxt < Sxc

                          Mn = Rpt Mxt                                                        (F.4.14)

    siendo:

          Mxt el momento elástico referido al ala traccionada = Fy Sxt (10)-3 , en KNm.


<!-- page 138 -->

         Sxt   el módulo resistente elástico de la sección respecto del eje de flexión referido al
               ala traccionada, en cm3.

   El factor de plastificación del alma correspondiente al estado límite de fluencia del ala
    traccionada, Rpt , se determinará de la siguiente manera:

    (1) Cuando (hc / tw)  pw

                                 Rpt = (Mp / Mxt)                                           (F.4.15a)

    (2) Cuando (hc / tw) > pw

                                         M        Mp           pw   M p
                                 R pt              1                    
                                             p
                                                                                      (F.4.15b)
                                         M xt  M xt         rw   pw   M xt

     siendo:

           Mp el momento plástico; en secciones homogéneas Mp = ZxFy(10)-3  1,5Sxt Fy (10)-3
              (MPa)

            = (hc / tw)

           pw la esbeltez límite para alma compacta.Tabla B.4.1b.

           rw la esbeltez límite para alma no compacta. Tabla B.4.1b.

           hc el doble de la distancia entre el centro de gravedad de la sección y: (a) para
              perfiles laminados la cara interna del ala comprimida menos el radio de
              encuentro; para secciones armadas abulonadas la línea de bulones mas
              cercana al ala comprimida; para secciones armadas soldadas la cara interna del
              ala comprimida, en cm.

F.5. MIEMBROS DE SECCIÓN DOBLE TE DE SIMPLE Y DOBLE SIMETRÍA CON
     ALMAS ESBELTAS FLEXADOS ALREDEDOR DE SU EJE FUERTE

Las especificaciones de esta Sección se aplican a miembros de sección doble Te de doble y
simple simetría con almas esbeltas (según se define en la Sección B.4.1. para flexión),
unidas a la mitad del ancho del ala, flexadas alrededor del eje fuerte y con secciones
homogéneas o híbridas.

La resistencia nominal a flexión, Mn (kNm), será el menor valor obtenido para los estados
límite de fluencia del ala comprimida, pandeo lateral-torsional, pandeo local del ala
comprimida y fluencia del ala traccionada.

F.5.1. Estado límite de fluencia del ala comprimida

                      Mn = Re Rpg Fyf Sxc (10)-3                                               (F.5.1)

Reglamento CIRSOC 301 – 2018                                                              Cap. F - 85


<!-- page 139 -->

F.5.2. Estado límite de pandeo lateral-torsional

                              Mn = Re Rpg Fcr Sxc (10)-3                                             (F.5.2)

(a) Cuando Lb  Lp el pandeo lateral-torsional no será crítico

(b) Cuando Lp < Lb  Lr

                                                   L    L p  
                                      
                 F cr  C b  F yf  F yf  F r
                            
                                                     b          
                                                                   F yf      (MPa)                (F.5.3)
                                                     Lr  Lp 
                                                              

(c) Cuando Lb > Lr

                         1970000 C b
                 Fcr =                     F yf                                (MPa)                (F.5.4)
                          ( Lb / rt ) 2

siendo:
                                E
          L p  1 , 10 r t            (cm)                                                          (F.5.5a)
                               F yf

                               E
          Lr  rt                    (cm)                                                         (F.5.5b)
                         F yf  F r

          Rpg el factor de reducción

                               aw      h                            
                                       c                     E      
               = 1                         5 , 70                   1 ,0                        (F.5.6)
                      1200  300 a w  t w                  F crf   
                                                                     

                   hc t w
          aw =                 10
                  b fc t fc

                 12  a w ( 3 m  m 3 )
          Re                               1 , 0 .        El factor de viga armada híbrida para secciones
                         12  2 a w
                 homogéneas será:

                                                       Re = 1,0)

          m      la relación entre Fyw y Fyf o Fcrf .

          rt     el radio de giro efectivo para pandeo lateral, en cm. Para secciones doble Te
                 como se define en la Sección F.4.

          hc     el doble de la distancia entre el centro de gravedad de la sección y: (a) para


<!-- page 140 -->

                   secciones armadas abulonadas la línea de bulones mas cercana al ala
                   comprimida; (b) para secciones armadas soldadas la cara interna del ala
                   comprimida, en cm.

       bfc         el ancho del ala comprimida, en cm.

       tfc         el espesor del ala comprimida, en cm.

       tw          el espesor del alma, en cm.

       Fcrf     la tensión crítica del ala comprimida para estado límite de pandeo lateral o pandeo
                local del ala, la que sea menor, en MPa.
                Se permite tomar conservadoramente Fcrf = Fyf

       Fyf , Fyw la tensión de fluencia del acero de las alas y del alma respectivamente, en
              MPa.

       Fr           la tensión residual de compresión en el ala, en MPa.

F.5.3. Estado límite de pandeo del ala comprimida

                                 Mn = Re Rpg Fcrf Sxc (10)-3                                    (F.5.7)

(a) Cuando f  pf el pandeo local del ala comprimida no es aplicable. Fcrf = Fy

(b) Cuando pf < f  rf

                                                             
                                     
                   F crf   F yf  F yf  F L
                           
                                                     f     pf  
                                                                        (MPa)                  (F.5.8)
                                                      rf   pf  
                                                                

(c) Cuando f > rf

                             180000 k c
                   Fcrf =                       F yf                    (MPa)                  (F.5.9)
                            ( bf / 2 t f ) 2

   siendo:

              f       la esbeltez del ala = (bf /2 t f) .

              pf      la esbeltez límite para ala compacta (Tabla B.4.1b :caso 12).

              rf      la esbeltez límite para ala no compacta (Tabla B.4.1b , caso 12).

              Sxc      el módulo resistente elástico de la sección respecto del eje de flexión referido
                       al ala comprimida, en cm3.

                             4
              kc =                   para el cálculo será 0,35  kc  0,763 .
                            h/tw

Reglamento CIRSOC 301 – 2018                                                              Cap. F - 87


<!-- page 141 -->

            h       la altura definida en la Sección B.4.1(b), en cm.

            tw      el espesor del alma, en cm.

F.5.4. Estado límite de fluencia del ala traccionada

    (a) Cuando Sxt  Sxc , la fluencia del ala traccionada no es crítica

    (b) Cuando Sxt < Sxc

                          Mn = Re Fyf Sxt (10)-3                                         (F.5.10)

        siendo:

                  Sxt   el módulo resistente elástico de la sección referido al ala traccionada, en
                        cm3 .

F.6. MIEMBROS DE SECCION DOBLE TE Y CANALES, FLEXADOS ALREDE-
     DOR DE SU EJE DÉBIL

Las especificaciones de esta Sección son aplicables a miembros de sección doble Te y
canales flexando alrededor de su eje débil.

La resistencia nominal a flexión, Mn (kNm), será el menor valor obtenido para los estados
límite de plastificación (momento plástico) y pandeo local del ala.

F.6.1. Estado límite de plastificación

                          Mn = Mp = Fy Zy (10)-3  1,5 Fy Sy (10)-3                         (F.6.1)

F.6.2. Estado límite de pandeo local del ala

(a) Cuando f  pf (alas compactas) el pandeo local del ala comprimida no es aplicable.

(b) Cuando pf < f  rf (ala no compacta)

                                                                        
                                
                  M n   M p  M p  0 , 7 F y S y 10  3
                        
                                                                f     pf  
                                                                                           (F.6.2)
                                                                 rf   pf  
                                                                           

(c) Cuando f > rf (ala esbelta)

                  Mn = Fcr Sy (10)-3


<!-- page 142 -->

   siendo:

                        138000
              Fcr =                           (MPa)                                              (F.6.3)
                      ( bf / t f ) 2

              f      la esbeltez del ala = (bf/tf) .

              pf     la esbeltez límite para ala compacta (Tabla B.4.b: caso 14).
              
              r f    la esbeltez límite para ala no compacta (Tabla B.4.1b, caso 14).

              bf      para alas de sección doble Te = mitad de la longitud del ala completa; para
                      alas de secciones canal = longitud del ala completa, en cm.

              tf      el espesor del ala, en cm.

              Sy      el módulo resistente elástico de la sección respecto del eje y. Para secciones
                      canal se tomará el módulo mínimo, en cm3.

F.7.      SECCIONES CAJÓN SIMÉTRICAS CON ALAS COMPACTAS, NO
          COMPACTAS Y ESBELTAS Y CON ALMAS COMPACTAS Y NO
          COMPACTAS, FLEXADAS ALREDEDOR DE UN EJE DE SIMETRÍA

Las especificaciones de esta Sección son aplicables a miembros de sección cajón simétrica
con alas compactas, no compactas o esbeltas y almas compactas o no compactas, flexando
alrededor de un eje de simetría.

La resistencia nominal a flexión, Mn (kNm), será el menor valor obtenido para los estados
límite de plastificación (momento plástico), pandeo lateral-torsional, pandeo local del
ala y pandeo local del alma.

F.7.1. Estado límite de plastificación (momento plástico)

                                       Mn = Mp = Fy Z (10)-3  1,5 Fy S (10)-3                   (F.7.1)

siendo:

          Mp el momento plástico de la sección transversal, en kNm.

          Z   el módulo plástico de la sección transversal relativo al eje de flexión, en cm3.

          S el módulo resistente elástico de la sección transversal relativo al eje de flexión, en
            cm3.

          Fy la tensión de fluencia mínima especificada del acero, en MPa.

Reglamento CIRSOC 301 – 2018                                                             Cap. F - 89


<!-- page 143 -->

F.7.2. Estado límite de pandeo lateral-torsional

Sólo aplicable para flexión alrededor del eje fuerte

La resistencia nominal a flexión, Mn (kNm), se determinará por:

(a) Cuando Lb  Lp         Mn = Mpx

(b) Cuando Lp < Lb  Lr

        para cargas aplicadas en las almas o en las alas de la viga :

                                                           L L 
                                        
                    M n  C b  M px  M px  M r
                              
                                                           b
                                                           
                                                                   p 
                                                                      Mpx                    (F.7.2)
                                                            Lr  Lp  
                                                                   

(c) Cuando Lb > Lr

    para cargas aplicadas en las almas o en las alas de la viga:

                    M n  M cr  M px                                                          (F.7.3)

    siendo:

              Mpx      el momento plástico referido al eje fuerte, en kNm.

              Lb       la distancia entre puntos de arriostramiento contra el desplazamiento lateral
                       del ala comprimida, o entre puntos de arriostramiento para impedir la tor-
                       sión de la sección transversal, en cm.

              Lp       la longitud lateralmente no arriostrada límite definida más adelante, en cm.

              Lr       la longitud lateralmente no arriostrada límite definida más adelante, en cm.

              Mr       el momento límite para pandeo lateral-torsional definido más adelante, en
                       kNm.

              Mcr      el momento crítico elástico (kNm) determinado de la siguiente manera:

                       (1) Para cargas aplicadas en el alma o en el ala inferior de la viga:

                                     2 ( 10 ) 3 E C b
                            M cr                            J Ag                              (F.7.4)
                                            Lb   ry

                       (2) Para cargas aplicadas en el ala superior de la viga:

                                     1 , 8 ( 10 ) 3 E C b
                            M cr                              J Ag                            (F.7.5)
                                            Lb    ry


<!-- page 144 -->

           E        el módulo de elasticidad longitudinal del acero, en MPa.

           J        el módulo de torsión de la sección transversal, en cm4.

           ry       el radio de giro de la sección con respecto al eje principal de menor inercia,
                    en cm.

           Ag        el área bruta de la sección transversal, en cm2.

Para determinar la resistencia nominal a flexión cuando la carga está aplicada por encima
del ala superior de la viga, se deberá realizar un análisis que considere la influencia de la
distancia del punto de aplicación de la carga al baricentro de la sección.

   La longitud lateralmente no arriostrada límite, Lp (cm), será determinada de la siguiente
    manera:

    (1) Para cargas aplicadas en el alma o en el ala inferior de la viga:

                            1 , 3 ( 10 4 ) r y E
                     Lp                            J Ag                                   (F.7.6)
                                    M px

    (2) Para cargas aplicadas en el ala superior de la viga:

                            1 , 2 ( 10 4 ) r y E
                     Lp                            J Ag                                   (F.7.7)
                                    M px

       siendo:

                 ry el radio de giro de la sección con respecto al eje principal de menor inercia,
                    en cm.

   La longitud lateralmente no arriostrada límite, Lr (cm), y el correspondiente momento de
    pandeo lateral-torsional Mr (kNm), serán determinadas de la siguiente manera:

    (1) Para cargas aplicadas en el alma o en el ala inferior de la viga:

                   2 ( 10 3 ) r y E
            Lr                         J Ag                                               (F.7.8)
                         Mr

                            
            M r  F yf S x 10 3                                                          (F.7.9)

Reglamento CIRSOC 301 – 2018                                                         Cap. F - 91


<!-- page 145 -->

    (2) Para cargas aplicadas en el ala superior de la viga:

                          1 , 8 ( 10 3 ) r y E
               Lr                                J Ag                                              (F.7.10)
                                  Mr

               M r  F yf S x 10 3                                                               (F.7-11)

        siendo:
                     Sx       el módulo resistente elástico de la sección con respecto al eje principal de
                              mayor inercia, en cm3.

                     ry       el radio de giro de la sección con respecto al eje principal de menor
                              inercia, en cm. Para secciones soldadas, en MPa.

                     Fyf      la tensión de fluencia del acero del ala, en MPa.

F.7.3. Estado límite de pandeo local del ala

La resistencia nominal a flexión, Mn (kNm), se determinará por medio de las siguientes
expresiones:

(a) Para alas compactas y no compactas (f  rf ):

                                       f p                 
                                      
                     Mn  Mp  Mp Mr           f
                                                              
                                                               M p                                (F.7.12)
                                        rf   pf            
                                                              

(b) Para alas esbeltas (f  rf ):

                     Mn = S Fcr (10)-3                                                               (F.7.13)

    siendo:

              Mp          el momento plástico de la sección transversal relativo al eje de flexión, en
                          kNm.

              S           el módulo resistente elástico de la sección transversal relativo al eje de flexión,
                          en cm3.

              f          la esbeltez del ala (bf /tf) .

              pf         la esbeltez límite para ala compacta (Tabla B.4.1b :caso 19).

              r f        la esbeltez límite para ala no compacta (Tabla B.4.1b , caso 19).


<!-- page 146 -->

                bf       el ancho del ala según se define en la Sección B.4.1(b), en cm.

                tf       el espesor del ala, en cm.

                Mr = Fy S(10)-3 , en kNm                                                          (F.7.14)

                Fcr      la tensión crítica de pandeo Fcr = Fy (Seff /S), en MPa.                 (F.7.15)

                Seff     el módulo resistente elástico de la sección efectiva relativo al eje de flexión.
                         La sección efectiva se determinará con el ancho efectivo reducido be del ala
                         comprimida calculado según lo especificado en la Sección E.7.2. [expresión
                         (E.7.17)] con f = Fy, en cm3

F.7.4. Estado límite de pandeo local del alma

La resistencia nominal a flexión, Mn (kNm), se determinará por medio de las siguientes
expresiones:

Para almas compactas y no compactas (w  rw):

                                                    pw 
                                   
                       Mn  Mp  Mp Mr         w          M
                                                                 p                              (F.7.16)
                                                  rw   w 

siendo:

          Mp         el momento plástico de la sección transversal relativo al eje de flexión, en kNm.

          w         la esbeltez del alma (h/tw ).

          pw        la esbeltez límite para ala compacta (Tabla B.4.1b :caso 21).

          r w la esbeltez límite para ala no compacta (Tabla B.4.1b , caso 21).

          hw         la altura del alma según se define en la Sección B.4.1(b), en cm.

          tw         el espesor del alma, en cm.

          Mr = Fy S (10)-3 , en kNm.                                                              (F.7.17)

          S          el módulo resistente elástico de la sección transversal relativo al eje de flexión, en
                     cm3.

F.8. PERFILES TUBULARES SIN COSTURA DE SECCIÓN CIRCULAR

Las especificaciones de esta Sección son aplicables a miembros tubulares de sección
circular con una relación D/t < (0,45 E/Fy).

La resistencia nominal a flexión, Mn (kNm), será el menor valor obtenido para los estados
límite de plastificación (momento plástico) y pandeo local.

Reglamento CIRSOC 301 – 2018                                                                  Cap. F - 93


<!-- page 147 -->

F.8.1. Estado límite de plastificación (momento plástico)

                                  Mn = Mp = Fy Z (10)-3                                   (F.8.1)

siendo:

          Z el módulo plástico de la sección transversal, en cm3.

F.8.2. Estado límite de pandeo local

(1) Para secciones compactas (  p) el estado límite de pandeo local no es aplicable.

(2) Para secciones no compactas (p <   r):

                                                        
                                                        
                                        0 , 021 E       
                                  M n             F y  S ( 10 ) 3                    (F.8.2)
                                        D             
                                                      
                                         t         

(3) Para secciones esbeltas (r)

                                                 
                                                 
                                       0 , 33 E 
                                  Mn             S ( 10 )  3                          (F.8.3)
                                       D 
                                              
                                        t  

siendo:
          = (D / t)

          p    la esbeltez límite para sección compacta (Tabla B.4.1b :caso 23).

          r    la sbeltez límite para sección no compacta (Tabla B.4.1b , caso 23).

          D     el diámetro exterior del tubo, en cm.

          t     el espesor de la pared del tubo, en cm.

          S     el módulo resistente elástico de la sección circular, en cm3.


<!-- page 148 -->

F.9. SECCIONES TE Y ÁNGULOS DOBLES EN UNIÓN CONTINUA, CARGADAS
     EN EL PLANO DE SIMETRÍA

Las especificaciones de esta Sección se aplican a miembros con secciones Te y secciones
doble ángulo en contacto continuo, cargadas en el plano de simetría.

La resistencia nominal a flexión, Mn (kNm), será el menor valor obtenido para los estados
límites de plastificación (momento plástico), pandeo lateral-torsional, pandeo local del
ala y pandeo local del alma en secciones Te.

F.9.1. Estado límite de plastificación

                           Mn = Mp                                                      (F.9.1)

siendo:

          (1) Para almas traccionadas

              Mn = Fy Zx (10)-3 1,5 My                                                 (F.9.2)

          (2) Para almas comprimidas

              Mn = Fy Zx (10)-3 1,0 My                                                 (F.9.3)

F.9.2. Estado límite de pandeo lateral-torsional

                                       10   E I G J 
                                            3
                                                      y
                   M n  M cr                                 B 1B 2                (F.9.4)
                                                                      
                                                 Lb

siendo:

          Mn  1,5 My para almas traccionadas por la flexión.

          Mn  1,0 My para almas comprimidas por la flexión.

          B =  2 , 3  d L       
                                      Iy   J                                           (F.9.5)
                              b   

          d       la altura de la sección, en cm.

El signo positivo de B se aplica cuando el alma está traccionada, y el signo negativo cuando el
alma está comprimida. Si el borde libre del alma está comprimido en alguna sección de la viga
a lo largo de la longitud no arriostrada se deberá usar signo negativo para B.

Reglamento CIRSOC 301 – 2018                                                      Cap. F - 95


<!-- page 149 -->

F.9.3. Estado límite de pandeo local para alas de sección Te comprimidas

(a) Para secciones Te con alas comprimidas compactas para flexión, el estado límite de
    pandeo local de ala no es aplicable.

(b) Para secciones Te con alas comprimidas no compactas para flexión:

                                                                                         
                                               
                              M n   M p  M p  0 , 7 F y S xc 10  3
                                    
                                                                              f
                                                                              
                                                                                        pf    
                                                                                                 1 ,5 M y    (F.9.6)
                                                                                rf   pf   
                                                                                            

(c) Para secciones Te con alas comprimidas esbeltas para flexión:

                                     0 , 7 E S xc
                              Mn                   ( 10 )  3                                                  (F.9.7)
                                       b      
                                       f      
                                             
                                        2tf    

    siendo:

                f      la esbeltez del ala = (bf /2 t f) .

                pf     la esbeltez límite para ala compacta (Tabla B.4.1b :caso 11).

                rf     la esbeltez límite para ala no compacta (Tabla B.4.1b , caso 11).

                bf      el ancho total del ala de la Te, en cm.

                tf      el espesor del ala, en cm.

                Sxc     el módulo resistente elástico de la sección referido al ala comprimida, en cm3.

Para ángulos dobles con las alas comprimidas el momento nominal Mn (kNm) para el estado
límite de pandeo local del ala será determinado con las especificaciones de la Sección F.10.3.
con el ancho del ala del ángulo y el límite superior dado por la expresión (F.10.1).

F.9.4. Estado límite de pandeo local del alma de sección Te comprimida por flexión

                                       Mn = Fcr Sx (10)-3                                                        (F.9.8)

siendo:

          Sx          el módulo resistente elástico referido al extremo comprimido del alma, en cm3.

          Fcr         la tensión crítica de pandeo local del alma, en MPa.


<!-- page 150 -->

                           d                    E
              (a) Cuando         0 , 84
                           tw                Fy

                                           Fcr = Fy                                    (F.9.9)

                                      E             d                  E
              (b) Cuando 0 , 84                          1 , 03
                                     Fy         tw                     Fy

                                                                      Fy 
                                                          d
                                F cr   2 , 55  1 , 84                  Fy          (F.9.10)
                                                        tw            E 
                                       

                           d                 E
              (c) Cuando         1 , 03
                           tw                Fy

                                                        0 , 69 E
                                           F cr                                      (F.9.11)
                                                                   2
                                                         d 
                                                             
                                                            
                                                          tw 

Para ángulos dobles y secciones Te con sus alas funcionando como almas comprimidas por
flexión alrededor del eje y, el momento nominal Mn para el estado límite de pandeo local del
alma será determinado con las especificaciones de la Sección F.10.3. con el ancho del ala del
ángulo y el límite superior dado por la expresión (F.10.1).

F.10. MIEMBROS DE ÁNGULO SIMPLE

Las especificaciones de esta Sección se aplican a miembros de ángulo simple con o sin
restricción al pandeo lateral-torsional continua a lo largo de su longitud.

Los miembros de ángulo simple con restricción al pandeo lateral-torsional continua a lo largo
de su longitud, podrán proyectarse en base a la flexión alrededor de sus ejes geométricos
(x,y).

Los miembros de ángulo simple sin restricción al pandeo lateral-torsional continua a lo largo
de su longitud, deberán proyectarse en base a la flexión alrededor de sus ejes principales
(w,z) excepto cuando se permita aplicar las especificaciones para flexión alrededor de sus ejes
geométricos.

Si el momento requerido tiene componentes sobre ambos ejes principales, con o sin carga axil,
o si el momento requerido es alrededor de uno de los ejes principales y además hay carga axil,

Reglamento CIRSOC 301 – 2018                                                      Cap. F - 97


<!-- page 151 -->

se deberá verificar la relación de tensiones combinadas con las especificaciones de la Sección
H.2.

Para el proyecto en base a la flexión alrededor de los ejes geométricos se usarán las
propiedades de la sección respecto de los ejes x e y, paralelo y perpendicular,
respectivamente, al ala del ángulo flexado. Para el proyecto en base a la flexión alrededor de
los ejes principales se usarán las propiedades de la sección respecto de los ejes w y z,
respectivamente de mayor y de menor inercia.

La resistencia nominal a flexión, Mn (kNm) será el menor valor obtenido para los estados
límites de plastificación (momento plástico), pandeo lateral-torsional (cuando sea aplicable)
y pandeo local del ala. Para flexión alrededor del eje débil no es aplicable el estado límite de
pandeo lateral-torsional.

F.10.1. Estado límite de plastificación

Para el estado límite de plastificación cuando la punta del ala del ángulo está traccionada:
(Figura F.10.1b).

                 Mn = 1,50 My                                                           (F.10.1)

siendo:

          My     el momento elástico relativo al eje de flexión, en kNm.
                = Fy St (10-3)

                           Figura F.10.1. Solicitaciones en punta de ala.

F.10.2. Estado límite de pandeo lateral-torsional

Para el estado límite de pandeo lateral-torsional:


<!-- page 152 -->

(a) Cuando:     M ob  M y

                                                               
                M n   0 , 92         0 , 17 M ob         M y  M ob                                            (F.10.2)
                                                              

(b) Cuando:     M ob  M y

                M n   1 , 92  1 , 17     My        M ob  M y  1 , 50 M y                                   (F.10.3)
                                                            

    siendo:

           My     el momento elástico de la sección relativo al eje de flexión, en kNm.

           Mob el momento elástico de pandeo lateral-torsional, en kNm, obtenido de la
               siguiente manera:

                  (1) Para flexión de un ángulo de alas iguales alrededor del eje principal de
                      mayor inercia.

                                                             2       2            3
                                             0 , 46 E b          t       ( 10 )
                          M ob  C b                                                                              (F.10.4)
                                                             Lb

                  (2) Para flexión de un ángulo de alas desiguales alrededor del eje
                      principal de mayor inercia.

                       M ob  4 , 9 E ( 10 )
                                                  3   Iz
                                                        2
                                                               
                                                            Cb 
                                                               
                                                                                       
                                                                          w 2  0 , 052 L b t r z    
                                                                                                     2
                                                                                                            w
                                                                                                                
                                                                                                                 (F.10.5)
                                                       Lb

                         siendo:

                                 Cb        el factor de modificación calculado con la expresión (F.1.1)
                                           con un valor máximo de 1,5.

                                 Lb        la longitud lateralmente no arriostrada del miembro, en cm.

                                 b         el ancho total de ala con la punta comprimida, en cm.

                                 t         el espesor del ángulo, en cm.

                                 Iz        el momento de inercia de la sección con respecto al eje
                                           principal de menor inercia, en cm4.

                                 rz        el radio de giro de la sección con respecto al eje principal de
                                           menor inercia, en cm.

Reglamento CIRSOC 301 – 2018                                                                                Cap. F - 99


<!-- page 153 -->

                                                                         
                                                     z  dA   2 z
                                           1
                                 w  
                                                                 2
                                               z w                                       propiedad especial de la
                                                                                o
                                       I w A                           
                                       sección para ángulos de alas desiguales. Es positivo para el
                                       ala corta en compresión y negativo para el ala larga en
                                       compresión. (Ver en Comentarios de este Capítulo valores
                                       de w para ángulos de dimensiones comunes). Si el ala larga
                                       está en compresión en alguna sección de la longitud de la
                                       barra no arriostrada lateralmente se deberá tomar el valor
                                       negativo de w, en cm.

                                 zo    la coordenada en la dirección del eje z del centro de corte
                                       con respecto al centro de gravedad de la sección, en cm.

                                 Iw    el momento de inercia de la sección con respecto al eje
                                       principal de mayor inercia, en cm4.

                   (3) Para flexión alrededor de uno de los ejes geométricos para un ángulo de
                       alas iguales sin compresión axil:

                       (3.a) sin arriostramiento lateral-torsional

                        Cuando la máxima compresión está en la punta del ala del ángulo

                                                                                                    1 
                                              4             3
                                 0 , 66 E b t C b ( 10 )                                      2    2
                        M ob                                         1  0 , 78 L b t    b                          (F.10.6a)
                                              Lb
                                                  2                                                       

                        Cuando la máxima tracción está en la punta del ala del ángulo

                                                                                                         1  (F.10.6b)
                                              4                  3
                                 0 , 66 E b       t C b ( 10 )                                    2    2
                        M ob                                          1  0 , 78 L b t       b
                                                   2
                                                  Lb                                                          

                         En este caso My en las expresiones (F.10.2) y (F.10.3) deberá
                         tomarse como el 80% del momento elástico calculado con el
                         módulo resistente elástico de la sección con respecto al eje
                         geométrico.

                       (3.b) Para flexión alrededor de un eje geométrico de un ángulo de alas
                         iguales con arriostramiento para pandeo lateral-torsional sólo en el punto
                         de máximo momento:

                        Mob se tomará como 1,25 veces el valor de Mob calculado con las
                            expresiones (F.10.6a) o (F.10.6b) según corresponda.

                        My se tomará como el momento elástico calculado usando el módulo
                         resistente elástico de la sección.


<!-- page 154 -->

F.10.3. Estado límite de pandeo local del ala

Para el estado límite de pandeo local, cuando la punta del ala del ángulo está comprimida:
(Figura F.10.1a):

                     b                  E
       Cuando:            0 , 54
                     t                  Fy

                     M n  1 , 50 F y S c 10       3
                                                                                               (F.10.7)

                                E       b                       E
       Cuando: 0 , 54                        0 , 91
                               Fy       t                   Fy

                                                                                   
                                                                          b t      
                     M n  F y S c  10  3          1,50  0,93             1          (F.10.8)
                                                                                 
                                                                     0,54 E F y    
                                                                                   

                     b              E
       Cuando:            0 , 91
                     t              Fy

                     M n  1 , 34 Q s F y S c 10               3
                                                                                               (F.10.9)

       siendo:

                 Mn la resistencia nominal a flexión, en kNm.

                 b       el ancho total del ala del ángulo con la punta comprimida, en cm.

                 t       el espesor del ala del ángulo con la punta comprimida, en cm.

                 Fy la tensión de fluencia mínima especificada, en MPa.

                 Qs el factor de reducción para ángulos simples dado en Capítulo E, Sección
                    E.7.1..

                 Sc el módulo resistente elástico de la sección relativo al eje de flexión y
                    correspondiente a la punta comprimida, en cm3.
                         Para flexión de un ángulo de alas iguales alrededor de un eje geométrico sin
                         arriostramiento para pandeo lateral-torsional, Sc se tomará como 0,80 del
                         módulo resistente elástico de la sección respecto del eje geométrico.

Reglamento CIRSOC 301 – 2018                                                                Cap. F - 101


<!-- page 155 -->

F.11. BARRAS MACIZAS DE SECCIÓN RECTANGULAR Y CIRCULAR

Las especificaciones de esta Sección son aplicables a barras macizas de sección rectangular y
circular flexadas alrededor de cualquiera de sus ejes geométricos.

La resistencia nominal a flexión, Mn (kNm), será el menor valor obtenido para los estados
límite de plastificación (momento plástico) y de pandeo lateral-torsional.

F.11.1. Estado límite de plastificación

Para:
                                              Lb d          0 , 08 E
   barras macizas rectangulares con                                    flexadas alrededor de su eje fuerte.
                                                   2
                                               t                Fy

   barras macizas rectangulares flexadas alrededor de su eje débil.

   barras macizas circulares:

                                  Mn = Mp = Fy Z (10)-3  1,5 My                                              (F.11.1)

F.11.2. Estado límite de pandeo lateral-torsional

                                               0 , 08 E              Lb d        1 ,9 E
(a) barras macizas rectangulares con                                                    flexadas alrededor de su eje
                                                                         2
                                                       Fy            t            Fy
    fuerte
                                                      Lb d  Fy 
                         M n  C b  1 , 52  0 , 274            My  Mp  1,5 My                          (F.11.2)
                                                      2        
                                                      t     E  

                                              Lb d           1 ,9E
(b) barras macizas rectangulares con                                    flexadas alrededor de su eje fuerte
                                                   2
                                               t                Fy

                                  Mn = Fcr Sx (10)-3  Mp  1,5 My                                           (F.11.3)

                                            1 ,9EC b
con:                              F cr                                                                      (F.11.4)
                                                            2
                                           ( Lb d )/ t

siendo:

        Lb     la longitud entre puntos arriostrados contra desplazamiento lateral de la zona
               comprimida, o entre puntos arriostrados para prevenir el giro de la sección, en
               cm.

        d      la altura de la barra rectangular (perpendicular al eje de flexión), en cm.

        t      el ancho de la barra rectangular (paralelo al eje de flexión), en cm.


<!-- page 156 -->

     Mp         el momento plástico de la sección, en kNm.

     My         el momento elástico de la sección, en kNm.

     Sx         el módulo resistente elástico de la sección respecto del eje fuerte, en cm3.

(c) Para barras rectangulares flexadas alrededor del eje débil y para barras macizas de
    sección circular, no es aplicable el estado límite de pandeo lateral-torsional.

F.12. MIEMBROS CON SECCIONES ASIMÉTRICAS

Las especificaciones de esta Sección se aplican a todos los miembros con secciones
asimétricas excepto miembros de ángulo simple.

La resistencia nominal a flexión, Mn (kNm), será el menor valor obtenido para los estados
límite de fluencia (momento elástico), de pandeo lateral-torsional y de pandeo local siendo:

                                Mn = Fn Smín (10)-3                                       (F.12.1)

siendo:

          Smín el menor módulo resistente elástico de la sección respecto del eje de flexión, en
               cm3.

          Fn    la tensión nominal para cada estado límite, en MPa.

F.12.1. Estado límite de fluencia

                                F n = Fy                                                 (F.12.2)

F.12.2.Estado límite de pandeo lateral-torsional

                                Fn = Fcr  Fy                                            (F.12.3)

siendo:

       Fcr      la tensión crítica de pandeo lateral-torsional de la sección, determinada
                mediante análisis, en MPa.

Para secciones Z se tomará Fcr igual al 50% de la tensión crítica Fcr correspondiente a una
sección canal con las mismas propiedades de ala y alma.

F.12.3. Estado límite de pandeo local

                                Fn = Fcr  Fy                                            (F.12.4)

siendo:

          Fcr   la tensión crítica de pandeo local de la sección, determinada mediante
                análisis, en MPa.

Reglamento CIRSOC 301 – 2018                                                          Cap. F - 103


<!-- page 157 -->

F.13. REQUISITOS DIMENSIONALES PARA VIGAS Y VIGAS ARMADAS

F.13.1. Reducciones en la resistencia de miembros con agujeros en las alas
traccionadas

Las especificaciones de esta Sección se aplican a vigas laminadas, vigas armadas, vigas
armadas de alma esbelta y vigas con platabandas, que presenten agujeros en sus alas
traccionadas y sean dimensionadas en base a la resistencia flexional de la sección bruta.

Además de los estados límite especificados en otras Secciones de este Capítulo, la
resistencia nominal a flexión quedará limitada por el estado límite de rotura del ala
traccionada.

(a) Cuando Fu Afn  Yt Fy Afg no es aplicable, el estado límite de rotura del ala traccionada.

(b) Cuando Fu Afn < Yt Fy Afg , la resistencia nominal a flexión, Mn (kNm), en la sección
    de los agujeros del ala traccionada se tomará:

                                           F u A fn                3
                                  Mn                 S x ( 10 )                             (F.13.1)
                                              A fg

    siendo:

          Afg       el área bruta del ala traccionada calculada con las especificaciones de la
                    Sección D.3.1., en cm2.

          Afn       el área neta del ala traccionada calculada con las especificaciones de la
                    Sección D.3.2. , en cm2.

          Yt = 1,0 para (Fy / Fu)  0,8
             = 1,1 para los otros casos.

          Fy        la tensión de fluencia mínima especificada del acero del ala traccionada, en
                    MPa.

          Fu        la tensión de rotura a tracción del acero del ala traccionada, en MPa.

F.13.2. Valores límites de las dimensiones de miembros de sección doble Te

   Los miembros de sección doble Te de simple simetría deben satisfacer el límite
    siguiente:
                                           I yc
                                  0 ,1           0 ,9                                      (F.13.2)
                                           Iy
    siendo:

              Iyc    el momento de inercia del ala comprimida respecto del eje de simetría y, en
                     cm4.

              Iy     el momento de inercia de la sección total respecto del eje de simetría y, en
                     cm4.


<!-- page 158 -->

   Los miembros armados de sección doble Te con alma esbelta (homogéneas o hibridas)
    deben satisfacer los límites siguientes:

    (a) Para a/h  1,5

                    h                E
                          11 , 7                                                            (F.13.3)
                    tw              F yf

    (b) Para a/h > 1,5

                     h              0 , 48 E
                                                                                            (F.13.4)
                    tw        F yf ( F yf  114 )

    siendo:
              a      la distancia libre entre rigidizadores transversales, en cm.

              h      para secciones laminadas: distancia libre entre alas menos los radios de
                     acuerdo entre el alma y cada ala; para secciones armadas con pasadores:
                     distancia entre líneas adyacentes de bulones; para secciones armadas
                     soldadas: distancia libre entre alas, en cm.

              tw     el espesor del alma, en cm.

              Fyf    la tensión de fluencia mínima especificada del acero del ala, en MPa.

En vigas armadas con almas no rigidizadas h/tw deberá ser menor o igual a 260. La relación
entre el área del alma y el área del ala comprimida debe ser menor o igual a 10.

F.13.3. Chapas y platabandas adicionadas a las alas

Las alas de vigas armadas soldadas pueden variar su ancho o espesor, ya sea por el empalme
de chapas o por el uso de platabandas.

El área total de las platabandas no superará el 70 % del área total del ala, en vigas y vigas
armadas abulonadas.

Los bulones de alta resistencia o cordones de soldadura que vinculan el alma con el ala, o el
ala con las platabandas, deberán ser dimensionados para resistir los esfuerzos tangenciales
resultantes de la flexión de la viga. Su distribución longitudinal será función de la intensidad y
variación de las tensiones tangenciales. No obstante dicha separación longitudinal no excederá
los máximos permitidos para barras comprimidas o traccionadas especificados en las
Secciones E.6. y D.4. respectivamente. Los bulones o cordones de soldadura que unan ala y
alma serán también dimensionados para transmitir al alma cualquier carga aplicada
directamente al ala, excepto que se tomen los recaudos para transmitir dichas cargas por
apoyo directo en el alma.

Platabandas que no tengan la longitud total de la barra, deberán extenderse mas allá del punto
teórico necesario y el tramo excedente se unirá a la viga laminada o viga armada con bulones
de alta resistencia con uniones del tipo de deslizamiento crítico o cordones de soldadura. La

Reglamento CIRSOC 301 – 2018                                                          Cap. F - 105


<!-- page 159 -->

unión debe ser dimensionada para tener la resistencia de diseño aplicable según las Secciones
J.2.2., J.3.8., o B.3.9., y de manera que se desarrolle en el punto final teórico, la parte de la
resistencia de diseño a flexión de la viga o viga armada correspondiente a la platabanda.

Para platabandas soldadas, la unión soldada que une el tramo final de la platabanda a la
viga laminada o viga armada deberá tener cordones continuos de longitud a´ (definida mas
adelante) a lo largo de ambos bordes de la platabanda y dimensionados según corresponda
para tener la resistencia de diseño necesaria para desarrollar a la distancia a´ del extremo
de la platabanda, la parte correspondiente a la platabanda de la resistencia de diseño de la
viga armada. (ver la Figura F.13.1.).

                                Figura F.13.1. Determinación de a’.

(a) Cuando en el extremo de la platabanda existe un cordón de soldadura transversal
    continuo de lado z mayor o igual que 3/4 del espesor tp de la platabanda:

                                       a´= bp                                           (F.13.5)

    siendo:

              bp el ancho de la platabanda, en cm.


<!-- page 160 -->

(b) Cuando en el extremo de la platabanda existe un cordón de soldadura transversal
    continuo de lado z menor que 3/4 del espesor tp de la platabanda:

                                       a´= 1,5 bp                                        (F.13.6)

(c) Cuando en el extremo de la platabanda no existe cordón transversal:

                                       a´= 2 bp                                           (F.13.7)

F.13.4. Vigas de miembros apareados

Cuando dos o más miembros (perfiles doble Te, canales o vigas armadas) son apareados
para formar un solo miembro flexado, ellos deberán unirse de manera que los mismos
trabajen en conjunto. Cuando existen cargas concentradas que son llevadas de un miembro a
otro o distribuidas entre ellos, deberán soldarse o abulonarse diafragmas con la suficiente
rigidez y resistencia para distribuir la carga entre los miembros.

F.13.5. Longitud lateralmente no arriostrada para redistribución de momentos

Cuando se realice la redistribución de momentos en vigas según las especificaciones de la
Sección B.3.5., la longitud lateralmente no arriostrada del ala comprimida Lb, adyacente a la
sección del momento redistribuido, deberá ser menor o igual a Lpd (cm), siendo:

   (a) Para miembros con secciones doble Te de doble y simple simetría, con el ala
       comprimida de área igual o mayor que el área del ala traccionada (incluyendo
       secciones híbridas), y cargados en el plano del alma:

                                           M           
                                           1      E    
                 L pd   0 , 12  0 , 076               ry                          (F.13.8)
                                          M      Fy   
                                             2          

   (b) Para miembros de sección rectangular maciza y de sección cajón simétrica:

                                          M                            
                                          1      E                  E    
                 L pd   0 , 17  0 , 10             r y  0 , 10        ry       (F.13.9)
                                         M   F                    Fy   
                                           2   y                         

       siendo:

                 Fy    la tensión de fluencia mínima especificada para el acero            del ala
                       comprimida, en MPa.

                 M1    el menor momento flexor en valor absoluto en un extremo del segmento
                       no arriostrado considerado, en kNm.

                 M2    el mayor momento flexor en valor absoluto en un extremo del segmento
                       no arriostrado considerado, en kNm.

Reglamento CIRSOC 301 – 2018                                                          Cap. F - 107


<!-- page 161 -->

                 ry    el radio de giro de la sección con respecto al eje principal de menor
                       inercia, en cm.

                 M1 / M2 se tomará positivo cuando los momentos producen doble curvatura y
                       negativo cuando producen simple curvatura.

No hay límite para Lb para miembros con secciones transversales cuadradas o circulares.
Tampoco hay límite para Lb en vigas de cualquier sección transversal flexadas alrededor del
eje principal de menor momento de inercia.


<!-- page 162 -->
