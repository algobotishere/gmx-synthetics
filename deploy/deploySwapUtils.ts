import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "SwapUtils",
  libraryNames: ["FeeUtils", "MarketEventUtils", "SwapPricingUtils"],
});

export default func;
