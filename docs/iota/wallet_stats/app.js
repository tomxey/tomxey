const API_URL = "https://api.mainnet.iota.cafe:443";
const INDEXER_API_URL = "https://indexer.mainnet.iota.cafe:443";
const COINGECKO_API = "https://api.coingecko.com/api/v3";

let currentIOTAPrice = null;
let currentCurrency = "USD";
let currentAddress = null;
let allTransactions = [];
let displayedTransactionCount = 0;
const TRANSACTIONS_PER_PAGE = 50;

// LocalStorage key for storing address history
const ADDRESS_HISTORY_KEY = "iotaWalletAddressHistory";
const MAX_HISTORY_SIZE = 10;

function formatBalance(nanos) {
  // Convert from nanos to IOTA (divide by 1,000,000,000)
  const value = parseInt(nanos) / 1000000000;
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

function showError(message) {
  const errorDiv = document.getElementById("error");
  errorDiv.innerHTML = `<div class="error">${message}</div>`;
  errorDiv.style.display = "block";
  document.getElementById("loading").style.display = "none";
  document.getElementById("statsCard").classList.remove("visible");
}

function hideError() {
  document.getElementById("error").style.display = "none";
}

function validateAddress(address) {
  // Check if it's a valid hex address
  if (!address.startsWith("0x")) {
    return false;
  }
  // Remove 0x and check if remaining is valid hex (64 chars)
  const hexPart = address.slice(2);
  return /^[0-9a-fA-F]{64}$/.test(hexPart);
}

async function rpcCall(method, params) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: method,
      params: params,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message || "RPC Error");
  }

  return data.result;
}

async function rpcCallIndexer(method, params) {
  const response = await fetch(INDEXER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: method,
      params: params,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message || "RPC Error");
  }

  return data.result;
}

async function fetchIOTAPrice(currency) {
  try {
    const response = await fetch(
      `${COINGECKO_API}/simple/price?ids=iota&vs_currencies=${currency.toLowerCase()}`,
    );

    if (!response.ok) {
      console.error("Failed to fetch IOTA price");
      return null;
    }

    const data = await response.json();
    return data.iota?.[currency.toLowerCase()] || null;
  } catch (error) {
    console.error("Error fetching IOTA price:", error);
    return null;
  }
}

function formatFiatValue(iotaAmount, price, currency) {
  if (!price) {
    return "Price unavailable";
  }

  const fiatValue = iotaAmount * price;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(fiatValue);
}

function saveAddressToHistory(address) {
  // Get existing history
  let history = getAddressHistory();

  // Remove address if it already exists (to move it to front)
  history = history.filter((addr) => addr !== address);

  // Add address to the beginning
  history.unshift(address);

  // Limit history size
  if (history.length > MAX_HISTORY_SIZE) {
    history = history.slice(0, MAX_HISTORY_SIZE);
  }

  // Save to localStorage
  localStorage.setItem(ADDRESS_HISTORY_KEY, JSON.stringify(history));
}

function getAddressHistory() {
  try {
    const history = localStorage.getItem(ADDRESS_HISTORY_KEY);
    return history ? JSON.parse(history) : [];
  } catch (error) {
    console.error("Error reading address history:", error);
    return [];
  }
}

function displayAddressHistory() {
  const history = getAddressHistory();
  const inputElement = document.getElementById("walletAddress");

  if (history.length === 0) {
    return;
  }

  // Create or update datalist for autocomplete
  let datalist = document.getElementById("addressHistory");
  if (!datalist) {
    datalist = document.createElement("datalist");
    datalist.id = "addressHistory";
    inputElement.setAttribute("list", "addressHistory");
    inputElement.parentNode.appendChild(datalist);
  }

  // Clear and populate datalist
  datalist.innerHTML = "";
  history.forEach((address) => {
    const option = document.createElement("option");
    option.value = address;
    datalist.appendChild(option);
  });
}

async function fetchWalletStats() {
  const address = document.getElementById("walletAddress").value.trim();

  if (!address) {
    showError("⚠️ Please enter a wallet address");
    return;
  }

  if (!validateAddress(address)) {
    showError(
      '⚠️ Invalid address format. Address must start with "0x" followed by 64 hexadecimal characters.',
    );
    return;
  }

  hideError();
  document.getElementById("loading").style.display = "block";
  document.getElementById("statsCard").classList.remove("visible");
  document.getElementById("searchBtn").disabled = true;

  // Get selected currency
  currentCurrency = document.getElementById("currencySelector").value;

  // Save address to history
  saveAddressToHistory(address);
  displayAddressHistory();

  try {
    // Fetch IOTA price first
    currentIOTAPrice = await fetchIOTAPrice(currentCurrency);
    // Get all balances for the address
    const balances = await rpcCall("iotax_getAllBalances", [address]);

    // Get all coins for the address (first page)
    const coinsData = await rpcCall("iotax_getAllCoins", [
      address,
      null, // cursor
      10, // limit
    ]);

    // Get owned objects count
    const objectsData = await rpcCall("iotax_getOwnedObjects", [
      address,
      {
        filter: null,
        options: {
          showType: false,
          showOwner: false,
          showPreviousTransaction: false,
          showDisplay: false,
          showContent: false,
          showBcs: false,
          showStorageRebate: false,
        },
      },
      null, // cursor
      1, // just need count
    ]);

    // Get staking information
    const stakesData = await rpcCall("iotax_getStakes", [address]);

    // Store current address for pagination
    currentAddress = address;

    // Get transaction history (first 50 transactions) using indexer API
    const transactionsData = await rpcCallIndexer(
      "iotax_queryTransactionBlocks",
      [
        {
          filter: {
            FromOrToAddress: {
              addr: address,
            },
          },
          options: {
            showInput: true,
            showEffects: true,
            showEvents: false,
            showObjectChanges: false,
            showBalanceChanges: true,
          },
        },
        null, // cursor
        TRANSACTIONS_PER_PAGE, // limit to 50 transactions per page
        true, // descending order (newest first)
      ],
    );

    // Store transactions for pagination
    allTransactions = transactionsData.data || [];
    displayedTransactionCount = allTransactions.length;

    // Calculate total balance
    let totalBalance = 0;
    let iotaBalance = null;

    if (balances && balances.length > 0) {
      for (const balance of balances) {
        if (balance.coinType === "0x2::iota::IOTA") {
          iotaBalance = balance;
          totalBalance = parseInt(balance.totalBalance);
        }
      }
    }

    // Display results
    document.getElementById("displayAddress").textContent = address;
    const totalBalanceIOTA = totalBalance / 1000000000;
    document.getElementById("totalBalance").textContent =
      formatBalance(totalBalance) + " IOTA";

    // Display FIAT value for total balance
    if (currentIOTAPrice) {
      document.getElementById("totalBalanceFiat").textContent = formatFiatValue(
        totalBalanceIOTA,
        currentIOTAPrice,
        currentCurrency,
      );
    } else {
      document.getElementById("totalBalanceFiat").textContent = "";
    }

    document.getElementById("coinCount").textContent = iotaBalance
      ? iotaBalance.coinObjectCount
      : 0;

    // For total objects, we'd need to paginate through all or use a different approach
    // For now, showing the coin count as a proxy
    document.getElementById("totalObjects").textContent =
      coinsData && coinsData.data
        ? coinsData.data.length + (coinsData.hasNextPage ? "+" : "")
        : "0";

    // Display coin details
    if (coinsData && coinsData.data && coinsData.data.length > 0) {
      const coinsList = document.getElementById("coinsList");
      coinsList.innerHTML = coinsData.data
        .map(
          (coin) => `
                <div class="coin-item">
                    <strong>Balance:</strong> ${formatBalance(coin.balance)} IOTA<br>
                    <strong>Version:</strong> ${coin.version}<br>
                    <strong>Coin ID:</strong> <span class="coin-id">${coin.coinObjectId}</span>
                </div>
            `,
        )
        .join("");

      if (coinsData.hasNextPage) {
        coinsList.innerHTML += `<div class="info-text">Showing first 10 coins. There are more coins available.</div>`;
      }

      document.getElementById("coinsSection").style.display = "block";
    } else {
      document.getElementById("coinsSection").style.display = "none";
    }

    // Display staking information
    if (stakesData && stakesData.length > 0) {
      const stakingList = document.getElementById("stakingList");
      let totalStaked = 0;
      let stakingHtml = "";

      let totalEstimatedRewards = 0;

      for (const validator of stakesData) {
        stakingHtml += `
                    <div class="validator-group">
                        <div><strong>Validator:</strong></div>
                        <div class="validator-address">
                            <a href="https://mainnet.iota.guru/validators/${validator.validatorAddress}" target="_blank" rel="noopener noreferrer">
                                ${validator.validatorAddress}
                            </a>
                        </div>
                        <div style="margin-top: 10px;">
                `;

        for (const stake of validator.stakes) {
          const principal = parseInt(stake.principal);
          totalStaked += principal;
          const principalIOTA = formatBalance(principal);

          // Add estimated rewards to total
          if (stake.estimatedReward) {
            totalEstimatedRewards += parseInt(stake.estimatedReward);
          }

          let statusClass = "";
          let statusText = stake.status;
          if (stake.status === "Active") {
            statusClass = "active";
          } else if (stake.status === "Pending") {
            statusClass = "pending";
          } else if (stake.status === "Unstaked") {
            statusClass = "unstaked";
          }

          stakingHtml += `
                        <div class="stake-item">
                            <div class="stake-detail">
                                <strong>Principal:</strong> ${principalIOTA} IOTA
                                <span class="stake-status ${statusClass}">${statusText}</span>
                            </div>
                            <div class="stake-detail">
                                <strong>Stake Request Epoch:</strong> ${stake.stakeRequestEpoch}
                            </div>
                            <div class="stake-detail">
                                <strong>Stake Active Epoch:</strong> ${stake.stakeActiveEpoch}
                            </div>
                            ${
                              stake.estimatedReward
                                ? `
                            <div class="stake-detail">
                                <strong>Estimated Reward:</strong> ${formatBalance(parseInt(stake.estimatedReward))} IOTA
                            </div>
                            `
                                : ""
                            }
                            <div class="stake-detail">
                                <strong>Staked IOTA ID:</strong>
                                <span class="coin-id">${stake.stakedIotaId}</span>
                            </div>
                        </div>
                    `;
        }

        stakingHtml += `
                        </div>
                    </div>
                `;
      }

      stakingList.innerHTML = stakingHtml;
      document.getElementById("stakingSection").style.display = "block";

      // Update the display to show total staked amount
      const totalStakedIOTA = totalStaked / 1000000000;
      document.getElementById("totalStaked").textContent =
        formatBalance(totalStaked) + " IOTA";

      // Display FIAT value for total staked
      if (currentIOTAPrice) {
        document.getElementById("totalStakedFiat").textContent =
          formatFiatValue(totalStakedIOTA, currentIOTAPrice, currentCurrency);
      } else {
        document.getElementById("totalStakedFiat").textContent = "";
      }

      if (totalStaked > 0) {
        const stakingSummary = `
                    <div class="info-text">
                        <strong>Total Staked:</strong> ${formatBalance(totalStaked)} IOTA<br>
                        <strong>Total Estimated Rewards:</strong> ${formatBalance(totalEstimatedRewards)} IOTA
                    </div>
                `;
        stakingList.innerHTML += stakingSummary;
      }

      // Calculate and display total wallet value
      const totalWalletValue =
        totalBalance + totalStaked + totalEstimatedRewards;
      const totalWalletValueIOTA = totalWalletValue / 1000000000; // Convert to IOTA

      document.getElementById("totalValue").textContent =
        formatBalance(totalWalletValue) + " IOTA";

      // Display FIAT value
      if (currentIOTAPrice) {
        document.getElementById("totalValueFiat").textContent = formatFiatValue(
          totalWalletValueIOTA,
          currentIOTAPrice,
          currentCurrency,
        );
      } else {
        document.getElementById("totalValueFiat").textContent =
          "Price unavailable";
      }
    } else {
      document.getElementById("stakingSection").style.display = "none";
      document.getElementById("totalStaked").textContent = "0 IOTA";
      document.getElementById("totalStakedFiat").textContent = "";

      // Calculate total wallet value without staking
      const totalWalletValue = totalBalance;
      const totalWalletValueIOTA = totalWalletValue / 1000000000; // Convert to IOTA

      document.getElementById("totalValue").textContent =
        formatBalance(totalWalletValue) + " IOTA";

      // Display FIAT value
      if (currentIOTAPrice) {
        document.getElementById("totalValueFiat").textContent = formatFiatValue(
          totalWalletValueIOTA,
          currentIOTAPrice,
          currentCurrency,
        );
      } else {
        document.getElementById("totalValueFiat").textContent =
          "Price unavailable";
      }
    }

    if (
      totalBalance === 0 &&
      (!coinsData || !coinsData.data || coinsData.data.length === 0) &&
      (!stakesData || stakesData.length === 0)
    ) {
      showError(
        "⚠️ No coins or stakes found for this address. The address may be empty or invalid.",
      );
      return;
    }

    // Display transaction history
    if (allTransactions && allTransactions.length > 0) {
      displayTransactions();
      document.getElementById("transactionsSection").style.display = "block";
    } else {
      const transactionsList = document.getElementById("transactionsList");
      transactionsList.innerHTML = `
                <div class="no-transactions">
                    No transactions found for this address.
                </div>
            `;
      document.getElementById("transactionsSection").style.display = "block";
    }

    document.getElementById("statsCard").classList.add("visible");
  } catch (error) {
    console.error("Error:", error);
    showError(
      `❌ Error fetching wallet data: ${error.message}. Please check the address and try again.`,
    );
  } finally {
    document.getElementById("loading").style.display = "none";
    document.getElementById("searchBtn").disabled = false;
  }
}

function displayTransactions() {
  const transactionsList = document.getElementById("transactionsList");
  let transactionsHtml = "";

  for (const tx of allTransactions) {
    const digest = tx.digest;
    const timestamp = tx.timestampMs
      ? new Date(parseInt(tx.timestampMs)).toLocaleString()
      : "Unknown";

    // Get transaction status
    const status = tx.effects?.status?.status || "Unknown";
    const statusClass = status === "success" ? "success" : "failure";

    // Get gas used
    const gasUsed = tx.effects?.gasUsed?.computationCost
      ? parseInt(tx.effects.gasUsed.computationCost) +
        parseInt(tx.effects.gasUsed.storageCost || 0) -
        parseInt(tx.effects.gasUsed.storageRebate || 0)
      : 0;

    // Determine transaction type and check for staking operations
    let txType = "Unknown";
    let stakingLabel = "";
    let isStakingTx = false;

    if (tx.transaction?.data?.transaction) {
      const txData = tx.transaction.data.transaction;
      if (txData.kind === "ProgrammableTransaction") {
        txType = "Programmable Transaction";

        // Check for staking operations
        if (txData.transactions) {
          for (const innerTx of txData.transactions) {
            if (innerTx.MoveCall) {
              const moveCall = innerTx.MoveCall;
              // Check for staking system calls
              if (
                moveCall.package ===
                  "0x0000000000000000000000000000000000000000000000000000000000000003" &&
                moveCall.module === "iota_system"
              ) {
                if (
                  moveCall.function === "request_add_stake" ||
                  moveCall.function === "request_add_stake_mul_coin"
                ) {
                  stakingLabel = "🔒 STAKE";
                  isStakingTx = true;
                } else if (moveCall.function === "request_withdraw_stake") {
                  stakingLabel = "🔓 UNSTAKE";
                  isStakingTx = true;
                }
              }
            }
          }
        }
      } else {
        txType = txData.kind || "Unknown";
      }
    }

    transactionsHtml += `
                    <div class="transaction-item${isStakingTx ? " staking-transaction" : ""}">
                        <div class="transaction-header">
                            <div class="transaction-digest">
                                <a href="https://explorer.iota.org/txblock/${digest}" target="_blank" rel="noopener noreferrer" title="${digest}">${digest.substring(0, 8)}...${digest.substring(digest.length - 6)}</a>
                                <span class="transaction-status ${statusClass}">${status}</span>
                                ${stakingLabel ? `<span class="staking-badge">${stakingLabel}</span>` : ""}
                                <span class="transaction-detail-inline"><strong>Gas:</strong> <span class="gas-used">${formatBalance(gasUsed)}</span></span>
                            </div>
                            <div class="transaction-timestamp">${timestamp}</div>
                        </div>
                `;

    // Display balance changes (only for the current address)
    if (tx.balanceChanges && tx.balanceChanges.length > 0) {
      // Filter balance changes to only show those for the current address
      const relevantChanges = tx.balanceChanges.filter((change) => {
        const owner = change.owner?.AddressOwner || change.owner || "";
        return owner === currentAddress;
      });

      if (relevantChanges.length > 0) {
        transactionsHtml += `
                        <div class="balance-changes">
                    `;

        for (const change of relevantChanges) {
          const amount = parseInt(change.amount);
          const amountIOTA = formatBalance(Math.abs(amount));
          let amountClass = "neutral";
          let amountPrefix = "";

          if (amount > 0) {
            amountClass = "positive";
            amountPrefix = "+";
          } else if (amount < 0) {
            amountClass = "negative";
            amountPrefix = "-";
          }

          const coinType = change.coinType?.split("::").pop() || "Unknown";

          transactionsHtml += `
                            <div class="balance-change-item">
                                <div>
                                    <strong>${coinType}:</strong>
                                    <span class="balance-change-amount ${amountClass}">
                                        ${amountPrefix}${amountIOTA} IOTA
                                    </span>
                                </div>
                            </div>
                        `;
        }

        transactionsHtml += `
                        </div>
                    `;
      }
    }

    transactionsHtml += `
                    </div>
                `;
  }

  transactionsList.innerHTML = transactionsHtml;

  // Add transaction count and load more button
  const controlsHtml = `
    <div class="transaction-controls">
      <div class="info-text">
        Showing ${displayedTransactionCount} transaction${displayedTransactionCount !== 1 ? "s" : ""}
      </div>
      <button id="loadMoreBtn" class="load-more-btn" onclick="loadMoreTransactions()">
        Load More (${TRANSACTIONS_PER_PAGE} more)
      </button>
    </div>
  `;

  transactionsList.innerHTML += controlsHtml;
}

async function loadMoreTransactions() {
  if (!currentAddress || allTransactions.length === 0) {
    return;
  }

  const loadMoreBtn = document.getElementById("loadMoreBtn");
  loadMoreBtn.disabled = true;
  loadMoreBtn.textContent = "Loading...";

  try {
    // Get the last transaction's cursor
    const lastTx = allTransactions[allTransactions.length - 1];
    const cursor = lastTx.digest;

    // Fetch next batch of transactions
    const transactionsData = await rpcCallIndexer(
      "iotax_queryTransactionBlocks",
      [
        {
          filter: {
            FromOrToAddress: {
              addr: currentAddress,
            },
          },
          options: {
            showInput: true,
            showEffects: true,
            showEvents: false,
            showObjectChanges: false,
            showBalanceChanges: true,
          },
        },
        cursor, // cursor from last transaction
        TRANSACTIONS_PER_PAGE + 1, // +1 to skip the cursor transaction
        true, // descending order (newest first)
      ],
    );

    // Remove first transaction (it's the cursor/duplicate)
    const newTransactions = transactionsData.data.slice(1);

    if (newTransactions.length > 0) {
      allTransactions = allTransactions.concat(newTransactions);
      displayedTransactionCount = allTransactions.length;
      displayTransactions();
    } else {
      // No more transactions
      loadMoreBtn.textContent = "No more transactions";
      loadMoreBtn.disabled = true;
    }
  } catch (error) {
    console.error("Error loading more transactions:", error);
    loadMoreBtn.textContent = "Error loading more";
    loadMoreBtn.disabled = false;
  }
}

// Initialize event listeners when DOM is loaded
document.addEventListener("DOMContentLoaded", function () {
  // Display address history on page load
  displayAddressHistory();

  // Allow Enter key to trigger search
  document
    .getElementById("walletAddress")
    .addEventListener("keypress", function (event) {
      if (event.key === "Enter") {
        fetchWalletStats();
      }
    });
});
