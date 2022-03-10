import { Network } from "@ethersproject/networks";
import { parseUnits } from "@ethersproject/units";
import { RelayerParams } from "defender-relay-client/lib/relayer";
import { DefenderRelayProvider, DefenderRelaySigner } from "defender-relay-client/lib/ethers";
import { Contract } from "ethers";

import lotteryABI from "./abi/TitanoLottery.json";
import config from "./config";
import { ChainId, EnvInfo } from "./types";
import { getTicketPrice, getEndTime } from "./utils";

export async function handler(credentials: RelayerParams) {
  const provider = new DefenderRelayProvider(credentials);
  const signer = new DefenderRelaySigner(credentials, provider, { speed: "fast" });
  const network: Network = await provider.detectNetwork();
  const chainId = network.chainId as ChainId;

  const lotteryContract = new Contract(config.Lottery[chainId], lotteryABI, signer);
  const currentLotteryId = await lotteryContract.viewCurrentLotteryId();
  const currentLottery = await lotteryContract.viewLottery(currentLotteryId);
  const { status: currentLotteryStatus } = currentLottery;

  if (currentLotteryStatus !== 1) {
    try {
      console.log("Lets start new lottery");
      const endTime = getEndTime();
      const ticketPrice: string = await getTicketPrice(
        provider,
        chainId,
        config.Ticket.Price[chainId],
        config.Ticket.Precision[chainId]
      );
      const address = await signer.getAddress();
      const gasPrice = await provider.getGasPrice();
      const tx = await lotteryContract.startLottery(
        endTime,
        parseUnits(ticketPrice, "ether"),
        config.DiscountDivisor[chainId],
        config.RewardsBreakdown[chainId],
        { from: address, gasLimit: 500000, gasPrice: gasPrice.mul(2) }
      );
      const receipt = await tx.wait();
      const message = `[${new Date().toISOString()}] chainId=${chainId} message='Started lottery' hash=${
        tx?.hash
      } signer=${address}`;
      console.log(message);
    } catch (err) {
      console.log(err);
    }
  } else {
    console.log(`Current status lottery not close or claimable. Its: ${currentLotteryStatus}`);
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
