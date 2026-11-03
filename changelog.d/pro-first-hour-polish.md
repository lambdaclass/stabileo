### Fixed
#### What a first hour in PRO runs into (2026-11-02)

- The default load cases are named in the interface's language ("Cargas permanentes",
  "Sobrecarga de uso", "Viento" and "Sismo" in Spanish) instead of always in English. Projects
  saved before keep their names.
- The report's node and member columns, and its slab and wall rows, follow the report's language.
- The report numbers its sections in the order printed, with no gap when a section is absent
  (2.3 was followed by 2.5 in a model without slabs), and its index lists them in that order with
  links that land.
- Exported figures and the report's figures leave out a label that has no room instead of writing
  it over another, and say under the figure how many they left out; the tables carry every value.
- Story drift is called "Deriva" in Spanish throughout.
- The Building, Foundations and Physical panels show their titles.
- The project's regulations list each code once.
- The load generator binds a wind or seismic code from its own form, where it used to send the
  user to the regulations panel and lose the form.
- "Combinations used by design" is titled for the analysis when design is off.
- A view export that draws nothing says so instead of closing without a file.
- The unstated basis of application is one warning for the whole stack, not one per regulation.
