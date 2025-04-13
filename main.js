const { JsonRpcProvider, Contract } = require('ethers');
const axios = require('axios');

// Thiết lập RPC & Hợp đồng
const network_URL = 'https://gensyn-testnet.g.alchemy.com/v2/API_KEY'; // https://dashboard.alchemy.com/apps
const provider = new JsonRpcProvider(network_URL);
const contractAddress = '0x2fC68a233EF9E9509f034DD551FF90A79a0B8F82';
const contractABI = [
  'function currentRound() view returns (uint256)',
  'function getTotalWins(string peerId) view returns (uint256)'
];
const contract = new Contract(contractAddress, contractABI, provider);

// Thông tin peerId
const peerIds = [
  'peerID1',
  'peerID2' // and so on
];

// Telegram Bot
const TELEGRAM_BOT_TOKEN = 'xxx';
const TELEGRAM_CHAT_ID = 'xxx';

async function sendTelegramMessage(message) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    await axios.post(url, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message
    });
  } catch (error) {
    console.error('Telegram Error:', error.message);
  }
}

async function getCurrentRound() {
  return (await contract.currentRound()).toString();
}

async function getWinsForAllPeers() {
  const results = {};
  for (const peerId of peerIds) {
    const wins = await contract.getTotalWins(peerId);
    results[peerId] = wins.toString();
  }
  return results;
}

// Biến theo dõi
let lastRound = null;
let lastWins = {};

async function performChecks(round, initialWins) {
  let unchangedPeers = peerIds.filter(peerId => initialWins[peerId] === lastWins[peerId]);
  let hasChanged = false;

  for (let i = 1; i <= 3; i++) {
    console.log(`[CHECK ${i}] Waiting ${i === 1 ? 0 : 5} mins...`);
    if (i > 1) await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));

    const checkWins = await getWinsForAllPeers();
    let changedPeers = [];

    for (const peerId of peerIds) {
      if (checkWins[peerId] !== lastWins[peerId]) {
        changedPeers.push(`${peerId}: ${lastWins[peerId]} ➜ ${checkWins[peerId]}`);
        lastWins[peerId] = checkWins[peerId];
      }
    }

    if (changedPeers.length > 0) {
      await sendTelegramMessage(`✅ Round ${round} - Update on check ${i}:\n${changedPeers.join('\n')}`);
      hasChanged = true;
      break;
    }
  }

  if (!hasChanged) {
    await sendTelegramMessage(`⚠️ Round ${round} - No changes in getTotalWins after 3 checks.`);
  }
}

async function monitor() {
  try {
    const currentRound = await getCurrentRound();
    console.log(`[CHECK] currentRound = ${currentRound}`);

    if (lastRound === null) {
      lastRound = currentRound;
      lastWins = await getWinsForAllPeers();
      console.log('[INIT] lastWins:', lastWins);
      return;
    }

    if (currentRound !== lastRound) {
      console.log(`[NEW ROUND] Round changed: ${lastRound} → ${currentRound}`);
      const currentWins = await getWinsForAllPeers();

      // Bắt đầu thực hiện 3 lần check
      await performChecks(currentRound, currentWins);

      // Cập nhật lastRound sau khi kiểm tra xong
      lastRound = currentRound;
    }
  } catch (err) {
    console.error('Monitor error:', err.message);
  }
}

// Chạy mỗi 10 phút
monitor(); // Lần đầu
setInterval(monitor, 10 * 60 * 1000); // Định kỳ
