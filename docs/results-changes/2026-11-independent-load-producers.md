# Keep stair and architectural loads when replacing generated loads

The automatic load generator could remove stair reactions, architectural wall weights and room pressures when it replaced loads of the same action type. The old replacement list counted every generator mark as its own. The preview could also omit whole-plate pressure definitions scheduled for replacement.

The preview and Apply now use the same ownership classification and list of definitions. The automatic generator replaces its own loads in the affected cases. Stair and architectural loads remain with the tools that wrote them, even when the user includes unmarked loads in the replacement.

Compare an affected project with the model saved before replacing loads. If loads disappeared, restore them or regenerate them with the originating tool before solving again. A file saved after removal may no longer identify the missing assignments.
