export const EXERCISE = {
  stabileoExercise: 1,
  exercise: {
    id: 'e2e-cantilever',
    title: 'E2E cantilever',
    description: 'A 4 m cantilever with a 10 kN point load at the tip.',
    difficulty: 'easy',
    category: 'statics',
    model: {
      nodes: [[0, 0], [4, 0]],
      elements: [[0, 1]],
      supports: [{ node: 0, type: 'fixed' }],
      nodalLoads: [{ node: 1, fy: -10 }],
    },
    supports: [{ label: 'Fixed end', nodeIndex: 0, dofs: ['Ry', 'M'] }],
    characteristics: [{ label: 'M max', unit: 'kN·m', answer: { kind: 'maxAbsMoment' } }],
    diagramQuestions: [],
  },
};

export const PARAMETRIC_HANDOUT = { ...EXERCISE, exercise: { ...EXERCISE.exercise, title: 'Span {L} m', params: { values: { L: { min: 3, max: 5, step: 1 } } } } };
