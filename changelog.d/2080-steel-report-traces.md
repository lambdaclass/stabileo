### Fixed

#### Avoid discarded calculation traces in concurrent steel reports

- Check every steel station without rendering its calculation, then trace only the cases retained in the report. Reuse the governing case's interaction result. Steel shed reports retain identical results, calculation text, refusals and certificates while avoiding detailed traces for discarded stations. No numerical engine results change.
