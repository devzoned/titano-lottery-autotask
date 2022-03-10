import { Network } from "@ethersproject/networks";
import { RelayerParams } from "defender-relay-client/lib/relayer";
import { DefenderRelayProvider, DefenderRelaySigner } from "defender-relay-client/lib/ethers";
import { BigNumber, Contract } from "ethers";

import lotteryABI from "./abi/TitanoLottery.json";
import randomNumberGeneratorABI from "./abi/RandomNumberGenerator.json";
import config from "./config";
import { ChainId, EnvInfo } from "./types";
import { getCountTicketsOnBrackets } from "./utils";

export async function handler(credentials: RelayerParams) {
  const provider = new DefenderRelayProvider(credentials);
  const signer = new DefenderRelaySigner(credentials, provider, { speed: "fast" });
  const network: Network = await provider.detectNetwork();
  const chainId = network.chainId as ChainId;

  const lotteryContract = new Contract(config.Lottery[chainId], lotteryABI, signer);
  const [currentLotteryId, burningShare, competitionAndRefShare] = await Promise.all([
    lotteryContract.viewCurrentLotteryId(),
    lotteryContract.burningShare(),
    lotteryContract.competitionAndRefShare(),
  ]);
  const currentLottery = await lotteryContract.viewLottery(currentLotteryId);
  const { status: currentLotteryStatus } = currentLottery;

  const rngAddress = await lotteryContract.randomGenerator();
  const rngContract = new Contract(rngAddress, randomNumberGeneratorABI, signer);

  if (currentLotteryStatus === 2) {
    try {
      console.log("Try to draw final number and make lottery claimable");
      const autoInjection = true;
      const amountCollectedInTITANO = BigNumber.from(currentLottery.amountCollectedInTITANO);
      const firstTicketId = currentLottery.firstTicketId;
      const lastTicketId = currentLottery.firstTicketIdNextLottery;
      const totalTicketsPerLottery = lastTicketId - firstTicketId;
      const rewardsBreakdown = currentLottery.rewardsBreakdown;
      const ticketIdsForCurLottery = (function (a, b, c: any) {
        c = [];
        while (a--) c[a] = a + b;
        return c;
      })(+totalTicketsPerLottery, +firstTicketId, []);
      const ticketsNumbers = (await lotteryContract.viewNumbersAndStatusesForTicketIds(ticketIdsForCurLottery))[0];
      const currentLotteryIdInRng = await rngContract.viewLatestLotteryId();
      if (currentLotteryIdInRng !== currentLotteryId) {
        console.log(`In RNG contract random number for this lottery not ready. ${currentLotteryIdInRng}`);
        return;
      }
      const randomResult = await rngContract.viewRandomResult();
      const pendingInjectionNextLottery = BigNumber.from(await lotteryContract.pendingInjectionNextLottery());
      const amountToDistribute = amountCollectedInTITANO
        .sub(amountCollectedInTITANO.mul(+burningShare + +competitionAndRefShare).div(10000))
        .add(pendingInjectionNextLottery);
      const calculateBrackets = getCountTicketsOnBrackets(
        ticketsNumbers,
        randomResult,
        rewardsBreakdown,
        amountToDistribute
      );
      if (calculateBrackets.length > 0) {
        const address = await signer.getAddress();
        const gasPrice = await provider.getGasPrice();
        const tx = await lotteryContract.drawFinalNumberAndMakeLotteryClaimable(
          currentLotteryId,
          calculateBrackets[0],
          calculateBrackets[1],
          autoInjection,
          { from: address, gasLimit: 500000, gasPrice: gasPrice.mul(2) }
        );
        const receipt = await tx.wait();
        const message = `[${new Date().toISOString()}] chainId=${chainId} message='Closed lottery #${currentLotteryId}' hash=${
          tx?.hash
        } signer=${address}`;
        console.log(message);
      }
    } catch (err) {
      console.log(err);
    }
  } else {
    console.log(`Current lottery status is: ${currentLotteryStatus}`)
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
