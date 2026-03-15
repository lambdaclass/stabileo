# Research

This folder is for comparative notes, external landscape analysis, and longer-form research that should not live in the main product, benchmark, or roadmap docs.

Current documents:

- [lean_formal_verification.md](/Users/unbalancedparen/projects/dedaliano/research/lean_formal_verification.md)
  Lean formal-verification research plan for the solver core, with ROI-ranked proof targets, theorem ladder, and phased implementation strategy.
- [open_source_solver_comparison.md](/Users/unbalancedparen/projects/dedaliano/research/open_source_solver_comparison.md)
  Comparison of Dedaliano against major open-source structural / FEA solver projects.
- [competitor_element_families.md](/Users/unbalancedparen/projects/dedaliano/research/competitor_element_families.md)
  Competitor shell/element-family matrix and the highest-value remaining gaps.
- [shell_family_selection.md](/Users/unbalancedparen/projects/dedaliano/research/shell_family_selection.md)
  Shell-family selection rules, defaults, and product guidance.
- [numerical_methods_gap_analysis.md](/Users/unbalancedparen/projects/dedaliano/research/numerical_methods_gap_analysis.md)
  Large-model numerical-methods gap analysis and corrected performance priorities.
- [webgpu_solver_renderer_analysis.md](/Users/unbalancedparen/projects/dedaliano/research/webgpu_solver_renderer_analysis.md)
  WebGPU fit analysis for the renderer vs solver, with ROI and sequencing guidance.
- [rc_design_and_bbs.md](/Users/unbalancedparen/projects/dedaliano/research/rc_design_and_bbs.md)
  Why RC design, reinforcement schedules, and later BBS generation should be explicit priorities, with solver vs product responsibilities and staged delivery order.
- [cypecad_parity_roadmap.md](cypecad_parity_roadmap.md)
  Comprehensive CYPECAD feature parity roadmap. Exhaustive feature audit vs our 50k-LOC Rust engine — all solver work is done, only frontend/wiring/output remains. Phased plan from rebar detailing (Phase 1) through advanced analysis UI (Phase 5).
- [cypecad_gap_analysis.md](/Users/unbalancedparen/projects/dedaliano/research/cypecad_gap_analysis.md)
  Corrected CYPECAD-vs-Dedaliano gap analysis, separating engine capability from workflow/product, design automation, and report/export gaps.
- [beyond_roadmap_opportunities.md](/Users/unbalancedparen/projects/dedaliano/research/beyond_roadmap_opportunities.md)
  Research-backed opportunities beyond the solver roadmap: code checking, ML surrogates, FEMA P-58, topology optimization, BIM-IFC, CLT, seismic automation, generative design, and a nuanced WebGPU assessment (GPU helps visualization/postprocessing/topology, but sparse direct stays on CPU).
- [post_roadmap_software_stack.md](/Users/unbalancedparen/projects/dedaliano/research/post_roadmap_software_stack.md)
  Best software products to build once the core roadmap lands: RC design/BBS studio, report OS, QA/review assistant, firm workspace, parametric configurators, interoperability, cloud comparison, and education.
- [ai_structural_engineering_roadmap.md](/Users/unbalancedparen/projects/dedaliano/research/ai_structural_engineering_roadmap.md)
  Separate AI roadmap for structural engineering: what can ship early on today’s solver, what needs deeper batch/optimization infrastructure, and what belongs to the research frontier.
