### Fixed
#### Preserve load drafts and quantity semantics across displayed axes

- Pending global load drafts and coordinate-range targets retain their physical meaning when displayed axes change. Quick info preserves SRSS/ABS magnitudes, plane spring fields name the displayed axes, generated report combination names follow their factors, and workbook instructions mark the correct required coordinate. The modal browser regression distinguishes signed factors from unsigned directional percentages (#2259).
