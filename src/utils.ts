import AggregatorV3InterfaceABI from "@chainlink/contracts/abi/v0.8/AggregatorV3Interface.json";
import BigNumber from "bignumber.js";
import { DefenderRelayProvider } from "defender-relay-client/lib/ethers";
import { Contract, BigNumber as EthersBigNumber } from "ethers";
import moment from "moment";

import config from "./config";
import { ChainId } from "./types";

export const getTicketPrice = async (
  provider: DefenderRelayProvider,
  chainId: ChainId,
  usd: number,
  precision: number
): Promise<string> => {
  if (chainId === 97) {
    return "1";
  }
  // Bind the smart contract address to the Chainlink AggregatorV3Interface ABI, for the given network.
  const contract = await new Contract(config.Chainlink.Oracle[chainId], AggregatorV3InterfaceABI, provider);

  // Get the answer from the latest round data.
  const [, answer] = await contract.latestRoundData();

  // Format the answer to a fixed point number, as per Oracle's decimals.
  // Note: We output answer BN.js to string to avoid playing with multiple types/implementations.
  const price: BigNumber = new BigNumber(answer.toString()).div(1e8);

  // Compute the ticket price (denominated in $Cake), to the required USD eq. value.
  const ticketPrice: BigNumber = new BigNumber(usd).div(price);

  // Return the ticket price, up to `n` decimals.
  return ticketPrice.toFixed(precision);
};

/**
 * Get the next lottery 'endTime', based on current date, as UTC.
 * Used by 'start-lottery' Hardhat script, only.
 */
export const getEndTime = (chainId: ChainId): number => {
  if (chainId === 56) {
    // Get current date, as UTC.
    const now = moment().utc();

    // Get meridiem (AM/PM), based on current UTC Date.
    const meridiem = now.format("A");
    if (meridiem === "AM") {
      // We are in the morning (ante-meridiem), next lottery is at 12:00 PM (noon).
      return moment(`${now.format("MM DD YYYY")} 00:00:00 +0000`, "MM DD YYYY HH:mm:ss Z", true)
        .add(36, "hours")
        .startOf("hour")
        .utc()
        .unix();
    } else if (meridiem === "PM") {
      // We are in the afternoon (post-meridiem), next lottery is at 12:00 AM (midnight).
      return moment(`${now.format("MM DD YYYY")} 12:00:00 +0000`, "MM DD YYYY HH:mm:ss Z", true)
        .add(12, "hours")
        .startOf("hour")
        .utc()
        .unix();
    }
  } else if (chainId === 97) {
    const now = moment().utc();
    return now.unix() + 60 * 10;
  }

  throw new Error("Could not determine next Lottery end time.");
};

export const getCountTicketsOnBrackets = (
  ticketsNumbers: number[],
  winningNumber: number,
  rewardsBreakdown: number[],
  amountCollectedInTITANO: EthersBigNumber
): any[] => {
  let bracketCalculator = [];
  bracketCalculator[0] = 1;
  bracketCalculator[1] = 11;
  bracketCalculator[2] = 111;
  bracketCalculator[3] = 1111;
  bracketCalculator[4] = 11111;
  bracketCalculator[5] = 111111;
  bracketCalculator[6] = 1111111;
  bracketCalculator[7] = 11111111;

  let titanoPerBracket = [];
  let countTicketsPerBracket = [];
  let ticketsOnBrackets = new Map();
  let amountToInjectNextLottery = EthersBigNumber.from(0);
  for (let i = 0; i < ticketsNumbers.length; i++) {
    if (ticketsNumbers[i] < 100000000 || ticketsNumbers[i] > 199999999) {
      console.log("Wrong ticket number", ticketsNumbers[i]);
      return [];
    }
    for (let j = 0; j < 8; j++) {
      const key = bracketCalculator[j] + (ticketsNumbers[i] % 10 ** (j + 1));
      if (ticketsOnBrackets.has(key)) {
        ticketsOnBrackets.set(key, ticketsOnBrackets.get(key) + 1);
      } else {
        ticketsOnBrackets.set(key, 1);
      }
    }
  }
  let previousCount = 0;
  for (let i = 7; i >= 0; i--) {
    let transfWinningNumber = bracketCalculator[i] + (winningNumber % 10 ** (i + 1));
    countTicketsPerBracket[i] = ticketsOnBrackets.get(transfWinningNumber) - previousCount || 0;

    if (countTicketsPerBracket[i] > 0) {
      if (rewardsBreakdown[i] > 0) {
        titanoPerBracket[i] = amountCollectedInTITANO
          .mul(rewardsBreakdown[i])
          .div(countTicketsPerBracket[i])
          .div(10000)
          .sub(1); // To Warn correct rounding when infinite fraction
        previousCount = ticketsOnBrackets.get(transfWinningNumber);
      }
    } else {
      titanoPerBracket[i] = 0;
      amountToInjectNextLottery = amountToInjectNextLottery.add(
        amountCollectedInTITANO.mul(rewardsBreakdown[i]).div(10000)
      );
    }
  }
  return [titanoPerBracket, countTicketsPerBracket, amountToInjectNextLottery];
};
