const large = 2 ** 110;
const middle = 2 ** 54;

export const factorsWithUnitResidual = [large, middle, 1, -middle, -large];
export const factorsWithExactCancellation = [...factorsWithUnitResidual, -1];

export const issue2297Factors = [large, middle, 1, -middle, -1, -large, 1];
