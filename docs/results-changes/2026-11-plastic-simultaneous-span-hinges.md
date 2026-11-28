# Simultaneous moving span hinges

In the mixed seed 29 trussed beam, two span hinges form at the same load. Opening both releases an antisymmetric motion with zero external work. The step solver keeps one section rigid to solve the next increment. Keeping its original position while moving the other section made the trial rediscover the same hinge and discard the history.

Both split coordinates now follow the moment peaks. Only released sections contribute a corrective self-stress. The solver checks the moment at the locked section before accepting the increment. Basic continues to obtain its published collapse factor from the independent limit certificate.

For each uniformly loaded half of this model, let the distance from the pin to the final positive moment peak be x and the half-span length be L. The moment is zero at the pin. The drop from the peak to the central negative plastic moment is twice the drop to the pin. The parabolic diagram gives (L − x)² = 2x². The regression checks both resulting coordinates, zero shear and the signed plastic moment there, and compares the load with an independently solved limit model. Review earlier hinge positions and step diagrams for models with simultaneous span yielding.
