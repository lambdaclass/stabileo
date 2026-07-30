# CIRSOC 301 (2018) — APÉNDICE 8. ANÁLISIS                      APROXIMADO                DE        SEGUNDO

> Source: `CIRSOC 301-2018.pdf` · PDF pages 321–340
> Extraction: `pdftotext -layout` text layer, verbatim. No text was rewritten or inferred.

ORDEN

Este Apéndice presenta como alternativa a un análisis de segundo orden riguroso, un
procedimiento para considerar los efectos de segundo orden en las estructuras,
mediante la amplificación de las resistencias requeridas resultantes de un análisis de
primer orden.

Su contenido se organiza de la siguiente manera:


<a id="c8.1"></a>
### 8.1 Limitaciones  <sub>p.321</sub>


<a id="c8.2"></a>
### 8.2 Procedimientos de cálculo  <sub>p.321</sub>



<a id="c8.1"></a>
### 8.1 LIMITACIONES  <sub>p.321</sub>


El uso de este método está limitado a estructuras que soportan las cargas
gravitacionales primariamente a través de columnas, tabiques o pórticos todos
nominalmente verticales con la excepción que se permite el uso del procedimiento
especificado para determinar los efectos P-  para cualquier miembro individual
comprimido.

Se limita la aplicación del método a las estructuras donde el factor amplificador B2 de
cualquiera de sus pisos y en cualquier dirección de traslación sea menor o igual que 1,5.


<a id="c8.2"></a>
### 8.2 PROCEDIMIENTO DE CÁLCULO  <sub>p.321</sub>


La resistencias requeridas de segundo orden a flexión, Mu , y a compresión axil, Pu , de
todos los miembros deberá ser determinada mediante las siguientes expresiones:

                      Mu = B1 Mnt + B2 Mlt                                               (8.1)

                      Pu = Pnt + B2 Plt                                                  (8.2)

siendo:

          B1   el factor amplificador que considera los efectos P-  , determinados para cada
               miembro solicitado a compresión y a flexión y para cada dirección de flexión,
               y calculado según la Sección 8.2.1. de este Apéndice. Para miembros no
               solicitados a compresión se debe adoptar B1 = 1,0 .

          B2   el factor amplificador que considera los efectos P-  , determinado para cada
               piso de la estructura y para cada dirección de traslación lateral, y calculado
               según la Sección 8.2.2. de este Apéndice.

          Mu   la resistencia requerida a flexión de segundo orden, en kNm.

Reglamento CIRSOC 301 – 2018                                                  Apéndice 8 - 267


<!-- page 321 -->

        Mnt      la resistencia requerida a flexión del miembro, obtenida por análisis de primer
                 orden y suponiendo que no haya desplazamiento lateral de la estructura, en
                 kNm.

        Mlt      la resistencia requerida a flexión del miembro, obtenida por análisis de primer
                 orden como resultado del desplazamiento lateral de la estructura, en kNm.

        Pu       la resistencia requerida a compresión de segundo orden, en kN.

        Pnt      la resistencia requerida a compresión axil del miembro, obtenida por análisis
                 de primer orden cuando en la estructura no hay desplazamiento lateral, en
                 kN.

        Plt      la resistencia requerida a compresión axil del miembro, obtenida por análisis
                 de primer orden, originada solamente por el desplazamiento lateral de la
                 estructura, en kN.

Las expresiones (8.1) y (8.2) se deben aplicar a todos los miembros de todas las
estructuras.

El factor B1 distinto de la unidad, se debe aplicar solamente a los momentos flectores de
las vigas-columnas. El factor B2 se debe aplicar a los momentos flectores y fuerzas
axiles de todos los componentes de sistemas resistentes a fuerzas laterales
(columnas, vigas, riostras, y tabiques).

Las diferencias entre los momentos amplificados por los factores B1 y B2 y los momentos de
primer orden en los extremos de las columnas, deberán ser distribuidas entre las vigas que
concurran al nudo en función de su rigidez a flexión relativa, de manera de respetar el equilibrio
del nudo. Si dicha distribución resultara compleja no se podrá utilizar el método aproximado
de amplificación de momentos de primer orden, debiendo considerarse el efecto de las
deformaciones por medio de un análisis elástico de segundo orden.

Las uniones se deberán proyectar para resistir los momentos amplificados.

En vigas reticuladas resueltas por análisis elástico, los momentos flectores requeridos, (Mu), en
las barras comprimidas sometidas a flexión y en las uniones de las barras si correspondiere,
podrán ser obtenidos por el método aproximado de amplificación de momentos de primer orden
con B2 = 0 .


<a id="c8.2.1"></a>
### 8.2.1 Factor amplificador B1 por efectos P -   <sub>p.322</sub>


El factor amplificador B1 para cada miembro solicitado a compresión y para cada
dirección de flexión se determinará mediante la siguiente expresión:

                                             Cm
                                   B1                  1                                   (8.3)
                                             P 
                                          1  u 
                                                   
                                            P e1 


<!-- page 322 -->

siendo:

       Cm      el coeficiente basado en un análisis elástico de primer orden suponiendo que el
               pórtico como conjunto no se traslada lateralmente. Se determinará de la
               siguiente manera:

              (a) Para miembros comprimidos, que en el plano de flexión no estén sometidos
                  a cargas transversales entre sus apoyos:

                                Cm = 0,6 – 0,4 (M1/ M2)                                      (8.4)

                  donde (M1 / M2) es la relación entre los valores absolutos de los momentos
                  flectores de primer orden menor y mayor respectivamente, en los extremos
                  de la porción no arriostrada del miembro, y en el plano de flexión
                  considerado. (M1/ M2) es positivo cuando el miembro está deformado con
                  doble curvatura, y negativo cuando está deformado con simple curvatura.

              (b) Para miembros comprimidos, que en el plano de flexión estén sometidos a
                  cargas transversales entre sus apoyos, el valor de Cm será determinado
                  por análisis estructural o se adoptará conservadoramente en todos los
                  casos Cm = 1,0 .

       Pu     la resistencia requerida a compresión axil del miembro analizado, en kN.

       Pe1     la resistencia nominal a pandeo elástico del miembro en el plano de flexión
               considerado, suponiendo que no hay desplazamiento lateral de los nudos
               (pórtico arriostrado), en kN.

                                          2 EI*
                                Pe 1                 ( 10 ) 1                               (8.5)
                                                  2
                                         ( k1L)
              siendo:

                        EI*    la rigidez a flexión del miembro utilizada en el análisis.(=0,8b EI
                               cuando se utilice el método de análisis directo; = EI cuando se
                               utilicen los métodos de longitud efectiva o de análisis de primer
                               orden), en MPa cm4.

                        E      el módulo de elasticidad longitudinal del acero = 200 000 MPa .

                        I      el momento de inercia del miembro en el plano de flexión, en
                               cm4.

                        L      la longitud no arriostrada del miembro, en cm.

                        k1     el factor de longitud efectiva en el plano de flexión, determinado
                               con la hipótesis de que no hay desplazamiento lateral de los
                               extremos del miembro (nudos indesplazables). Se deberá

Reglamento CIRSOC 301 – 2018                                                       Apéndice 8 - 269


<!-- page 323 -->

                                  adoptar k1 = 1,0, a menos que un análisis justifique un valor
                                  menor.

   Se permite adoptar para Pu en la expresión (8.3) el valor de primer orden Pu = Pnt + Plt


<a id="c8.2.2"></a>
### 8.2.2 Factor amplificador B2 por efectos P -   <sub>p.324</sub>


El factor amplificador B2 para cada piso y en cada dirección de traslación se
determinará de la siguiente forma:

(a) Para pisos en que todos los elementos estructurales tengan la misma altura L

                                       1
                           B2                1                                                 (8.6)
                                        Pu
                                  1
                                       P eT
siendo:

         Pu         la suma de las resistencias axiles requeridas de todos los elementos del
                     piso resultantes de las combinaciones de acciones mayoradas, incluyendo
                     las de las columnas que no aportan rigidez lateral, en kN.

          PeT        la resistencia nominal a pandeo elástico del piso en la dirección de
                     traslación considerada, determinada por análisis del pandeo por
                     desplazamiento lateral o con la siguiente expresión, en kN.

                                                           L H
                                              P eT  R M                                         (8.7)
                                                            oH

        RM        = 1  0 , 15 (  P mf /  P u )                                                (8.8)

          L          la altura del piso, en cm.

          H         el esfuerzo de corte del piso en la dirección de traslación considerada,
                     debido a las cargas laterales que producen el desplazamiento oH , en kN.

          oH        el desplazamiento lateral relativo del piso de primer orden en la dirección de
                     traslación considerada, debido a las cargas laterales. Se determinará
                     utilizando la rigidez axil y la flexión usada en el análisis (cuando se utilice el
                     método de análisis directo se utilizará la rigidez reducida dada en la Sección
                     C.2.3.). Cuando oH varíe en el área en planta de la estructura, se podrá
                     tomar el promedio de los desplazamientos ponderado por la carga vertical o
                     alternativamente el máximo desplazamiento lateral, en cm.

           Pmf      la sumatoria de las resistencias axiles requeridas de las columnas del piso
                     que sean parte de pórticos no arriostrados (a nudos desplazables) en la
                     dirección de traslación considerada y aporten rigidez lateral. (= 0 si solo
                     existen pórticos arriostrados), en kN.


<!-- page 324 -->

 H y oH pueden basarse en cualquier sistema de cargas laterales que proporcione un
valor representativo de la rigidez lateral ( H / oH).

(b) Para estructuras en que la rigidez lateral sea provista solo por pórticos no
arriostrados y en las que las columnas tengan distinta altura L:

                                    1
                      B2                                                                (8.9)
                               1
                                  P    u

                                  P    e2

siendo:

        Pu     la suma de las resistencias axiles requeridas de todos los elementos del
                piso resultantes de las combinaciones de acciones mayoradas, incluyendo
                las de las columnas que no aportan rigidez lateral, en kN.

                     2 EIi*
        Pe2 =                     ( 10 ) 1 , en kN.                                    (8.10)
                                2
                   ( k2 Li )

                La sumatoria se extenderá solo a las columnas que aporten rigidez lateral.

       EIi*     la rigidez a flexión del miembro utilizada en el análisis.( =0,8b EI cuando se
                utilice el método de análisis directo; = EI cuando se usen los métodos de
                longitud efectiva o de análisis de primer orden), en MPa cm4.

       E        el módulo de elasticidad longitudinal del acero = 200000 MPa .

       Ii       el momento de inercia del miembro i en el plano de flexión, en cm4.

       Li       la longitud no arriostrada del miembro i, en cm.

       k2       el factor de longitud efectiva en el plano de flexión, determinado con la
                hipótesis de nudos desplazables. Para su determinación no se considerará
                el efecto de las columnas con distinta rigidez o sin rigidez lateral y el efecto
                de pandeo no simultáneo.

Reglamento CIRSOC 301 – 2018                                                    Apéndice 8 - 271


<!-- page 325 -->



<!-- page 326 -->

ANEXO 1.                        EXPRESIONES CONTENIDAS EN                               ESTE
                                REGLAMENTO EN FUNCIÓN DE E

En este Anexo se presentan las expresiones contenidas en el Reglamento dadas en función
del módulo de elasticidad longitudinal del acero E, con su expresión resultante de
reemplazar dicho módulo por su valor E = 200 000 MPa. Se presentan con la misma
numeración entre paréntesis pero con un asterisco: ( )*

CAPÍTULO B

Tabla B.4.1a (*) Relaciones ancho/espesor en elementos comprimidos miembros
                 sometidos a compresión axil

                              Relaciones ancho/espesor en elementos comprimidos
                                     miembros sometidos a compresión axil
                 Caso Descripción del        Ancho/    Relación r       Ejemplos
                      Elemento               Espesor
                 1    Alas de vigas de
                      perfiles laminados
                      “doble Te” y canales;
                      alas de perfles “Te”;                   1
                      alas de perfiles         b/t     250
                      ángulo unidos en                       Fy
                      forma continua;
                      Placas y ángulos
                      salientes de vigas de
                      perfiles laminados

 No Rigidizado
                 2    Alas de secciones                    (a)
                      “doble Te” soldadas                    kc
                      y ángulos o placas       b/t     285
                      salientes de seccio-                   Fy
                      nes soldadas
                 3    Alas de perfiles ángu-
                      lo; alas de pares de                    1
                      ángulo unidos con        b/t     200
                      presillas; todo ele-                   Fy
                      mento no rigidizado

                 4     Almas de secciones                     1
                       “Te”                    b/t     335
                                                             Fy

Reglamento CIRSOC 301 – 2018                                                        Anexo 1 - 1


<!-- page 327 -->

                                Relaciones ancho/espesor en elementos comprimidos
                                       miembros sometidos a compresión axil
                 5      Almas de perfiles la-                            1
                        minados y armados             h/tw      665
                        “doble Te” de doble                             Fy
                        simetría y canales

                 6      Paredes de tubos              B/t                1
                        rectangulares y cua-          o         625
                        drados sin costura            h/t               Fy

                 7      Platabandas y placas
                        diafragma entre                                 1
                        líneas de pasadores           b/t      625
                        o cordones de                                   Fy

   Rigidizados
                        soldadura

                 8      Paredes de cajones                              1
                        rectangulares o              b/t       665
                        cuadrados; todo              o                  Fy
                        elemento rigidizado         hw/tw

                 9      Ancho no apoyado de                                  Adoptar área neta de la placa en el ancho del
                                                                        1
                        platabandas o alas            b/t      830           agujero
                        perforadas con una                              Fy
                        sucesión de agujeros
                        de acceso

                 10     Tubos circulares              D/t      22000 / F y

Tabla B.4-1b ( * ). Relaciones ancho/espesor en elementos comprimidos de miem-
                    bros flexados

                 Relaciones ancho/espesor en elementos comprimidos de miembros flexados

                C      Descripción del      Ancho/                Ancho/espesor
                a        elemento           espesor                   límite                          Ejemplos
                s                                             p (d)            r
                o
               11     Alas de perfiles                                           (b)
                      laminados “doble        b/t

No rigizados
                      Te”, “Tes”, cana-                             1                 1
                      les y pares de per-                    170             370
                      files ángulo en                              Fy                FL
                      contacto continuo


<!-- page 328 -->

             Relaciones ancho/espesor en elementos comprimidos de miembros flexados

             C    Descripción del     Ancho/               Ancho/espesor
             a      elemento          espesor                  límite                     Ejemplos
             s                                         p (d)            r
             o
            12   Alas de secciones                                         (a) (b)
                 “doble te” solda-      b/t                    1                     kc
                 das de doble y                     170                    425
                 simple simetría;                             Fy                     FL
                 Alas salientes de
                 vigas soldadas
            13   Alas de ángulos
                 simples                b/t                     1                    1
                                                   241                     407
                                                              Fy                     Fy
            14   Alas de toda
                 “doble te” y canal     b/t                     1                    1
                 flexado alrededor                 170                     447
                 del eje débil                                Fy                     Fy
            15   Alma de “Te”                                   1                    1
                                        d/t        375                     460
                                                              Fy                     Fy

            16   Almas de “doble                                 1                    1
                 te” de doble sime-    h/tw       1680                     2550
                 tría y canales la-                            Fy                    Fy
                 minados y solda-
                 dos
            17   Alma de seccio-                       (c) (e)
                 nes “doble Te” de     hc /tw      (h c / h p ) ( E / Fy
                                                                                      1
                 simple simetría                0,54 (Mp / M y )  0,09  2 2550
                                                                                     Fy
            18   Alas de tubos
                 rectangulares   y      b/t                     1                    1
                 cuadrados     sin                 500                     625

Rigizados
                 costura                                      Fy                     Fy
            19   Alas de secciones                              1                    1
                 cajón soldadas         b/t        500                     665
                                                              Fy                     Fy

            20   Almas de tubos                                  1                    1
                 rectangulares   y      h/t       1085                     2550
                 cuadrados     sin                             Fy                    Fy
                 costura

            21 Almas de                                          1                    1
                 secciones cajón       hw /tw     1680                     2550
                                                               Fy                    Fy

Reglamento CIRSOC 301 – 2018                                                                  Anexo 1 - 3


<!-- page 329 -->

     Relaciones ancho/espesor en elementos comprimidos de miembros flexados

    C       Descripción del       Ancho/                  Ancho/espesor
    a         elemento            espesor                     límite                            Ejemplos
    s                                                 p (d)            r
    o
   22      Platabandas y pla-                             1                    1
           cas diafragma en-           b/t      500                   625
           tre líneas de pasa-                           Fy                   Fy
           dores o cordones
           de soldadura


<a id="c23"></a>
### 23 Tubos circulares  <sub>p.330</sub>

                                       D/t     14000 / F y            62000 / F y

CAPÍTULO E

                                                                           Fy 
                       kL           1                                       
(E.3.2a)* Para              2.105                          Fcr   0,658 Fe  Fy
                       r           Fy                                       
                                                                              
                kL           1
(E.3.3a)* Para       2.105                                 Fcr = 0,877 Fe
                r           Fy

                          1.974.000
(E.3.4a)*          Fe =                2
                               kL 
                                  
                               r 
                                                                                  QFy 
                      kL           1                                                
(E.7.2a)* Para             2.105                                 Fcr  Q  0,658 Fe  Fy
                      r           QFy                                               
                                                                                      
                kL           1
(E.7.3a)* Para       2.105                                       Fcr = 0,877 Fe
                r           QFy

                          b        1
(E.7.4)*     Cuando:         250                                      Qs = 1,0
                          t       Fy

                                                                                             b
(E.7.5)*     Cuando 250 1 / Fy  ( b / t )  460           1 / Fy     Q s  1,415  0,0166     Fy  1
                                                                                             t

                                                                                   138.000
(E.7.6)*     Cuando:       b / t   460    1 / Fy                    Qs                      1
                                                                                    b 
                                                                                          2
                                                                               Fy    
                                                                                    t  


<!-- page 330 -->

                      b       kc
(E.7.7)*    Cuando:      285                                Qs = 1,0
                      t       Fy

(E.7.8)*    Cuando: 285 k c / Fy  ( b / t )  525 k c / Fy
                                                                                 b
                                                      Q s  1,415  0,00145   Fy k c  1
                                                                                 t
                       b       kc                             180.000
(E.7.9)*    Cuando:       525                        Qs                  .k c  1
                       t       Fy                                b
                                                                       2
                                                            Fy .   
                                                                 t  

                      b        1
(E.7.10)* Cuando:        200                                   Qs = 1,0
                      t       Fy

                                                                                   b
(E.7.11)* Cuando:      200 1 / Fy   b / t   407 1 / Fy      Q S  1,34  0,0017   Fy  1
                                                                                   t

                                                                        106.000
(E.7.12)* Cuando:       b / t   407       1 / Fy            Qs                      1
                                                                             b 
                                                                                  2
                                                                       Fy    
                                                                            t  

                      d        1
(E.7.13)*   Cuando:      335                                   Qs = 1,0
                      t       Fy
                                                                                       d
(E.7.14)*    Cuando: 335 1 / Fy  ( d / t )  460 1 / Fy      Q s  1,908  0,00273     Fy  1
                                                                                      t

                                                                         138.000
(E.7.15)*    Cuando:  d / t   460 1 / Fy                   Qs                        1
                                                                             d 
                                                                                  2
                                                                       Fy    
                                                                            t  
                                                                                         
                                                                                  150 1 
                    b                  1                                   1 
(E.7.17)*   Cuando:    665                                 b e  855. t .  . 1    .     b
                     t                 f                                   f  b f 
                                                                                t      
                                                                                       

                                                                                         
                       b               1                                   1   170 1 
(E.7.18)*   Cuando:       625                              b e  855. t .  . 1
                       t               f                                   f  b f 
                                                                                 t     
                                                                                       

Reglamento CIRSOC 301 – 2018                                                                  Anexo 1 - 5


<!-- page 331 -->

                 22.000  D  90.000                                                       7.600      2
(E.7.19)*                                                                 Q  Qa               
                   Fy   t     Fy                                                        Fy  (D t) 3

CAPÍTULO F

                                       1
(F.2.5a)*        L p  788 ry .
                                      Fyf
                                       1
(F.2.5b)*         L p  709 ry .
                                      Fyf

                         138.000 S x
(F.3.2a)*         Mn                        (10)  3
                                 2

                         180.000 k c S x
(F.3.2b)*         Mn                            (10)  3
                                  2
                                        1
(F.4.7)*          L p  492 rt .
                                       Fyf

                                                                               2                  2
                                    1             cJ                cJ                F 
(F.4.8)*          L r  390.000 rt                                          6,76 L 
                                   FL              S xc h o          S xc h o          E

                         180.000 k c S xc
(F.4.13)*         Mn                              (10)  3
                                   2

                                                1
(F.5.5a)*                L p  492 rt .                     (cm)
                                               Fyf
                                                     1
(F.5.5b)*                L r  1.405 rt .                           (cm)
                                                 Fyf  Fr

                                             aw         hc
                                                                       1 
(F.5.6)*                 Rpg = 1                             2 . 550          1,0
                                        1200  300a w  t w           Fcrf 

                                      400. C b
(F.7.4)*                 M cr                       J  Ag
                                       L b ry

                                   360 . Cb
(F.7.5) *                M cr                       J  Ag
                                    L b ry

                                26.r y
(F.7.6)*                 Lp                 . J  Ag
                                  Mpx


<!-- page 332 -->

                             24.r y
(F.7.7)*              Lp              . J  Ag
                               Mpx

                             400. r y
(F.7.8)*              Lr                    J  Ag
                                Mr

                             360. ry
(F.7.10)*             Lr                   J  Ag
                                Mr

                                       
                            4.200      
(F.8.2)*              Mn          Fy  S (10)  3
                            D        
                            t        
                                     

                                   
                            66.000 
(F.8.3)*              Mn           S (10)  3
                              
                               D
                            t 
                              

                             140 S xc
(F.9.7)*              Mn 
                                bf 
                                     
                                 2t f 

                           d        1
(F.9.9)*        Cuando        376                                      Fcr = Fy
                          tw       Fy

                              1    d        1                                  d   Fy 
(F.9.10)*   Cuando 376               460                Fcr  2,55  0,0041          Fy
                             Fy   tw       Fy                                tw      

                         d        1                               138.000
(F.9.11)*   Cuando          460                          Fcr               2
                        tw       Fy                                d 
                                                                      
                                                                    tw 
                               92 b 2 .t 2
(F.10.4)*       M ob  C b 
                                  Lb

                M ob  980. z2 . Cb .  w 2  0,052 L b  t rz 2   w 
                            I
(F.10.5)*
                           Lb                                           

Reglamento CIRSOC 301 – 2018                                                           Anexo 1 - 7


<!-- page 333 -->

(F.10.6a)*         M ob 
                          132 b 4 .t.C b 
                               2
                                                         
                                          1  0,78 L b  t b
                                                              2 2    
                                                                   1
                              Lb                                    

(F.10.6b)*         M ob 
                            132 b 4 .t.C b 
                                 2
                                                         
                                            1  0,78 L b  t b
                                                                2 2
                                                                      
                                                                     1
                                Lb                                    

(F.10.7)*    Cuando:
                        b
                        t
                           240.
                                  1
                                 Fy
                                                                                   
                                                             Mn  1,50  Fy  S c  10 3   

                               1  b       1
(F.10.8)* Cuando: 240              407
                              Fy  t      Fy
                                                                     
                                         
                 Mn  Fy  S c  10  3  1,50  0,93 
                                          
                                                             bt
                                                          240 1 Fy
                                                                    1 
                                                                         
                                                                     

(F.10.9)* Cuando:
                       b
                       t
                          407
                                1
                               Fy
                                                                                            
                                                             Mn  1,34 Q s  Fy  S c  10 3   
                   L b d 16.000
(F.11.1)*    con                                            Mn = Mp = Fy Z (10)-3 1,5 My
                    t2     Fy

                    16.000 L b d 380.000
(F.11.2)*    con           2           flexadas alrededor de su eje fuerte
                      Fy    t      Fy

                                                       L d  Fy 
                        Mn  C b 1,52  1,37x(10)  6  b2   My  Mp  1,5 My
                                                       t  E

                    L b d 380.000
(F.11.3)*     con                flexadas alrededor de su eje fuerte
                     t2     Fy
                                      Mn = Fcr Sx (10)-3  Mp  1,5 My

                                        380.000 Cb
(F.11.4)*                      Fcr 
                                         (L b d) / t 2

                                                              h            1
(F.13.3)*           Para a/h  1,5                               5.250 .
                                                             tw           Fyf

                                                              h           96.000
                                                                
                                                                                      
(F.13.4)*           Para a/h > 1,5
                                                             tw       Fyf Fyf  114


<!-- page 334 -->

                                                 M   1 
(F.13.8)*              L pd   24.000  15.200  1   .   . ry
                                                M 2    Fy 

                                                M   1                   1
(F.13.9)*              L pd  34.000  20.000  1   .   . ry  20.000   . ry
                                               M 2    Fy            Fy 
                                                                              

CAPÍTULO G

(G.2.3)*        cuando (h/tw)  492 k v / Fyw                                        Cv = 1,0

                                                                                            492 k v / Fyw
(G.2.4)*        cuando 492              k v / Fyw < (h/tw)  613 k v / Fyw           Cv =
                                                                                                (h / t w )

                                                   k v / Fyw                                302.000 k v
(G.2.5)*        cuando (h/tw) > 613                                                  Cv =
                                                                                            h / t w 2 Fyw

                        h                    kv
(G.3.1)*        Para       492                                                      Vn = 0,6 Aw Fyw (10)-1
                       tw                    Fyw

                                                                                                    
(G.3.2)*        Para
                         h
                            492
                                             kv
                                                     Vn  0,6  A w  Fyw   C v 
                                                                                         1  Cv
                                                                                                             
                                                                                                       10 1
                                                                                                   2 
                                                                                                                 
                        tw                   Fyw                             
                                                                                    1,15 1  a h 
                                         1
(G.3.3)*        (b/t)st  250
                                     Fyst
                              320.000
(G.5.2a)*         Fcr                       5
                           Lv  D  4
                               
                            D t
                          156.000
(G.5.2b)*         Fcr              3
                              D2
                               
                              t

CAPÍTULO H

                                         246.000
(H.3.2a)*              Fcr =
                               ( L / D ) 0,5 . ( D / t )1,25
                                120.000
(H.3.2b)*              Fcr=
                               ( D / t )1,5

Reglamento CIRSOC 301 – 2018                                                                         Anexo 1 - 9


<!-- page 335 -->

CAPÍTULO J

                                                N   t w   Fyw . t f
                                                               1,5
(J.10.4)*                              
                  R n  35,8 t w  1  3     
                                  2
                                                                 
                                       
                                                d   t f       tw

                                              N   t   Fyw . t f
                                                            1,5
(J.10.5a)*        R n  17,9 t w 2 . 1  3      w   
                                              d   t f         tw
                                     

                                       4N         t   Fyw . t f
                                                              1,5
(J.10.5b)*        R n  17,9 t w 2  1     0,2    w   
                                       d           t f      tw
                                     

                          1.075 t w 3  Fyw
(J.10.8)*         Rn 
                                  h

APÉNDICE 1

                                       1
(1.1)*                   pp= 135
                                      Fy

                                        1     1,54 Pu 
(1.2)*                   pp= 1.370          1
                                       Fy       c Py 

                                         1           Pu           1
(1.3)*                   pp= 2.140           0,64             665
                                        Fy          c Py        Fy

                                                  1
(1.4)*                                pp= 420
                                                 Fy

(1.5)*                        pp= 9.000 / Fy

                                                     M´    1 
(1.6)*                        L pd  24.000  15.200 1     r y
                                                    M 2    Fy 
                                                           

                                                     M´    1            1
(1.8)*                        L pd  34.000  20.000 1     r y  20.000  ry
                                                    M 2    Fy          Fy 
                                                                         


<!-- page 336 -->

APÉNDICE 6

                               0,012 L.Mu2
(6.11)*              T 
                             . n . E . I y . Cb2

                               660  1,5 h o . t 3w t s . b 3s 
(6.12)*               sec                         
                               h o      12            12 

                               5.500 . t 3w
(6.13)*               sec 
                                   ho

Reglamento CIRSOC 301 – 2018                                         Anexo 1 - 11


<!-- page 337 -->



<!-- page 338 -->



<!-- page 339 -->

      INTIArg
@intiargentina
@INTIargentina
          INTI
      canalinti

 www.inti.gob.ar


<!-- page 340 -->
