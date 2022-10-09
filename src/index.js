/* eslint-disable no-multi-spaces */
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
//  Imports
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
import { exit } from 'process'
import { ethers } from 'ethers'
import Utils from './utils.js'
const utils = new Utils()

const consoleInfo = utils.consoleInfo

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
//  Global Variables
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
let db, blockchain
const network = utils.getNetwork()
const service = utils.getService()
const contract = service.contract

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
//  Entry Point
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
async function starter () {
  // Welcome message
  utils.welcomeMessage()

  // Open database
  await utils.db.openDatabase()

  // Setup RPC & Contract
  await setupWeb3()

  // Reload all events from blockchain 1-by-1 and compare to DB
  reloadEventsFromBlockchain().then(() => {
    eventsListenter()
  })
}

// ____  _            _        _           _
// | __ )| | ___   ___| | _____| |__   __ _(_)_ __
// |  _ \| |/ _ \ / __| |/ / __| '_ \ / _` | | '_ \
// | |_) | | (_) | (__|   < (__| | | | (_| | | | | |
// |____/|_|\___/ \___|_|\_\___|_| |_|\__,_|_|_| |_|
// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * ** * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
// BLOCKCHAIN: Setup RPC & Contract
// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * ** * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
const setupWeb3 = async () => {
  consoleInfo('INFO: Web3 RPC is initializing.', false)
  try {
    // Setup JSON RPC Provider
    blockchain = new ethers.providers.JsonRpcProvider(network.rpc)

    // Get the instance of the contract
    contract.instance = new ethers.Contract(contract.address, contract.json.abi, blockchain)

    // Connect to contract instance
    contract.instance.connect(blockchain)
    console.log('=> Connected successfully\n')
  }
  catch (e) {
    console.log(`ERROR while Web3 Setup. Check correct RPC / ABI / Contract Address in configuration\n\n`, e); exit(1)
  }
  return true
}
// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * ** * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
// BLOCKCHAIN: Loop the blockain by requesting info of 10,000 blocks
// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * ** * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
const reloadEventsFromBlockchain = async () => {
  try {
    consoleInfo('INFO: Reloading events from blockchain')

    // Starting block is contract deploy transaction
    const startBlock = await blockchain.send('eth_getTransactionReceipt', [contract.deployTx]).then(async (r) => await utils.getIntFromHex(r.blockNumber))

    // End block is current block number
    const endBlock = await blockchain.getBlockNumber()

    // Aux Var to temporarily store received events
    let allEvents = []

    // Log info
    console.log(`=> Contract TxId: ${contract.deployTx}`)
    console.log(`=> Contract deployed at block: ${startBlock}`)
    console.log(`=> Current block is: ${endBlock}`)

    // Loop by requesting 10,000 blocks
    for (let i = startBlock; i < endBlock; i += 10000) {

      // Relative start & end of block
      const _startBlock = i; 
      const _endBlock = Math.min(endBlock, i + 9999)

      // Calculate decrease %
      const percent = parseFloat((endBlock - _startBlock) / endBlock * 100).toFixed(2)

      // Log info
      console.log(`=> ${_startBlock}/${endBlock} - ${endBlock - _startBlock} blocks remaining (${parseFloat(100 - percent).toFixed(2)}%)`)

      // Get the important stuff here, all the events br0h.
      const events = await contract.instance.queryFilter('*', _startBlock, _endBlock)

      // Add received events to array and keep going!
      allEvents = [...allEvents, ...events]
    }

    // Log info
    console.log('=> END')
    console.log('')
    consoleInfo('INFO: Syncing with db.')

    // Now loop each received event that is stored in array and insert in db if not present
    for (const element of allEvents) {
      const eventType = element.event
      const txHash = element.transactionHash

      // Pick only wanted events
      if (eventType === 'BuyEggs' || eventType === 'HatchEggs' || eventType === 'SellEggs' || eventType === 'ReceivedFromLottery') {
        let message, data, from = 'NULL'
        const eventDate = await utils.getEventDate(element.args._timestamp)
        const timestamp = await utils.getIntFromHex(element.args._timestamp)
        if (eventType === 'BuyEggs' || eventType === 'HatchEggs' || eventType === 'SellEggs') from = element.args._from

        switch (element.event) {
          case 'BuyEggs':
            data = await ethers.utils.formatEther(element.args._amount)
            message = `=> ${eventDate} || ${from} has bought ${data}`
            break
          case 'HatchEggs':
            data = await utils.getIntFromHex(element.args._newMiners)
            message = `=> ${eventDate} || ${from} has hatched ${data}`
            break
          case 'SellEggs':
            data = await ethers.utils.formatEther(element.args._eggsValues)
            message = `=> ${eventDate} || ${from} has sold ${data}`
            break
          case 'ReceivedFromLottery':
            data = await ethers.utils.formatEther(element.args._lotteryValue)
            message = `=> ${eventDate} || received ${data} from lottery`
        }
        console.log(message)

        // Add record to database if not already added
        const r = await utils.db.isEventInDatabase(timestamp, eventType, from, data)
        if (r === true) {
          console.log('=> Record already exists.')
        } else {
          console.log('=> Record not found in db, now adding.')
          await utils.db.insertEvent(element.transactionHash, timestamp, eventType, from, data)
          console.log('=> Inserted.')
        }
        console.log('')
      }
    }
    console.log('=> Finished sync with db')
    console.log('')
    return true
  } catch (e) {
    console.log('error is:' + e)
  }
}

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
// BLOCKCHAIN: Event Listeners Initializer
// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
const eventsListenter = async () => {

  consoleInfo('INFO: Event Listeners are initializing')

  // Event: BuyEggs
  contract.instance.on('BuyEggs', async (_timestamp, _from, _amount, event) => {
    // Convert Wei to Eth
    const ethValue = await ethers.utils.formatEther(_amount)

    // Log info
    console.log('---------------------------------------------------------------------------------------------------------------')
    console.log(`(!) BuyEggs Event [${_timestamp}] ${_from} has bought ${ethValue} ${contract.coinName}`)
    console.log('---------------------------------------------------------------------------------------------------------------')

    // Insert event
    await utils.db.insertEvent(event.transactionHash, _timestamp, 'BuyEggs', _from, ethValue)
  })
  console.log('=> OK - RPC: BuyEggs')

  // Event: SellEggs
  contract.instance.on('SellEggs', async (_timestamp, _from, _eggsValues, event) => {
    // Convert Wei to Eth
    const ethValue = await ethers.utils.formatEther(_eggsValues)

    // Log info
    console.log('---------------------------------------------------------------------------------------------------------------')
    console.log(`(!) SellEggs Event [${_timestamp}] ${_from} has bought ${ethValue} ${contract.coinName}`)
    console.log('---------------------------------------------------------------------------------------------------------------')

    // Insert event
    await utils.db.insertEvent(event.transactionHash, _timestamp, 'SellEggs', _from, ethValue)

  })
  console.log('=> OK - RPC: SellEggs')

  // Event: HatchEggs
  contract.instance.on('HatchEggs', async (_timestamp, _from, _newMiners, event) => {
    // Log info
    console.log('---------------------------------------------------------------------------------------------------------------')
    console.log(`(!) HatchEggs Event [${_timestamp}] ${_from} has hatched ${_newMiners} new miners`)
    console.log('---------------------------------------------------------------------------------------------------------------')

    // Insert event
    await utils.db.insertEvent(event.transactionHash, _timestamp, 'HatchEggs', _from, _newMiners)

  })
  console.log('=> OK - RPC: HatchEggs')

  // Event: ReceivedFromLottery
  contract.instance.on('ReceivedFromLottery', async (_timestamp, _lotteryValue , event) => {
    const ethValue = await ethers.utils.formatEther(_lotteryValue)
    const realDate = await utils.getEventDate(_timestamp)
    // Log info
    console.log('---------------------------------------------------------------------------------------------------------------')
    console.log(`(!) ReceivedFromLottery Event [${realDate}] received ${ethValue} ${contract.coinName} from lottery`)
    console.log('---------------------------------------------------------------------------------------------------------------')

    // Insert event
    await utils.db.insertEvent(event.transactionHash, _timestamp, 'ReceivedFromLottery', 'NULL', _lotteryValue)

  })
  console.log('=> OK - RPC: ReceivedFromLottery')
}

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
starter()
// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
