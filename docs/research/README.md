# Research

This folder is for comparative notes and longer-form research on the solver that should not live in the benchmark or roadmap docs.

Current documents:

- [solver_safety_and_validation_hardening.md](solver_safety_and_validation_hardening.md)
  Solver safety architecture for explicit failure modes, input validation, convergence safeguards, post-solve verification, structured diagnostics, solver-run artifacts, and frontend mutation guards.
- [open_source_solver_comparison.md](open_source_solver_comparison.md)
  Comparison of Dedaliano against major open-source structural / FEA solver projects.
- [numerical_methods_gap_analysis.md](numerical_methods_gap_analysis.md)
  Large-model numerical-methods gap analysis and corrected performance priorities.
- [competitor_element_families.md](competitor_element_families.md)
  Competitor shell/element-family matrix and the highest-value remaining gaps.
- [shell_family_selection.md](shell_family_selection.md)
  Shell-family selection rules, defaults, and product guidance.
- [webgpu_solver_renderer_analysis.md](webgpu_solver_renderer_analysis.md)
  WebGPU fit analysis for the renderer vs solver, with ROI and sequencing guidance.
- [cholmod_nvidia_gpu_research.md](cholmod_nvidia_gpu_research.md)
  CHOLMOD + NVIDIA GPU feasibility research for Dedaliano: architecture fit, realistic speed expectations, remote-server implications, and benchmark plan.
- [lean_formal_verification.md](lean_formal_verification.md)
  Lean formal-verification research plan for the solver core, with ROI-ranked proof targets, theorem ladder, and phased implementation strategy.
