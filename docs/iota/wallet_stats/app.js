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

// Progress tracking functions
function showProgress(current, total, message) {
  const progressDiv = document.getElementById("loadingProgress");
  const progressText = document.getElementById("progressText");
  const progressBar = document.getElementById("progressBar");

  if (progressDiv && progressText && progressBar) {
    progressDiv.style.display = "block";
    progressText.textContent = message;

    const percentage = Math.round((current / total) * 100);
    progressBar.style.width = percentage + "%";
    progressBar.textContent = percentage + "%";
  }
}

function hideProgress() {
  const progressDiv = document.getElementById("loadingProgress");
  if (progressDiv) {
    progressDiv.style.display = "none";
  }
}

// Small delay to make progress visible and avoid API rate limiting
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Update URL parameters
function updateURLParams() {
  const mode = document.querySelector('input[name="mode"]:checked').value;
  const params = new URLSearchParams();

  params.set("mode", mode);

  if (mode === "single") {
    const address = document.getElementById("walletAddress").value.trim();
    const currency = document.getElementById("currencySelector").value;

    if (address) {
      params.set("address", address);
    }
    if (currency) {
      params.set("currency", currency);
    }
  } else {
    const addresses = document.getElementById("multipleAddresses").value.trim();
    const currency = document.getElementById("currencySelectorMulti").value;

    if (addresses) {
      // Store multiple addresses as a comma-separated list
      const addressList = addresses
        .split("\n")
        .map((addr) => addr.trim())
        .filter((addr) => addr.length > 0);
      if (addressList.length > 0) {
        params.set("addresses", addressList.join(","));
      }
    }
    if (currency) {
      params.set("currency", currency);
    }
  }

  const newURL = window.location.pathname + "?" + params.toString();
  window.history.pushState({}, "", newURL);
}

// Load parameters from URL
function loadURLParams() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode");
  const currency = params.get("currency");
  const address = params.get("address");
  const addresses = params.get("addresses");

  // Set mode
  if (mode === "multiple") {
    document.querySelector('input[name="mode"][value="multiple"]').checked =
      true;
    toggleInputMode();
  }

  // Set currency
  if (currency) {
    if (mode === "multiple") {
      document.getElementById("currencySelectorMulti").value = currency;
    } else {
      document.getElementById("currencySelector").value = currency;
    }
  }

  // Set address(es)
  if (mode === "multiple" && addresses) {
    const addressList = addresses
      .split(",")
      .map((addr) => addr.trim())
      .filter((addr) => addr.length > 0);
    document.getElementById("multipleAddresses").value = addressList.join("\n");
    // Auto-fetch if we have addresses
    if (addressList.length > 0) {
      fetchMultipleWalletStats();
    }
  } else if (address) {
    document.getElementById("walletAddress").value = address;
    // Auto-fetch if we have an address
    fetchWalletStats();
  }
}

// Toggle between single and multiple address input modes
function toggleInputMode() {
  const mode = document.querySelector('input[name="mode"]:checked').value;
  const singleInputGroup = document.getElementById("singleInputGroup");
  const multiInputGroup = document.getElementById("multiInputGroup");
  const singleInfo = document.getElementById("singleInfo");
  const multiInfo = document.getElementById("multiInfo");

  // Hide stats card when switching modes to avoid showing stale data
  document.getElementById("statsCard").classList.remove("visible");
  hideError();

  if (mode === "single") {
    singleInputGroup.style.display = "flex";
    multiInputGroup.style.display = "none";
    singleInfo.style.display = "block";
    multiInfo.style.display = "none";
  } else {
    singleInputGroup.style.display = "none";
    multiInputGroup.style.display = "flex";
    singleInfo.style.display = "none";
    multiInfo.style.display = "block";
  }

  // Update URL to reflect mode change
  updateURLParams();
}

// Store address data for breakdown modal
let addressDataForBreakdown = [];

// Close breakdown modal
window.closeBreakdownModal = function () {
  document.getElementById("breakdownModal").style.display = "none";
};

// Show breakdown modal
window.showBreakdownModal = function (type) {
  console.log("showBreakdownModal called with type:", type);
  console.log(
    "addressDataForBreakdown length:",
    addressDataForBreakdown.length,
  );

  if (addressDataForBreakdown.length === 0) {
    console.warn("No address data available for breakdown");
    return;
  }

  const modal = document.getElementById("breakdownModal");
  const modalTitle = document.getElementById("modalTitle");
  const modalBody = document.getElementById("modalBody");

  let title = "";
  let htmlContent = "";

  if (type === "value") {
    title = "Total Wallet Value by Address";
  } else if (type === "balance") {
    title = "Total Balance by Address";
  } else if (type === "staked") {
    title = "Total Staked by Address";
  }

  modalTitle.textContent = title;

  // Generate breakdown HTML
  htmlContent = addressDataForBreakdown
    .map((data, index) => {
      let mainValue = 0;
      let mainValueIOTA = 0;
      let mainValueFiat = "";

      if (type === "value") {
        mainValue = data.totalValue;
        mainValueIOTA = mainValue / 1000000000;
        mainValueFiat = data.iotaPrice
          ? formatFiatValue(mainValueIOTA, data.iotaPrice, currentCurrency)
          : "Price unavailable";
      } else if (type === "balance") {
        mainValue = data.totalBalance;
        mainValueIOTA = mainValue / 1000000000;
        mainValueFiat = data.iotaPrice
          ? formatFiatValue(mainValueIOTA, data.iotaPrice, currentCurrency)
          : "Price unavailable";
      } else if (type === "staked") {
        mainValue = data.totalStaked;
        mainValueIOTA = mainValue / 1000000000;
        mainValueFiat = data.iotaPrice
          ? formatFiatValue(mainValueIOTA, data.iotaPrice, currentCurrency)
          : "Price unavailable";
      }

      return `
        <div class="breakdown-item">
          <div class="breakdown-address">
            <span class="address-number">#${index + 1}</span>
            <span>${data.address}</span>
          </div>
          <div class="breakdown-stats">
            <div class="breakdown-stat">
              <div class="breakdown-stat-label">${type === "value" ? "Total Value" : type === "balance" ? "Balance" : "Staked"}</div>
              <div class="breakdown-stat-value">${formatBalance(mainValue)} IOTA</div>
              <div class="breakdown-stat-fiat">${mainValueFiat}</div>
            </div>
            ${
              type === "value"
                ? `
            <div class="breakdown-stat">
              <div class="breakdown-stat-label">Balance</div>
              <div class="breakdown-stat-value">${formatBalance(data.totalBalance)} IOTA</div>
            </div>
            <div class="breakdown-stat">
              <div class="breakdown-stat-label">Staked</div>
              <div class="breakdown-stat-value">${formatBalance(data.totalStaked)} IOTA</div>
            </div>
            <div class="breakdown-stat">
              <div class="breakdown-stat-label">Est. Rewards</div>
              <div class="breakdown-stat-value">${formatBalance(data.totalEstimatedRewards)} IOTA</div>
            </div>
            `
                : ""
            }
          </div>
          ${data.error ? `<div style="color: #f44336; margin-top: 10px; font-size: 0.9em;">⚠️ ${data.error}</div>` : ""}
        </div>
      `;
    })
    .join("");

  modalBody.innerHTML = htmlContent;
  modal.style.display = "block";

  // Close modal when clicking outside
  modal.onclick = function (event) {
    if (event.target === modal) {
      closeBreakdownModal();
    }
  };
};

// Fetch stats for a single address (returns the data instead of displaying)
async function fetchSingleAddressData(address, currency) {
  // Fetch IOTA price
  const iotaPrice = await fetchIOTAPrice(currency);

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

  // Calculate staking information
  let totalStaked = 0;
  let totalEstimatedRewards = 0;
  const stakesList = [];

  if (stakesData && stakesData.length > 0) {
    for (const validator of stakesData) {
      for (const stake of validator.stakes) {
        const principal = parseInt(stake.principal);
        totalStaked += principal;

        if (stake.estimatedReward) {
          totalEstimatedRewards += parseInt(stake.estimatedReward);
        }

        stakesList.push({
          validatorAddress: validator.validatorAddress,
          principal: principal,
          status: stake.status,
          stakeRequestEpoch: stake.stakeRequestEpoch,
          stakeActiveEpoch: stake.stakeActiveEpoch,
          estimatedReward: stake.estimatedReward
            ? parseInt(stake.estimatedReward)
            : 0,
          stakedIotaId: stake.stakedIotaId,
        });
      }
    }
  }

  return {
    address: address,
    totalBalance: totalBalance,
    totalStaked: totalStaked,
    totalEstimatedRewards: totalEstimatedRewards,
    totalValue: totalBalance + totalStaked + totalEstimatedRewards,
    iotaBalance: iotaBalance,
    coinsData: coinsData,
    stakesData: stakesData,
    stakesList: stakesList,
    transactions: transactionsData.data || [],
    iotaPrice: iotaPrice,
  };
}

// Fetch and display stats for multiple addresses
async function fetchMultipleWalletStats() {
  const addressesText = document
    .getElementById("multipleAddresses")
    .value.trim();

  if (!addressesText) {
    showError("⚠️ Please enter at least one wallet address");
    return;
  }

  // Split by newlines and filter out empty lines
  const addresses = addressesText
    .split("\n")
    .map((addr) => addr.trim())
    .filter((addr) => addr.length > 0);

  if (addresses.length === 0) {
    showError("⚠️ Please enter at least one wallet address");
    return;
  }

  // Validate all addresses
  const invalidAddresses = [];
  for (const address of addresses) {
    if (!validateAddress(address)) {
      invalidAddresses.push(address);
    }
  }

  if (invalidAddresses.length > 0) {
    showError(
      `⚠️ Invalid address format for: ${invalidAddresses.join(", ")}<br>Addresses must start with "0x" followed by 64 hexadecimal characters.`,
    );
    return;
  }

  hideError();
  document.getElementById("loading").style.display = "block";
  document.getElementById("loadingMessage").textContent =
    "Initializing multi-address fetch...";
  hideProgress();
  document.getElementById("statsCard").classList.remove("visible");
  document.getElementById("searchBtnMulti").disabled = true;

  // Get selected currency
  currentCurrency = document.getElementById("currencySelectorMulti").value;

  try {
    // Show initial progress
    showProgress(0, addresses.length + 1, "Fetching IOTA price...");

    // Fetch IOTA price first
    currentIOTAPrice = await fetchIOTAPrice(currentCurrency);
    showProgress(1, addresses.length + 1, "IOTA price fetched ✓");

    // Fetch data for all addresses
    const allAddressData = [];
    for (let i = 0; i < addresses.length; i++) {
      const address = addresses[i];
      const addressShort =
        address.substring(0, 10) +
        "..." +
        address.substring(address.length - 6);

      showProgress(
        i + 1,
        addresses.length + 1,
        `Fetching address ${i + 1}/${addresses.length}: ${addressShort}`,
      );

      try {
        const data = await fetchSingleAddressData(address, currentCurrency);
        allAddressData.push(data);
      } catch (error) {
        console.error(`Error fetching data for ${address}:`, error);
        // Continue with other addresses even if one fails
        allAddressData.push({
          address: address,
          error: error.message,
          totalBalance: 0,
          totalStaked: 0,
          totalEstimatedRewards: 0,
          totalValue: 0,
          iotaBalance: null,
          coinsData: null,
          stakesData: null,
          stakesList: [],
          transactions: [],
          iotaPrice: currentIOTAPrice,
        });
      }

      // Small delay between fetches to show progress and be nice to the API
      if (i < addresses.length - 1) {
        await delay(200); // 200ms delay between addresses
      }
    }

    // Show final aggregation step
    showProgress(
      addresses.length + 1,
      addresses.length + 1,
      "Aggregating data from all addresses...",
    );

    // Store address data for breakdown modal
    addressDataForBreakdown = allAddressData;

    // Aggregate the data
    let combinedTotalBalance = 0;
    let combinedTotalStaked = 0;
    let combinedTotalEstimatedRewards = 0;
    let combinedCoinCount = 0;
    let combinedStakesList = [];
    let combinedTransactions = [];

    for (const data of allAddressData) {
      combinedTotalBalance += data.totalBalance;
      combinedTotalStaked += data.totalStaked;
      combinedTotalEstimatedRewards += data.totalEstimatedRewards;

      if (data.iotaBalance) {
        combinedCoinCount += data.iotaBalance.coinObjectCount;
      }

      combinedStakesList = combinedStakesList.concat(data.stakesList);

      // Add transactions with address reference
      const txWithAddress = data.transactions.map((tx) => ({
        ...tx,
        sourceAddress: data.address,
      }));
      combinedTransactions = combinedTransactions.concat(txWithAddress);
    }

    // Sort combined transactions by timestamp (newest first)
    combinedTransactions.sort((a, b) => {
      const timeA = a.timestampMs ? parseInt(a.timestampMs) : 0;
      const timeB = b.timestampMs ? parseInt(b.timestampMs) : 0;
      return timeB - timeA;
    });

    // Store for pagination
    allTransactions = combinedTransactions;
    displayedTransactionCount = allTransactions.length;
    currentAddress = null; // Clear since we have multiple addresses

    // Display results
    document.getElementById("walletInfoTitle").textContent =
      "Combined Wallet Information";
    document.getElementById("displayAddress").style.display = "none";

    // Display address list
    const addressList = document.getElementById("addressList");
    addressList.style.display = "block";
    addressList.innerHTML = allAddressData
      .map(
        (data, index) => `
          <div class="address-list-item">
            <span class="address-number">#${index + 1}</span>
            <span class="address-text">${data.address}</span>
            ${data.error ? `<span style="color: #f44336; font-size: 0.85em;">⚠️ ${data.error}</span>` : ""}
          </div>
        `,
      )
      .join("");

    const combinedTotalValue =
      combinedTotalBalance +
      combinedTotalStaked +
      combinedTotalEstimatedRewards;
    const combinedTotalBalanceIOTA = combinedTotalBalance / 1000000000;
    const combinedTotalStakedIOTA = combinedTotalStaked / 1000000000;
    const combinedTotalValueIOTA = combinedTotalValue / 1000000000;

    // Display combined totals
    document.getElementById("totalBalance").textContent =
      formatBalance(combinedTotalBalance) + " IOTA";
    document.getElementById("totalStaked").textContent =
      formatBalance(combinedTotalStaked) + " IOTA";
    document.getElementById("totalValue").textContent =
      formatBalance(combinedTotalValue) + " IOTA";

    // Display FIAT values
    if (currentIOTAPrice) {
      document.getElementById("totalBalanceFiat").textContent = formatFiatValue(
        combinedTotalBalanceIOTA,
        currentIOTAPrice,
        currentCurrency,
      );
      document.getElementById("totalStakedFiat").textContent = formatFiatValue(
        combinedTotalStakedIOTA,
        currentIOTAPrice,
        currentCurrency,
      );
      document.getElementById("totalValueFiat").textContent = formatFiatValue(
        combinedTotalValueIOTA,
        currentIOTAPrice,
        currentCurrency,
      );
    } else {
      document.getElementById("totalBalanceFiat").textContent = "";
      document.getElementById("totalStakedFiat").textContent = "";
      document.getElementById("totalValueFiat").textContent =
        "Price unavailable";
    }

    document.getElementById("coinCount").textContent = combinedCoinCount;
    document.getElementById("totalObjects").textContent =
      combinedCoinCount + "+";

    // Hide coins section for multiple addresses
    document.getElementById("coinsSection").style.display = "none";

    // Display combined staking information
    if (combinedStakesList.length > 0) {
      const stakingList = document.getElementById("stakingList");
      let stakingHtml = "";

      // Group stakes by validator
      const stakesByValidator = {};
      for (const stake of combinedStakesList) {
        if (!stakesByValidator[stake.validatorAddress]) {
          stakesByValidator[stake.validatorAddress] = [];
        }
        stakesByValidator[stake.validatorAddress].push(stake);
      }

      for (const [validatorAddress, stakes] of Object.entries(
        stakesByValidator,
      )) {
        stakingHtml += `
          <div class="validator-group">
            <div><strong>Validator:</strong></div>
            <div class="validator-address">
              <a href="https://mainnet.iota.guru/validators/${validatorAddress}" target="_blank" rel="noopener noreferrer">
                ${validatorAddress}
              </a>
            </div>
            <div style="margin-top: 10px;">
        `;

        for (const stake of stakes) {
          const principalIOTA = formatBalance(stake.principal);

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
                stake.estimatedReward > 0
                  ? `
                <div class="stake-detail">
                  <strong>Estimated Reward:</strong> ${formatBalance(stake.estimatedReward)} IOTA
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

      const stakingSummary = `
        <div class="info-text">
          <strong>Total Addresses:</strong> ${addresses.length}<br>
          <strong>Total Stakes:</strong> ${combinedStakesList.length}<br>
          <strong>Total Staked:</strong> ${formatBalance(combinedTotalStaked)} IOTA<br>
          <strong>Total Estimated Rewards:</strong> ${formatBalance(combinedTotalEstimatedRewards)} IOTA
        </div>
      `;
      stakingList.innerHTML = stakingHtml + stakingSummary;
      document.getElementById("stakingSection").style.display = "block";
    } else {
      document.getElementById("stakingSection").style.display = "none";
    }

    // Display combined transaction history
    if (combinedTransactions.length > 0) {
      displayTransactions();
      document.getElementById("transactionsSection").style.display = "block";
    } else {
      const transactionsList = document.getElementById("transactionsList");
      transactionsList.innerHTML = `
        <div class="no-transactions">
          No transactions found for these addresses.
        </div>
      `;
      document.getElementById("transactionsSection").style.display = "block";
    }

    document.getElementById("statsCard").classList.add("visible");

    // Make stat cards clickable in multi-mode
    console.log(
      "Setting up clickable cards. Address data count:",
      addressDataForBreakdown.length,
    );

    const totalValueCard = document.getElementById("totalValueCard");
    if (totalValueCard) {
      totalValueCard.style.cursor = "pointer";
      totalValueCard.classList.add("clickable-stat");
      totalValueCard.onclick = function (e) {
        console.log("Total Value Card clicked");
        window.showBreakdownModal("value");
      };
    }

    const totalBalanceCard = document.getElementById("totalBalanceCard");
    if (totalBalanceCard) {
      totalBalanceCard.style.cursor = "pointer";
      totalBalanceCard.classList.add("clickable-stat");
      totalBalanceCard.onclick = function (e) {
        console.log("Total Balance Card clicked");
        window.showBreakdownModal("balance");
      };
    }

    const totalStakedCard = document.getElementById("totalStakedCard");
    if (totalStakedCard) {
      totalStakedCard.style.cursor = "pointer";
      totalStakedCard.classList.add("clickable-stat");
      totalStakedCard.onclick = function (e) {
        console.log("Total Staked Card clicked");
        window.showBreakdownModal("staked");
      };
    }

    // Update URL with parameters
    updateURLParams();
  } catch (error) {
    console.error("Error:", error);
    showError(
      `❌ Error fetching wallet data: ${error.message}. Please check the addresses and try again.`,
    );
  } finally {
    hideProgress();
    document.getElementById("loading").style.display = "none";
    document.getElementById("searchBtnMulti").disabled = false;
  }
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
  document.getElementById("loadingMessage").textContent =
    "Fetching wallet data...";
  hideProgress();
  document.getElementById("statsCard").classList.remove("visible");
  document.getElementById("searchBtn").disabled = true;

  // Get selected currency
  currentCurrency = document.getElementById("currencySelector").value;

  // Reset multi-address UI elements
  document.getElementById("walletInfoTitle").textContent = "Wallet Information";
  document.getElementById("displayAddress").style.display = "block";
  document.getElementById("addressList").style.display = "none";

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

    // Clear address data for breakdown (single mode)
    addressDataForBreakdown = [];

    // Remove clickable behavior from stat cards in single mode
    document.getElementById("totalValueCard").style.cursor = "default";
    document
      .getElementById("totalValueCard")
      .classList.remove("clickable-stat");
    document.getElementById("totalValueCard").onclick = null;

    document.getElementById("totalBalanceCard").style.cursor = "default";
    document
      .getElementById("totalBalanceCard")
      .classList.remove("clickable-stat");
    document.getElementById("totalBalanceCard").onclick = null;

    document.getElementById("totalStakedCard").style.cursor = "default";
    document
      .getElementById("totalStakedCard")
      .classList.remove("clickable-stat");
    document.getElementById("totalStakedCard").onclick = null;

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

    // Update URL with parameters
    updateURLParams();
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

    // If this transaction has a sourceAddress (multi-address mode), show it
    if (tx.sourceAddress) {
      transactionsHtml += `
                        <div class="transaction-detail" style="margin-top: 8px; padding: 8px; background: rgba(0, 229, 204, 0.1); border-radius: 6px;">
                            <strong>Account:</strong> <span class="coin-id" style="font-size: 0.8em;">${tx.sourceAddress}</span>
                        </div>
                    `;
    }

    // Display balance changes (only for the relevant address)
    if (tx.balanceChanges && tx.balanceChanges.length > 0) {
      // Filter balance changes to only show those for the current/source address
      const addressToFilter = tx.sourceAddress || currentAddress;
      const relevantChanges = tx.balanceChanges.filter((change) => {
        const owner = change.owner?.AddressOwner || change.owner || "";
        return owner === addressToFilter;
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
  // Multi-address mode doesn't support pagination (all transactions already loaded)
  if (
    currentAddress === null &&
    allTransactions.length > 0 &&
    allTransactions[0].sourceAddress
  ) {
    const loadMoreBtn = document.getElementById("loadMoreBtn");
    if (loadMoreBtn) {
      loadMoreBtn.disabled = true;
      loadMoreBtn.textContent = "All transactions loaded";
    }
    return;
  }
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
  // Load URL parameters first
  loadURLParams();

  // Display address history on page load
  displayAddressHistory();

  // Allow Enter key to trigger search (single address)
  document
    .getElementById("walletAddress")
    .addEventListener("keypress", function (event) {
      if (event.key === "Enter") {
        fetchWalletStats();
      }
    });

  // Allow Ctrl+Enter to trigger search (multi-address)
  document
    .getElementById("multipleAddresses")
    .addEventListener("keydown", function (event) {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        fetchMultipleWalletStats();
      }
    });

  // Update URL as user types in single address mode
  document
    .getElementById("walletAddress")
    .addEventListener("input", function () {
      updateURLParams();
    });

  // Update URL as user types in multiple address mode
  document
    .getElementById("multipleAddresses")
    .addEventListener("input", function () {
      updateURLParams();
    });

  // Update URL when currency changes (single mode)
  document
    .getElementById("currencySelector")
    .addEventListener("change", function () {
      // Sync with multi mode selector
      document.getElementById("currencySelectorMulti").value = this.value;
      updateURLParams();
    });

  // Update URL when currency changes (multi mode)
  document
    .getElementById("currencySelectorMulti")
    .addEventListener("change", function () {
      // Sync with single mode selector
      document.getElementById("currencySelector").value = this.value;
      updateURLParams();
    });

  // Close modal with ESC key
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      closeBreakdownModal();
    }
  });
});
