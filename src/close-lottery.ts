import { Network } from "@ethersproject/networks";
import { RelayerParams } from "defender-relay-client/lib/relayer";
import { DefenderRelayProvider, DefenderRelaySigner } from "defender-relay-client/lib/ethers";
import { Contract } from "ethers";

import lotteryABI from "./abi/TitanoLottery.json";
import config from "./config";
import { ChainId, EnvInfo } from "./types";

export async function handler(credentials: RelayerParams) {
  const provider = new DefenderRelayProvider(credentials);
  const signer = new DefenderRelaySigner(credentials, provider, { speed: "fast" });
  const network: Network = await provider.detectNetwork();
  const chainId = network.chainId as ChainId;

  const lotteryContract = new Contract(config.Lottery[chainId], lotteryABI, signer);
  const currentLotteryId = await lotteryContract.viewCurrentLotteryId();
  const currentLottery = await lotteryContract.viewLottery(currentLotteryId);
  const { status: currentLotteryStatus } = currentLottery;

  if (currentLotteryStatus === 1) {
    console.log("Try to close current lottery");
    try {
      const timeLastBlock = (await provider.getBlock("latest")).timestamp;
      if (currentLottery.endTime === 0 || currentLottery.endTime > timeLastBlock) {
        console.log(
          `Current lottery not over. Current timestamp: ${timeLastBlock} End Timestamp: ${currentLottery.endTime}`
        );
      } else {
        const address = await signer.getAddress();
        const gasPrice = await provider.getGasPrice();
        const tx = await lotteryContract.closeLottery(currentLotteryId, {
          from: address,
          gasLimit: 500000,
          gasPrice: gasPrice.mul(2),
        });
        const receipt = await tx.wait();
        const message = `[${new Date().toISOString()}] chainId=${chainId} message='Closed lottery #${currentLotteryId}' hash=${
          tx?.hash
        } signer=${address}`;
        console.log(message);
      }
    } catch (err) {}
  } else {
    console.log(`Current status lottery not Open. Its: ${currentLotteryStatus}`);
  }
}

// To run locally (this code will not be executed in Autotasks environment, only when executed directly via `yarn start`)
if (require.main === module) {
  require("dotenv").config();
  const { API_KEY: apiKey, API_SECRET: apiSecret } = process.env as EnvInfo;
  handler({ apiKey, apiSecret })
    .then(() => process.exit(0))
    .catch((error: Error) => {
      console.error(error);
      process.exit(1);
    });
}
