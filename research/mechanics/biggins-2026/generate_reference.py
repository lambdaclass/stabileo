import sys
from pathlib import Path
sys.path.insert(0, str(Path(sys.argv[1]).resolve()))
import numpy as np
from lib.shallow_angle_model.clamped_modes import ClampedFourierTransform
import csv
with open(sys.argv[2],'w') as f:
 w=csv.writer(f);w.writerow(['width','alpha_over_sqrt_epsilon'])
 for i in range(30,91,2):
  width=i/100
  m=ClampedFourierTransform(curvature_function=lambda s: np.where(np.abs(s)<width/2,1.,0.),n_interpolation=100001,n_modes=100)
  threshold=float(np.asarray(m.get_snap_threshold()).item())**-0.5
  w.writerow([width,threshold]);print(width,threshold)
