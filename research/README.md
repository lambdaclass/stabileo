# Research

This folder is for comparative notes, external landscape analysis, and longer-form research that should not live in the main product, benchmark, or roadmap docs.

Current documents:

- [solver_safety_and_validation_hardening.md](/Users/unbalancedparen/projects/dedaliano/research/solver_safety_and_validation_hardening.md)
  Solver safety architecture for explicit failure modes, input validation, convergence safeguards, post-solve verification, structured diagnostics, solver-run artifacts, and frontend mutation guards.
- [automation_gaps.md](/Users/unbalancedparen/projects/dedaliano/research/automation_gaps.md)
  Full automation gap analysis for Stabileo/Dedaliano: what is already automated, what engineers still do manually (high and medium impact), first-mover opportunities no competitor has, an automation maturity ladder, a prioritized implementation matrix, and a competitor coverage map.
- [competitive_displacement_by_step.md](/Users/unbalancedparen/projects/dedaliano/research/competitive_displacement_by_step.md)
  Which roadmap steps displace which competitors, what each step removes from the incumbent stack, and the likely savings/positioning impact.
- [structural_engineering_software_market_research.md](/Users/unbalancedparen/projects/dedaliano/research/structural_engineering_software_market_research.md)
  Competitor pricing and market-position research across CSI, Dlubal, Bentley, CYPE, SkyCiv, ClearCalcs, and other structural software vendors.
- [cypecad_competitive_gap_and_parity_plan.md](/Users/unbalancedparen/projects/dedaliano/research/cypecad_competitive_gap_and_parity_plan.md)
  Unified CYPECAD note: corrected gap framing plus phased parity plan, with emphasis on RC automation, BBS, reports, and the narrower remaining genuine solver gaps.
- [rc_design_and_bbs.md](/Users/unbalancedparen/projects/dedaliano/research/rc_design_and_bbs.md)
  Why RC design, reinforcement schedules, and later BBS generation should be explicit priorities, with solver vs product responsibilities and staged delivery order.
- [post_roadmap_software_stack.md](/Users/unbalancedparen/projects/dedaliano/research/post_roadmap_software_stack.md)
  Best software products to build once the core roadmap lands: RC design/BBS studio, report OS, QA/review assistant, firm workspace, parametric configurators, interoperability, cloud comparison, and education.
- [ai_structural_engineering_roadmap.md](/Users/unbalancedparen/projects/dedaliano/research/ai_structural_engineering_roadmap.md)
  Separate AI roadmap for structural engineering: what can ship early on today’s solver, what needs deeper batch/optimization infrastructure, and what belongs to the research frontier.
- [ai_provider_architecture.md](/Users/unbalancedparen/projects/dedaliano/research/ai_provider_architecture.md)
  Recommended AI integration architecture: frontend calls an internal capability-based AI layer, which routes to Claude/OpenAI/Kimi/local/future providers through backend adapters.
- [open_source_vs_hosted_ai_boundary.md](/Users/unbalancedparen/projects/dedaliano/research/open_source_vs_hosted_ai_boundary.md)
  Recommended split between open-source AI surfaces and hosted/private AI moat: keep baseline AI usefulness in OSS, keep orchestration, scale, collaboration, and premium automation in the paid layer.
- [open_source_solver_comparison.md](/Users/unbalancedparen/projects/dedaliano/research/open_source_solver_comparison.md)
  Comparison of Dedaliano against major open-source structural / FEA solver projects.
- [numerical_methods_gap_analysis.md](/Users/unbalancedparen/projects/dedaliano/research/numerical_methods_gap_analysis.md)
  Large-model numerical-methods gap analysis and corrected performance priorities.
- [competitor_element_families.md](/Users/unbalancedparen/projects/dedaliano/research/competitor_element_families.md)
  Competitor shell/element-family matrix and the highest-value remaining gaps.
- [shell_family_selection.md](/Users/unbalancedparen/projects/dedaliano/research/shell_family_selection.md)
  Shell-family selection rules, defaults, and product guidance.
- [beyond_roadmap_opportunities.md](/Users/unbalancedparen/projects/dedaliano/research/beyond_roadmap_opportunities.md)
  Research-backed opportunities beyond the solver roadmap: code checking, ML surrogates, FEMA P-58, topology optimization, BIM-IFC, CLT, seismic automation, generative design, and a nuanced WebGPU assessment (GPU helps visualization/postprocessing/topology, but sparse direct stays on CPU).
- [webgpu_solver_renderer_analysis.md](/Users/unbalancedparen/projects/dedaliano/research/webgpu_solver_renderer_analysis.md)
  WebGPU fit analysis for the renderer vs solver, with ROI and sequencing guidance.
- [cholmod_nvidia_gpu_research.md](/Users/unbalancedparen/projects/dedaliano/research/cholmod_nvidia_gpu_research.md)
  CHOLMOD + NVIDIA GPU feasibility research for Dedaliano: architecture fit, realistic speed expectations, remote-server implications, and benchmark plan.
- [lean_formal_verification.md](/Users/unbalancedparen/projects/dedaliano/research/lean_formal_verification.md)
  Lean formal-verification research plan for the solver core, with ROI-ranked proof targets, theorem ladder, and phased implementation strategy.
