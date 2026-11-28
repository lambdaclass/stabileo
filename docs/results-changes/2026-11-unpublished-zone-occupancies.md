# Review floor loads generated from unavailable occupancy tables

Integration builds could generate a live floor load from a confirmed European, UK, US or Turkish occupancy row while only the CIRSOC load authorities were available. This affected zones authored in the editor and zones reopened from a project file. Main already reported those rows as unsupported.

In the published profile, the zone plan reports an unsupported occupancy and presents any previously generated live definition for removal. Opening the file preserves its stored loads. Review the occupancy and select a supported row or enter a documented manual intensity before applying the zone plan. Review its additions and removals, regenerate the zone loads and rerun affected analyses. Existing explicit manual intensities and supported CIRSOC rows keep their values. The opt-in load profile uses its installed tables.
