let disclaimerOpen = $state(false);

export const legalNotices = {
  get disclaimerOpen() { return disclaimerOpen; },
  set disclaimerOpen(v: boolean) { disclaimerOpen = v; },
};
