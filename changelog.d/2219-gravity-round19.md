### BREAKING (results)

#### Gravity member frames and envelope extrema

- Convert floor-generated member couples and concentrated loads using the exact axes that created them, including custom orientation, member roll and section rotation. Refuse incomplete or non-finite custom-axis metadata. Retain locally evaluated spatial diagram extrema in envelopes instead of rebuilding their values from rounded station coordinates. Regenerate affected gravity plans and rerun analyses, envelopes and dependent checks (#2219).
- Reuse each physical tributary interval's ordered polygon chords for force and moment evaluation, reducing the work behind the diagrid fixture timeout without changing its timeout, assertions or load allocation (#2219).
