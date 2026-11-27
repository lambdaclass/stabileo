# Check meshes applied after stopping a preview

In a saved model, the mesh used for analysis can differ from the element type or cell sizes the engineer last selected. This could happen after changing a setting, stopping the new preview and selecting Apply. The earlier completed preview remained applicable. Integration builds could also replace a stored cell size when reopening the settings of a plate adopted from shells.

Inspect the actual elements on affected plates and both stored cell dimensions. If they differ from the intended mesh, regenerate it, review any local loads and rerun affected analyses. Older files do not record whether a preview was stopped. The review notice therefore applies to models with declared physical plates.

Apply now accepts only the completed preview of the current selection and settings. The published form reports a refused plate in the dialog. A manual batch can apply independently accepted plates while preserving a refusal already shown in the preview. A new refusal during conforming revalidation still stops the transaction.
